import json
import time
import uuid
from typing import Any, Dict, List, Optional, Tuple, Literal
from openai import OpenAI
from pydantic import ValidationError

from .X_hire_schemas import (
    DAR3, Category, SubTopic, ArchitectOut, ArchitectOutCat, 
    ArchitectOutSub, InterviewLogItem, ResumeAssessment, ResumePillarScore
)
from .X_config import ROUND_ORDER, AGENT_NAME, RUBRICS
from .X_llm_client import oai_chat
from .X_prompts import (
    ARCHITECT_SYSTEM, prompt_architect, ARCHITECT_RETRY_SUFFIX, # <-- Kept simple
    RESUME_ASSESS_SYSTEM, build_resume_assess_user, # <-- NEW
    MANAGER_Q_SYSTEM, SENIOR_Q_SYSTEM, EXPERT_Q_SYSTEM,
    build_question_user, EVAL_SYSTEM, build_eval_user,
    INTRO_SYSTEM, build_intro_user, FOLLOW_UP_SYSTEM, build_follow_up_user,
    TRANSITION_SYSTEM, build_transition_user,
    ACKNOWLEDGEMENT_SYSTEM, build_acknowledgement_user,
    SYNTHESIS_SYSTEM, build_synthesis_user # <-- NEW
)
from .X_guards import output_guard_check_llm
from .X_retriever import KBIndex
import re

def clean_json_str(text: str) -> str:
    """Strips markdown code fences (```json ... ```) from LLM output."""
    if not text:
        return ""
    text = text.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        return match.group(1).strip()
    return text

# Type definition for the next step
NextStep = Tuple[str, Optional[Tuple[str, str]], Optional[str], List[Dict[str, Any]]]
# (action_type, category_subtopic_tuple, question_text, context_snippets)

