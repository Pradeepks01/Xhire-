import os
import uuid
import logging
from celery import Celery
from sqlmodel import Session, select
from .db import engine
from .X_models import InterviewSession
from .X_hire_schemas import DAR3, InterviewLogItem
from .X_coordinator import Coordinator
from .X_config import AGENT_NAME, RUBRICS, DEFAULT_BASE_URL, DEFAULT_API_KEY, DEFAULT_MODEL, DEFAULT_EMB, KB_DIR
from .X_guards import input_guard_llm
from .X_llm_client import get_client
from .X_retriever import KBIndex
from .ai_detector import detect_ai_text

from concurrent.futures import ThreadPoolExecutor

# Thread pool for local async execution when no message broker is running
executor = ThreadPoolExecutor(max_workers=4)

# --- Celery App Setup ---
BROKER_URL = os.environ.get("BROKER_URL")
RESULT_BACKEND = os.environ.get("RESULT_BACKEND", BROKER_URL)

if BROKER_URL:
    celery_app = Celery("XHireWorker", broker=BROKER_URL, backend=RESULT_BACKEND)
    celery_app.conf.update(
        task_serializer="json",
        result_serializer="json",
        accept_content=["json"],
        timezone="UTC",
        enable_utc=True,
        broker_connection_retry_on_startup=True,
    )
else:
    celery_app = Celery("XHireWorker")
    celery_app.conf.update(
        task_always_eager=True,
        task_eager_propagates=True,
    )
log = logging.getLogger(__name__)

# --- Helper to get a coordinator ---
def get_coordinator_and_dar(session: Session, session_uuid: str) -> tuple[Coordinator, DAR3, InterviewSession, str, str]:
    """Helper to load all objects needed for a task."""

    # 1. Get the SQLModel session
    # We need to query by session_uuid, not primary key
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise Exception(f"InterviewSession not found: {session_uuid}")

    # 2. Re-hydrate the DAR3 object from the JSON blob
    dar = DAR3(**db_session.dar_data)

    # 3. Get coordinator
    client = get_client(DEFAULT_BASE_URL, DEFAULT_API_KEY)
    kb = KBIndex(client, DEFAULT_EMB)
    kb.load_folder(KB_DIR) # In production, you'd init this once
    coord = Coordinator(client, DEFAULT_MODEL, kb)

    # 4. Get current round and agent
    current_round = dar.meta.get("routing", {}).get("current_round", "manager")
    agent = AGENT_NAME.get(current_round, "ManagerInterviewer")

    return coord, dar, db_session, current_round, agent

# --- Celery Tasks ---

@celery_app.task(name="start_interview_task")
def start_interview_task(session_uuid: str):
    """
    Task to run Intake, Resume Assessment, and Evaluation Architect.
    This now runs AFTER the candidate clicks 'Start'.
    """
    with Session(engine) as session:
        try:
            # 1. Get all our objects
            coord, dar, db_session, current_round, agent = get_coordinator_and_dar(session, session_uuid)

            # 2. Run the Intake logic (which we removed from the API)
            dar = coord.intake(
                dar, 
                dar.meta.get("candidate_name", ""), 
                dar.inputs.get("jd_text", ""), 
                dar.inputs.get("cv_text", "")
            )

            # 3. Run the AI tasks (this is the slow part)
            dar = coord.assess_resume(dar)
            dar = coord.evaluation_architect(dar)

            # 4. Save the final state
            db_session.dar_data = dar.model_dump()
            db_session.status = "started" # <-- Set status to "started"
            session.add(db_session)
            session.commit()

        except Exception as e:
            # If AI fails, set status to "failed"
            log.error(f"Error in start_interview_task: {e}")
            with Session(engine) as error_session:
                db_session = error_session.exec(
                    select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
                ).first()
                if db_session:
                    db_session.status = "failed"
                    dar.errors.append(f"Task Error: {e}")
                    db_session.dar_data = dar.model_dump()
                    error_session.add(db_session)
                    error_session.commit()


@celery_app.task(name="process_answer_task")
def process_answer_task(session_uuid: str, answer_text: str, q_id: str, category: str, subtopic: str, is_follow_up: bool, context: list, question: str):
    """
    Task to evaluate a candidate's answer.
    This is the core logic from your Streamlit 'submit' button.
    """
    with Session(engine) as session:
        try:
            coord, dar, db_session, current_round, agent = get_coordinator_and_dar(session, session_uuid)

            # 1. Run Input Guard
            allowed, sanitized, categories = input_guard_llm(coord.client, coord.model, answer_text or "")
            answer_given = bool(answer_text and answer_text.strip()) and allowed
            sanitized_final = sanitized if answer_given else "(no answer)"

            # 2. Find the placeholder Log Item using q_id
            item = next((i for i in dar.interview_log if i.q_id == q_id), None)

            if not item:
                # This is a more serious error now. It means the frontend sent a q_id
                # that doesn't exist in the log.
                log.error(f"FATAL: q_id {q_id} not found in interview log for session {session_uuid}.")
                # Still, create a fallback item to avoid crashing the whole process
                item = InterviewLogItem(
                    q_id=q_id, # Use the q_id from the request
                    agent=agent,
                    category=category,
                    subtopic=subtopic,
                    question=question,
                    is_follow_up=is_follow_up
                )
                dar.interview_log.append(item)
                dar.errors.append(f"State Error: q_id {q_id} not found, created fallback item.")

            item.status = "Answered" # Mark as answered
            item.result["input_guard_categories"] = categories
            item.result["input_guard_response"] = ", ".join(categories) if categories else "safe"
            item.user_answer = sanitized_final

            # 2b. Run AI-Generated Text Detection (Perplexity & Burstiness)
            ai_eval = detect_ai_text(answer_text or "")
            item.result["ai_detection"] = ai_eval.model_dump()
            log.info(f"AI Detection for {item.q_id}: prob={ai_eval.ai_probability}%, burstiness={ai_eval.burstiness}, ppl={ai_eval.perplexity}")

            # The question text is now certain because we have the exact item
            question_text = item.question

            # 3. Handle Safety Violations
            if not allowed and categories:
                dar.audit["safety_violations"].append({
                    "q_id": item.q_id,
                    "question": question_text,
                    "answer": sanitized_final,
                    "categories": categories
                })

            # 4. Evaluate (if not intro or blocked)
            if category == "Intro":
                item.result["rationale"] = "Candidate introduction."
                item.result["transition_phrase"] = "Thank you for that introduction."
                # --- FIX: Manually handle the Intro state ---
                # The intro question doesn't have a score, so we don't use apply_result.
                # We just need to mark it as 'Covered' so we can move on.
                if "General" in dar.categories and "Introduction" in dar.categories["General"].subtopics:
                    dar.categories["General"].subtopics["Introduction"].status = "Covered"
                # No need to call coord.apply_result, as it will fail.

            elif not allowed:
                item.result["rationale"] = "Answer blocked by safety filter."
                item.result["transition_phrase"] = "I cannot accept that answer. Let's move on."
                if category in dar.categories and subtopic in dar.categories[category].subtopics:
                    coord.apply_result(dar, category, subtopic, -8, "Answer blocked by safety filter", "I cannot accept that answer. Let's move on.", "", False)

            else:
                # This is the main evaluation logic
                current_confidence = 0
                current_depth = 1
                if category in dar.categories and subtopic in dar.categories[category].subtopics:
                     current_confidence = dar.categories[category].subtopics[subtopic].confidence
                     current_depth = dar.categories[category].subtopics[subtopic].depth_level

                item.result["confidence_before"] = current_confidence
                item.result["depth_before"] = current_depth
                item.result["rubric_used"] = RUBRICS.get(current_round, {})

                delta, rationale, acknowledgement, transition, ev_snips, ev_conf, model_conf, fusion = coord.evaluate_answer(
                    dar, question_text, sanitized_final, category, subtopic, dar.interview_log
                )

                item.evidence = ev_snips
                item.result["evidence_confidence"] = ev_conf
                item.result["model_confidence"] = model_conf
                item.result["fusion_factor"] = fusion
                item.result["transition_phrase"] = transition

                if category in dar.categories and subtopic in dar.categories[category].subtopics:
                     before_c, dlt, after_c, before_d, after_d = coord.apply_result(dar, category, subtopic, delta, rationale, acknowledgement, sanitized_final, answer_given)
                     item.result["confidence_delta"] = dlt
                     item.result["confidence_after"] = after_c
                     item.result["rationale"] = rationale
                     item.result["depth_after"] = after_d
                else:
                     item.result["rationale"] = rationale


            # Compute aggregate AI integrity stats across all answered questions
            ai_reports = [i.result.get("ai_detection") for i in dar.interview_log if i.result and "ai_detection" in i.result]
            if ai_reports:
                avg_human = sum(r.get("human_likeness_score", 100.0) for r in ai_reports) / len(ai_reports)
                flagged_count = sum(1 for r in ai_reports if r.get("is_flagged", False))
                any_flagged = flagged_count > 0
                db_session.ai_integrity_score = round(avg_human, 1)
                db_session.is_ai_flagged = any_flagged

                if "ai_integrity" not in dar.audit:
                    dar.audit["ai_integrity"] = {}
                dar.audit["ai_integrity"] = {
                    "overall_integrity_score": round(avg_human, 1),
                    "is_flagged": any_flagged,
                    "evaluated_answers_count": len(ai_reports),
                    "flagged_answers_count": flagged_count,
                    "verdict": "Flagged for AI Generation" if any_flagged else "Verified Human Authorship"
                }

            # --- FIX: Set status back to started ---
            db_session.status = "started"
            db_session.dar_data = dar.model_dump()
            session.add(db_session)
            session.commit()

        except Exception as e:
            # Robust fallback: Ensure question is marked as answered even if an unexpected exception occurs
            log.error(f"Error in process_answer_task for session {session_uuid}: {e}", exc_info=True)
            session.rollback()
            with Session(engine) as recovery_session:
                try:
                    db_s = recovery_session.exec(
                        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
                    ).first()
                    if db_s:
                        dar_dict = dict(db_s.dar_data or {})
                        log_list = dar_dict.get("interview_log", [])
                        target = next((i for i in log_list if i.get("q_id") == q_id), None)
                        if not target and log_list:
                            target = log_list[-1]
                        if target:
                            target["status"] = "Answered"
                            target["user_answer"] = answer_text or "(answer recorded)"
                            target.setdefault("result", {})["rationale"] = "Answer recorded; fallback evaluation engaged."
                            target["result"]["acknowledgement"] = "Thank you for your response."
                        dar_dict.setdefault("errors", []).append(f"Evaluation fallback engaged: {e}")
                        db_s.dar_data = dar_dict
                        db_s.status = "started"
                        recovery_session.add(db_s)
                        recovery_session.commit()
                except Exception as rec_err:
                    log.error(f"Recovery session failed: {rec_err}")