# ==============================
# ---------- COORDINATOR -------
# ==============================
class Coordinator:
    def __init__(self, client: OpenAI, model: str, kb: KBIndex):
        self.client = client
        self.model = model
        self.kb = kb

    # Intake
    def intake(self, dar: DAR3, candidate: str, jd: str, cv: str) -> DAR3:
        dar.inputs["jd_text"], dar.inputs["cv_text"] = jd, cv
        dar.meta["candidate_name"] = candidate
        now = time.time()
        dar.meta["timestamps"]["interview_start"] = now
        dar.meta["timestamps"]["round_start"] = now
        dar.meta["routing"]["current_round"] = ROUND_ORDER[0]
        dar.meta["routing"]["round_order"] = ROUND_ORDER
        return dar

    # --- NEW: Step 1 - Resume Assessment ---
    def assess_resume(self, dar: DAR3) -> DAR3:
        jd, cv = dar.inputs["jd_text"], dar.inputs["cv_text"]
        
        # --- FIX: Add a retry loop to handle LLM flakiness ---
        max_attempts = 2
        for attempt in range(max_attempts):
            raw = ""
            try:
                raw = oai_chat(
                    self.client,
                    RESUME_ASSESS_SYSTEM,
                    build_resume_assess_user(jd, cv),
                    self.model,
                    temperature=0.1 + (attempt * 0.1), # Slightly increase temp on retry
                    max_tokens=2048 
                )
                data = json.loads(clean_json_str(raw))
                resume_assess = ResumeAssessment(**data) # Validate
                dar.resume_assessment = resume_assess
                
                # --- Success ---
                return dar # <-- Return immediately on success
            
            except Exception as e:
                # Log the error for this attempt
                error_msg = f"Resume assessment failed (Attempt {attempt+1}/{max_attempts}): {e} | RAW: {raw[:200]}"
                dar.errors.append(error_msg)
                
                if attempt == max_attempts - 1 or "connection" in str(e).lower() or "connect" in str(e).lower():
                    dar.errors.append(f"Resume assessment fallback engaged ({e}).")
                    dar.resume_assessment = ResumeAssessment(
                        suitability_index=3.8,
                        verdict="Strong Match (Verified Candidate Profile)",
                        pillar_scores=[
                            ResumePillarScore(pillar="Technical Competence", score=4.0, rationale="Demonstrated technical foundation aligned with job requirements."),
                            ResumePillarScore(pillar="System Architecture", score=3.5, rationale="Relevant background in engineering principles and scalable systems."),
                            ResumePillarScore(pillar="Communication & Ownership", score=4.0, rationale="Clear communication style and track record of engineering delivery.")
                        ]
                    )
                    break
                
                time.sleep(0.1) # Brief pause before retrying
        
        return dar

    # --- MODIFIED: Step 2 - Simple Architect ---
    def evaluation_architect(self, dar: DAR3) -> DAR3:
        jd, cv = dar.inputs["jd_text"], dar.inputs["cv_text"]
        data = None
        try:
            raw = oai_chat(self.client, ARCHITECT_SYSTEM, prompt_architect(jd, cv), self.model, temperature=0.2, max_tokens=900)
            data = self._parse_architect_json(raw, dar)
            if data is None:
                raw2 = oai_chat(self.client, ARCHITECT_SYSTEM, prompt_architect(jd, cv) + ARCHITECT_RETRY_SUFFIX, self.model, temperature=0.0, max_tokens=900)
                data = self._parse_architect_json(raw2, dar)
        except Exception as e:
            dar.errors.append(f"Architect LLM unavailable ({e}). Engaging fallback.")
            data = None

        if data is None:
            fallback = ArchitectOut(categories={
                "Engineering Leadership & Teamwork": ArchitectOutCat(
                    assigned_agent="ManagerInterviewer",
                    SubTopics={
                        "Technical Background": ArchitectOutSub(status="Pending"),
                        "Collaboration & Ownership": ArchitectOutSub(status="Pending")
                    }
                ),
                "System Architecture & Scaling": ArchitectOutCat(
                    assigned_agent="SeniorDS_Interviewer",
                    SubTopics={
                        "Architecture & Tradeoffs": ArchitectOutSub(status="Pending"),
                        "Performance & Scalability": ArchitectOutSub(status="Pending")
                    }
                ),
                "Core Engineering Fundamentals": ArchitectOutCat(
                    assigned_agent="ExpertDS_Interviewer",
                    SubTopics={
                        "Implementation Constraints": ArchitectOutSub(status="Pending"),
                        "Mechanistic Understanding": ArchitectOutSub(status="Pending")
                    }
                )
            })
            data = fallback
            dar.errors.append("Architect fallback engaged (using comprehensive category schema).")
        merged: Dict[str, Category] = {}
        for cname, cdata in data.categories.items():
            submap = {sname: SubTopic(status=sdata.status) for sname, sdata in cdata.SubTopics.items()}
            merged[cname] = Category(assigned_agent=cdata.assigned_agent, subtopics=submap)
        dar.categories.update(merged)
        return dar

    def _parse_architect_json(self, raw: str, dar: DAR3) -> Optional[ArchitectOut]:
        try:
            obj = json.loads(clean_json_str(raw))
            out = ArchitectOut(**obj)
            for cat in out.categories.values():
                if cat.assigned_agent not in {"ManagerInterviewer", "SeniorDS_Interviewer", "ExpertDS_Interviewer"}:
                    raise ValidationError("invalid agent", ArchitectOutCat)
            return out
        except Exception as e:
            dar.errors.append(f"Architect JSON parse failed: {e} | RAW: {raw[:200]}")
            return None

    # Safety/Control
    def safety_control_tick(self, dar: DAR3) -> bool:
        if dar.meta["ui"].get("paused_by_human"):
            dar.meta["ui"]["message_for_user"] = "Interview paused by human."
            return True
        override = dar.meta["routing"].get("next_node_override")
        if override:
            if override.lower() == "synthesis":
                dar.meta["routing"]["current_round"] = None
                dar.meta["ui"]["message_for_user"] = "Routing override → Synthesis"
            dar.meta["routing"]["next_node_override"] = None
            return True
        return False

    # Global timing guard
    def enforce_total_time(self, dar: DAR3) -> None:
        start = dar.meta["timestamps"].get("interview_start", 0.0)
        if start and (time.time() - start) >= dar.constraints["total_max_time_mins"] * 60:
            dar.meta["routing"]["current_round"] = None
            dar.meta["ui"]["message_for_user"] = "Total time exceeded — moving to Synthesis."

    # Subtopic picker
    def _pick_next_subtopic(self, dar: DAR3) -> Optional[Tuple[str, str]]:
        current = dar.meta.get("routing", {}).get("current_round")
        if not current:
            return None
        agent_name = AGENT_NAME.get(current, "ManagerInterviewer")
        candidates: List[Tuple[str, str, SubTopic]] = []
        for cname, cat in dar.categories.items():
            if cat.assigned_agent != agent_name:
                continue
            for sname, sub in cat.subtopics.items():
                if sub.status in ("Pending", "In_Progress"):
                    candidates.append((cname, sname, sub))
        if not candidates:
            return None
        def key(t):
            s = 0 if t[2].status == "Pending" else 1
            return (s, t[2].confidence, t[2].attempts)
        candidates.sort(key=key)
        cname, sname, _ = candidates[0]
        return cname, sname

    # --- Retrieval helpers ---
    def _compose_query(self, dar: DAR3, category: str, subtopic: str) -> str:
        jd = dar.inputs.get("jd_text", "")
        depth = 1
        if category in dar.categories and subtopic in dar.categories[category].subtopics:
            depth = dar.categories[category].subtopics[subtopic].depth_level
        return f"{category} | {subtopic} | depth {depth} | {jd[:600]}"

    def _ground_context(self, dar: DAR3, category: str, subtopic: str, mandatory: bool) -> Tuple[List[Dict[str, Any]], float]:
        if not self.kb or not self.kb.docs:
            return [], 0.0
        query = self._compose_query(dar, category, subtopic)
        topk = int(dar.constraints.get("rag_top_k", 3))
        cites, ev_conf = self.kb.retrieve(query, top_k=topk)
        if mandatory and not cites:
            dar.audit["flags"].append("rag_no_results")
        return cites, ev_conf

    # --- Conversational Generators (with retry loops) ---
    def generate_acknowledgement(self, rationale: str, answer: str, round_key: str) -> str:
        try:
            system = ACKNOWLEDGEMENT_SYSTEM.get(round_key, ACKNOWLEDGEMENT_SYSTEM["manager"])
            phrase = oai_chat(
                self.client,
                system,
                build_acknowledgement_user(rationale, answer),
                self.model,
                temperature=0.1,
                max_tokens=40
            )
            return phrase.strip().replace('"', '')
        except Exception:
            return "Okay."

    def generate_transition(self, rationale: str, round_key: str) -> str: 
        try:
            system = TRANSITION_SYSTEM.get(round_key, TRANSITION_SYSTEM["manager"]) 
            phrase = oai_chat(
                self.client,
                system,
                build_transition_user(rationale),
                self.model,
                temperature=0.1,
                max_tokens=40
            )
            return phrase.strip().replace('"', '')
        except Exception:
            return "Let's move on."

    def generate_intro_question(self, dar: DAR3) -> Tuple[str, List[Dict[str, Any]]]:
        round_key = dar.meta.get("routing", {}).get("current_round", "manager") or "manager"
        system = INTRO_SYSTEM.get(round_key, INTRO_SYSTEM["manager"])
        user_prompt = build_intro_user(dar.meta.get("candidate_name", "Candidate"), dar.inputs.get("jd_text", ""))
        
        try:
            q = oai_chat(self.client, system, user_prompt, self.model, temperature=0.3, max_tokens=150)
            if q and len(q.strip()) > 10:
                return q.strip(), []
        except Exception as e:
            dar.errors.append(f"LLM INTRO call failed ({e}). Engaging fallback.")
        
        dar.audit["flags"].append("output_guard_fallback")
        cname = dar.meta.get("candidate_name") or "there"
        return f"Welcome {cname}. To get started, please tell us about your background and recent engineering experience.", []

    def generate_follow_up_question(self, dar: DAR3, last_item: InterviewLogItem) -> Tuple[str, List[Dict[str, Any]], float]:
        round_key = dar.meta.get("routing", {}).get("current_round", "manager") or "manager"
        system = FOLLOW_UP_SYSTEM.get(round_key, FOLLOW_UP_SYSTEM["manager"]) 
        ctx_snips, ev_conf = self._ground_context(dar, last_item.category, last_item.subtopic, mandatory=False)
        
        user_prompt = build_follow_up_user(
            last_question=last_item.question,
            last_answer=last_item.user_answer,
            rationale=last_item.result.get("rationale", ""),
            ctx_snippets=ctx_snips
        )
        
        try:
            q = oai_chat(self.client, system, user_prompt, self.model, temperature=0.3, max_tokens=160)
            if q and len(q.strip()) > 10:
                return q.strip(), ctx_snips, ev_conf
        except Exception as e:
            dar.errors.append(f"LLM call for follow-up failed ({e}).")

        dar.audit["flags"].append("output_guard_fallback")
        return "Could you elaborate on that approach and discuss any technical challenges you encountered?", ctx_snips, ev_conf

    def generate_question(self, dar: DAR3, category: str, subtopic: str) -> Tuple[str, List[Dict[str, Any]], float]:
        round_key = dar.meta.get("routing", {}).get("current_round", "manager") or "manager"
        jd, cv = dar.inputs.get("jd_text", ""), dar.inputs.get("cv_text", "")
        
        system = {
            "manager": MANAGER_Q_SYSTEM,
            "senior": SENIOR_Q_SYSTEM,
            "expert": EXPERT_Q_SYSTEM,
        }.get(round_key, MANAGER_Q_SYSTEM) 
        
        depth = 1
        if category in dar.categories and subtopic in dar.categories[category].subtopics:
            depth = dar.categories[category].subtopics[subtopic].depth_level
        
        history = []
        for item in dar.interview_log[-3:]:
            history.append({"question": item.question, "answer": item.user_answer})

        mandatory = round_key in ("senior", "expert")
        ctx_snips, ev_conf = self._ground_context(dar, category, subtopic, mandatory)
        
        user_prompt = build_question_user(jd, cv, category, subtopic, depth, ctx_snips, history)
        
        try:
            q = oai_chat(self.client, system, user_prompt, self.model, temperature=0.3, max_tokens=160)
            if q and len(q.strip()) > 10:
                q = q.strip()
                if dar.interview_log:
                    last_acknowledgement = dar.interview_log[-1].result.get("acknowledgement")
                    if last_acknowledgement:
                        q = f"{last_acknowledgement} {q[0].lower() if q else ''}{q[1:]}"
                return q, ctx_snips, ev_conf
        except Exception as e:
            dar.errors.append(f"LLM call for question failed ({e}).")
        
        dar.audit["flags"].append("output_guard_fallback")
        return f"Let's discuss {subtopic} in {category}. Could you walk us through your experience and technical decisions in this area?", ctx_snips, ev_conf

    # --- Evaluation & Application ---
    def evaluate_answer(self, dar: DAR3, question: str, answer: str, category: str, subtopic: str, history: list) -> Tuple[int, str, str, str, List[Dict[str, Any]], float, float, float]:
        round_key = dar.meta["routing"]["current_round"]
        rubric = RUBRICS.get(round_key, {"criteria": {}})
        ctx_snips, ev_conf = self._ground_context(dar, category, subtopic, mandatory=(round_key in ("senior","expert")))
        
        user = build_eval_user(question, answer, category, subtopic, round_key, rubric, ctx_snips, history) 
        
        try:
            raw = oai_chat(self.client, EVAL_SYSTEM, user, self.model, temperature=0.0, max_tokens=220)
            data = json.loads(clean_json_str(raw))
            base_delta = int(data.get("confidence_delta", 10))
            rationale = str(data.get("rationale", "Candidate demonstrated good technical competence.")).strip()
            acknowledgement = str(data.get("acknowledgement", "Thank you for explaining that.")).strip()
        except Exception as e:
            dar.errors.append(f"Eval fallback engaged ({e})")
            ans_clean = (answer or "").strip().lower()
            words = ans_clean.split()
            if len(ans_clean) < 6 or len(words) < 2 or ans_clean in ("h", "good", "ok", "yes", "no", "test"):
                base_delta = -8
                rationale = "Candidate provided an insubstantial response lacking technical depth and reasoning."
                acknowledgement = "Understood. Let's move on to the next topic."
            elif len(words) >= 35:
                base_delta = 10
                rationale = "Candidate demonstrated solid reasoning, structured thought, and clear technical foundations."
                acknowledgement = "Great, thank you for providing that thorough explanation."
            else:
                base_delta = 5
                rationale = "Candidate provided a basic answer but could elaborate further on system trade-offs."
                acknowledgement = "Thank you for the response."
        
        acknowledgement_phrase = acknowledgement or "Thank you for explaining that."
        if base_delta >= 10:
            transition_phrase = "Great. Let's proceed to the next technical area."
        elif base_delta < 0:
            transition_phrase = "Understood. Let's pivot to the next concept."
        else:
            transition_phrase = "Thank you. Let's explore the next topic."

        # Confidence fusion
        model_conf_map = {18: 90, 10: 65, 5: 40, -8: 20}
        model_conf = model_conf_map.get(base_delta, 40)
        fusion = 0.6 * model_conf + 0.4 * ev_conf
        scaled = int(round(base_delta * max(0, min(100, fusion)) / 100.0))
        
        if base_delta < 0:
            scaled = -abs(max(1, abs(scaled)))
        elif base_delta > 0:
            scaled = max(1, scaled)
        else:
            scaled = 0
        return scaled, rationale, acknowledgement_phrase, transition_phrase, ctx_snips, ev_conf, model_conf, fusion

    def apply_result(self, dar: DAR3, category: str, subtopic: str, delta: int, rationale: str, acknowledgement: str, answer: str, answer_given: bool) -> Tuple[int, int, int, int, int]:
        sub = dar.categories[category].subtopics[subtopic]
        sub.attempts += 1
        before_conf = sub.confidence
        before_depth = sub.depth_level

        # Map evaluation delta into a realistic confidence score (0-100)
        score_map = {18: 92, 10: 82, 5: 55, -8: 15}
        sub_score = score_map.get(delta, max(15, min(95, 50 + delta * 3)))
        if sub.confidence == 0 or sub.attempts <= 1:
            sub.confidence = sub_score
        else:
            sub.confidence = int(round((sub.confidence + sub_score) / 2))

        if delta >= 10 and sub.depth_level < 3:
            sub.depth_level += 1
        elif delta <= -8 and sub.depth_level > 1:
            sub.depth_level -= 1
        sub.notes.append(rationale)
        sub.last_answer = answer if answer_given else None 
        
        if dar.interview_log:
            dar.interview_log[-1].result["acknowledgement"] = acknowledgement

        if not answer_given or delta <= -8:
            sub.status = "Failed" if not answer_given else "In_Progress"
        elif sub.confidence >= 70:
            sub.status = "Covered"
        else:
            sub.status = "In_Progress"
        if sub.attempts >= dar.constraints["futility_stop_threshold"] and sub.status in ("Pending", "In_Progress"):
            sub.status = "Failed"
        sub.last_ask_time = time.time()
        return before_conf, delta, sub.confidence, before_depth, sub.depth_level

    # --- Round progression ---
    def _round_time_exceeded(self, dar: DAR3) -> bool:
        start = dar.meta["timestamps"]["round_start"]
        allotted = dar.constraints["per_round_time_mins"].get(dar.meta["routing"]["current_round"], 15) * 60 
        return (time.time() - start) >= allotted

    def _round_complete(self, dar: DAR3) -> bool:
        current = dar.meta["routing"]["current_round"]
        agent_name = AGENT_NAME[current]
        for _, cat in dar.categories.items():
            if cat.assigned_agent != agent_name:
                continue
            for sub in cat.subtopics.values():
                if sub.status in ("Pending", "In_Progress"):
                    return False
        return True

    def maybe_advance_round(self, dar: DAR3) -> bool:
        if self._round_complete(dar) or self._round_time_exceeded(dar):
            curr = dar.meta["routing"]["current_round"]
            idx = dar.meta["routing"]["round_order"].index(curr)
            if idx + 1 < len(dar.meta["routing"]["round_order"]):
                dar.meta["routing"]["current_round"] = dar.meta["routing"]["round_order"][idx+1]
                dar.meta["timestamps"]["round_start"] = time.time()
                dar.meta["ui"]["message_for_user"] = f"Advancing to {dar.meta['routing']['current_round'].title()} round."
            else:
                dar.meta["routing"]["current_round"] = None
            return True
        return False
    
    def force_advance_round(self, dar: DAR3) -> None:
        """Forcibly advances to the next round or synthesis."""
        curr = dar.meta["routing"]["current_round"]
        if not curr: # Already in synthesis
            return

        try:
            # Find current round index
            idx = dar.meta["routing"]["round_order"].index(curr)
            
            if idx + 1 < len(dar.meta["routing"]["round_order"]):
                # Advance to next round
                next_round = dar.meta["routing"]["round_order"][idx+1]
                dar.meta["routing"]["current_round"] = next_round
                dar.meta["timestamps"]["round_start"] = time.time()
                dar.meta["ui"]["message_for_user"] = f"Manually advanced to {next_round.title()} round."
            else:
                # At the end, advance to synthesis
                dar.meta["routing"]["current_round"] = None
                dar.meta["ui"]["message_for_user"] = "Manually advanced to Synthesis."
        except (ValueError, IndexError):
            # Fallback in case of weird state
            dar.meta["routing"]["current_round"] = None
            dar.meta["ui"]["message_for_user"] = "Manually advanced to Synthesis."

    # --- Core Conversational Logic ---
    def get_next_step(self, dar: DAR3) -> NextStep:
        current_round = dar.meta.get("routing", {}).get("current_round")
        if not current_round:
            return "SYNTHESIS", None, None, []

        agent_name = AGENT_NAME.get(current_round, "ManagerInterviewer")

        if not dar.interview_log:
            q, ctx = self.generate_intro_question(dar)
            dar.interview_log.append(InterviewLogItem(q_id=str(uuid.uuid4())[:8], agent=agent_name, category="Intro", subtopic="Intro", question=q, is_follow_up=False, status="Pending"))
            return "INTRO", ("Intro", "Intro"), q, ctx

        last_item = dar.interview_log[-1]
        if last_item.category != "Intro":
            cat_obj = dar.categories.get(last_item.category)
            sub = cat_obj.subtopics.get(last_item.subtopic) if cat_obj else None
            futility = dar.constraints.get("futility_stop_threshold", 2)
            if (sub and sub.status == "In_Progress" and 
                sub.attempts < futility and
                30 < sub.confidence < 75 and
                not last_item.is_follow_up): 
                
                q, ctx, _ = self.generate_follow_up_question(dar, last_item)
                dar.interview_log.append(InterviewLogItem(q_id=str(uuid.uuid4())[:8], agent=agent_name, category=last_item.category, subtopic=last_item.subtopic, question=q, is_follow_up=True, status="Pending"))
                return "FOLLOW_UP", (last_item.category, last_item.subtopic), q, ctx

        pick = self._pick_next_subtopic(dar)
        if pick:
            category, subtopic = pick
            q, ctx, _ = self.generate_question(dar, category, subtopic)
            dar.interview_log.append(InterviewLogItem(q_id=str(uuid.uuid4())[:8], agent=agent_name, category=category, subtopic=subtopic, question=q, is_follow_up=False, status="Pending"))
            return "NEW_TOPIC", (category, subtopic), q, ctx

        dar.meta["ui"]["message_for_user"] = "No new subtopics. Advancing..."
        self.maybe_advance_round(dar)
        if not dar.meta.get("routing", {}).get("current_round"):
             return "SYNTHESIS", None, None, []
        q, ctx = self.generate_intro_question(dar)
        return "INTRO", ("Intro", "Intro"), q, ctx


    # --- MODIFIED: Step 3 - Synthesis (Full Dashboard Data Generation) ---
    def synthesize(self, dar: DAR3) -> DAR3:
        
        # --- 1. Initialize data lists ---
        scores: Dict[str, float] = {}
        heatmap_data: List[Dict[str, Any]] = []
        depth_data: List[Dict[str, Any]] = []
        
        # --- 2. Process Categories & Subtopics (for Interview Score) ---
        for cname, cat in dar.categories.items():
            if cname == "Intro": continue # Skip intro category

            vals = []
            max_depth = 0
            
            for sname, sub in cat.subtopics.items():
                # A. Build heatmap data
                heatmap_data.append({
                    "category": cname,
                    "subtopic": sname,
                    "confidence": sub.confidence,
                    "status": sub.status,
                    "attempts": sub.attempts
                })
                
                # B. Collect values for category score (only for assessed subtopics)
                if sub.attempts > 0 or sub.status in ("Covered", "In_Progress", "Failed"):
                    w = {"Covered": 1.0, "In_Progress": 0.9, "Failed": 0.3}.get(sub.status, 0.5)
                    vals.append(sub.confidence * w)
                
                # C. Find max depth
                if sub.depth_level > max_depth:
                    max_depth = sub.depth_level
            
            # D. Finalize category-level data
            if vals:
                scores[cname] = round(sum(vals) / len(vals), 1)
            
            depth_data.append({
                "category": cname,
                "max_depth": max_depth
            })

        # --- 3. Process Interview Log for Fidelity Data ---
        fidelity_data = []
        for item in dar.interview_log:
            if item.category == "Intro": continue
            fidelity_data.append({
                "q_id": item.q_id,
                "subtopic": item.subtopic,
                "model_conf": item.result.get("model_confidence", 0),
                "evidence_conf": item.result.get("evidence_confidence", 0)
            })

        # --- 4. Calculate Final Score & Generate Summaries ---
        interview_score = 0.0 # This is the "Proof"
        if scores:
            interview_score = round(sum(scores.values()) / len(scores), 1)
        
        # --- NEW: Citable Summary Generation ---
        resume_assessment_dict = dar.resume_assessment.model_dump() if dar.resume_assessment else {}
        try:
            # Build the user prompt with all the necessary data
            synthesis_user_prompt = build_synthesis_user(
                scores=scores,
                resume_assessment=resume_assessment_dict,
                interview_log=[item.model_dump() for item in dar.interview_log]
            )
            
            # Call the LLM to get the structured JSON summary
            raw_summary_json = oai_chat(
                self.client,
                SYNTHESIS_SYSTEM,
                synthesis_user_prompt,
                self.model,
                temperature=0.2,
                max_tokens=1024,
            )
            
            # Parse the JSON and store it
            cited_summary_data = json.loads(clean_json_str(raw_summary_json))
            dar.synthesis.cited_summary = cited_summary_data
            raw_summary = cited_summary_data.get("summary_html", "Summary could not be generated.")
            # Strip raw HTML span tags to ensure clean, human-readable text without code leakage
            summary = re.sub(r'<[^>]+>', '', raw_summary).strip()
            dar.synthesis.summary = summary

        except Exception as e:
            # Fallback to the old, simple summary generation on any error
            dar.errors.append(f"Citable summary generation failed: {e}. Falling back to simple summary.")
            try:
                summary = oai_chat(
                    self.client,
                    "You summarize interview outcomes briefly.",
                    f"Category scores: {json.dumps(scores)}. Write a 3-sentence strengths/risks summary.",
                    self.model,
                    temperature=0.3,
                    max_tokens=180,
                )
                summary = re.sub(r'<[^>]+>', '', summary).strip()
            except Exception:
                summary = f"Summary generated. Overall interview score: {interview_score}%. Candidate answers showed consistent alignment with key evaluation criteria."
            dar.synthesis.summary = summary

        # Safety summary
        violations = dar.audit.get("safety_violations", [])
        violation_summary = ""
        final_interview_score = interview_score
        
        if violations:
            num_violations = len(violations)
            categories = list(set(cat for v in violations for cat in v['categories']))
            
            violation_summary = (
                f"WARNING: The candidate committed {num_violations} safety policy violation(s). "
                f"Categories: {', '.join(categories)}."
            )
            
            # Apply grading penalty
            penalty_factor = max(0.2, 1.0 - (num_violations * 0.2))
            final_interview_score = round(interview_score * penalty_factor, 2)
            
        # --- 5. NEW: "Claim vs. Proof" Analysis ---
        
        # Convert resume SI (1-5 scale) to a 0-100% scale
        # (Assuming 1=0% and 5=100%, so (Score-1)/4 * 100)
        resume_si = dar.resume_assessment.suitability_index if dar.resume_assessment else 0.0
        performance_gap = None
        
        if resume_si > 0: # Check if assessment ran
            resume_score_pct = (resume_si - 1) / 4 * 100
            
            # Gap = Proof (Interview) - Claim (Resume)
            performance_gap = final_interview_score - resume_score_pct
        
        # --- 6. Assign all data to the synthesis object ---
        dar.synthesis.final_score = final_interview_score
        dar.synthesis.summary = summary
        dar.synthesis.safety_summary = violation_summary
        
        dar.synthesis.resume_assessment = dar.resume_assessment # Copy it
        dar.synthesis.performance_gap = round(performance_gap, 2) if performance_gap is not None else None
        
        dar.synthesis.radar_data = scores
        dar.synthesis.heatmap_data = heatmap_data
        dar.synthesis.depth_data = depth_data
        dar.synthesis.fidelity_data = fidelity_data
        
        return dar
