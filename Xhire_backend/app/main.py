from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File, Body, status
from fastapi.responses import StreamingResponse
from fastapi.security import OAuth2PasswordRequestForm
from pydantic import BaseModel
from .security import (
    get_password_hash, create_access_token, verify_password,
    decode_access_token, oauth2_scheme, TokenData,
    ACCESS_TOKEN_EXPIRE_MINUTES
)
from datetime import timedelta
import io
import os
from typing import Optional, Any
from sqlmodel import Session, select, SQLModel
from sqlalchemy import func
from sqlalchemy.orm import selectinload
from .X_hire_schemas import RequisitionDetails
from contextlib import asynccontextmanager
import uuid
import logging

logging.basicConfig(level=logging.INFO)

# Import your new models and DB setup
from .db import get_session, create_db_and_tables, engine
from .X_models import Requisition, Candidate, InterviewSession, User
from .X_hire_schemas import DAR3
from .worker import start_interview_task, process_answer_task, executor

def dispatch_task(task_func, *args, **kwargs):
    """Dispatches to Celery broker if configured; otherwise runs in local background thread."""
    if os.environ.get("BROKER_URL"):
        try:
            return task_func.delay(*args, **kwargs)
        except Exception as e:
            logging.warning(f"Failed to dispatch to Celery broker ({e}), falling back to background thread.")
    
    func = getattr(task_func, "run", task_func)
    return executor.submit(func, *args, **kwargs)

# Import your coordinator (for synchronous tasks)
from .X_coordinator import Coordinator
from .X_llm_client import get_client
from .X_retriever import KBIndex
from .X_config import (
    DEFAULT_BASE_URL, DEFAULT_API_KEY, DEFAULT_MODEL, DEFAULT_EMB,
    KB_DIR, AGENT_NAME, FRONTEND_URL, DEFAULT_TTS_URL, DEFAULT_ASR_URL
)
from .asr_utils import transcribe_audio, ASRError
from .tts_utils import get_tts_audio, TTSError
from .X_guards import SAFETY_TAXONOMY
from .email_service import send_interview_invitation
from .pdf_service import generate_pdf_report
from .ai_detector import detect_ai_text, AIDetectionResult
from .calendar_service import generate_ics_calendar, generate_google_calendar_url, generate_available_slots
from .X_hire_schemas import ScheduleInfoResponse, BookSlotRequest, BookSlotResponse, AIDetectRequest
from .resume_validator import validate_resume_text
from .candidate_matrix import build_candidate_matrix, CandidateMatrixResponse
from .jd_autotuner import auto_tune_job_description, AutoTuneJDRequest, AutoTuneJDResponse
# --- Pydantic API Models (for request bodies) ---

class CandidateLoginRequest(BaseModel):
    email: str
    access_code: str

class RequisitionCreate(SQLModel):
    title: str
    jd_text: str
    ats_id: Optional[str] = None

class RequisitionSummary(BaseModel):
    id: int
    title: str
    ats_id: Optional[str] = None
    status: str
    owner_id: int
    jd_text: Any = ""
    candidate_count: int = 0
    completed_count: int = 0
    in_progress_count: int = 0
    invited_count: int = 0

class RequisitionUpdate(SQLModel):
    title: Optional[str] = None
    ats_id: Optional[str] = None
    status: Optional[str] = None
    jd_text: Optional[str] = None

class InterviewCreate(SQLModel):
    requisition_id: int
    candidate_email: str
    candidate_name: str
    cv_text: str

class AnswerCreate(SQLModel):
    answer_text: str
    q_id: str # <-- ADDED
    category: str
    subtopic: str
    is_follow_up: bool
    context: list # Add context to receive conversation history
    question: str

class UserCreate(SQLModel):
    email: str
    full_name: str
    password: str
    role: str = "recruiter"

class Token(BaseModel):
    access_token: str
    token_type: str
    user: dict

# --- FastAPI App Lifecycle ---

app_state = {}

@asynccontextmanager
async def lifespan(app: FastAPI):
    # On startup, create the DB tables
    print("Creating database and tables...")
    create_db_and_tables()

    # --- NEW: Initialize Coordinator and KBIndex once ---
    print("Initializing Coordinator and loading Knowledge Base...")
    client = get_client(DEFAULT_BASE_URL, DEFAULT_API_KEY)
    kb = KBIndex(client, DEFAULT_EMB)
    kb.load_folder(KB_DIR)
    app_state["coordinator"] = Coordinator(client, DEFAULT_MODEL, kb)
    print(f"Knowledge Base loaded with {len(kb.docs)} documents.")
    # --- END NEW ---

    # Create a default demo user if they don't exist
    with Session(engine) as session:
        demo_email = "recruiter@X.com"
        default_user = session.exec(
            select(User).where(User.email == demo_email)
        ).first()

        if not default_user:
            print("Creating demo recruiter user...")
            demo_user = User(
                email=demo_email,
                full_name="Demo Recruiter",
                hashed_password=get_password_hash("password123"),
                role="recruiter"
            )
            session.add(demo_user)
            session.commit()

    yield
    # On shutdown (if needed)
    print("Shutting down...")
    app_state.clear()

app = FastAPI(title="XHire API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Helper to get a live coordinator ---
def get_live_coordinator() -> Coordinator:
    """Gets the singleton Coordinator instance from the app state."""
    return app_state["coordinator"]

# --- API Endpoints ---
# --- Auth Endpoints ---

@app.post("/api/v1/register", response_model=User)
def register_user(
    user_data: UserCreate, 
    session: Session = Depends(get_session)
):
    """Creates a new user with a hashed password."""
    existing_user = session.exec(
        select(User).where(User.email == user_data.email)
    ).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = get_password_hash(user_data.password)

    # Create a new User DB object
    db_user = User(
        email=user_data.email,
        full_name=user_data.full_name,
        hashed_password=hashed_password,
        role=user_data.role
    )

    session.add(db_user)
    session.commit()
    session.refresh(db_user)
    return db_user

@app.post("/api/v1/login", response_model=Token)
def login_for_access_token(
    form_data: OAuth2PasswordRequestForm = Depends(),
    session: Session = Depends(get_session)
):
    """Logs in a user and returns a JWT token."""
    user = session.exec(
        select(User).where(func.lower(User.email) == form_data.username.strip().lower())
    ).first()

    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": user.email, "role": user.role}, 
        expires_delta=access_token_expires
    )

    return Token(
        access_token=access_token, 
        token_type="bearer",
        user={"email": user.email, "full_name": user.full_name, "role": user.role}
    )

@app.post("/api/v1/candidate-login")
def candidate_login(
    data: CandidateLoginRequest,
    session: Session = Depends(get_session)
):
    """
    Logs in a candidate using their email and a unique access code.
    Returns the session_uuid if successful.
    """
    # We must join InterviewSession with Candidate to check the email
    statement = select(InterviewSession).join(Candidate).where(
        func.lower(Candidate.email) == data.email.strip().lower(),
        InterviewSession.access_code == data.access_code.strip().upper()
    )

    interview_session = session.exec(statement).first()

    if not interview_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or access code."
        )

    if interview_session.status == "completed":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This interview has already been completed."
        )

    return {"session_uuid": interview_session.session_uuid, "candidate_name": interview_session.candidate.full_name}

# --- Dependency to get current user ---
def get_current_user(
    token: str = Depends(oauth2_scheme), 
    session: Session = Depends(get_session)
) -> User:
    """Decodes token, gets email, and fetches user from DB."""
    token_data = decode_access_token(token)
    user = session.exec(
        select(User).where(User.email == token_data.email)
    ).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

@app.get("/api/v1/")
def get_root():
    return {"message": "Welcome to XHire API"}

# --- Requisition Endpoints ---

@app.post("/api/v1/requisitions", response_model=Requisition)
def create_requisition(
    req_data: RequisitionCreate, 
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    db_req = Requisition(
        title=req_data.title,
        jd_text=req_data.jd_text,
        ats_id=req_data.ats_id,
        owner_id=current_user.id  # <-- SET OWNER FROM TOKEN
    )
    session.add(db_req)
    session.commit()
    session.refresh(db_req)
    return db_req

import fitz  # PyMuPDF

@app.post("/api/v1/requisitions/upload-jd")
def upload_jd(
    file: UploadFile = File(...),
):
    """Uploads a JD file, parses it, and returns the text."""
    try:
        doc = fitz.open(stream=file.file.read(), filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        return {"jd_text": text}
    except Exception as e:
        logging.error(f"Failed to parse JD: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to parse JD: {e}")

@app.get("/api/v1/requisitions", response_model=list[RequisitionSummary])
def get_requisitions(
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get all requisitions for the currently logged-in recruiter, including live candidate counts.
    """
    # Only return requisitions OWNED by the current user
    statement = (
        select(Requisition)
        .where(Requisition.owner_id == current_user.id)
        .options(selectinload(Requisition.interview_sessions))
    )
    requisitions = session.exec(statement).all()

    results = []
    for r in requisitions:
        sessions = r.interview_sessions or []
        completed = sum(1 for s in sessions if s.status == "completed")
        in_progress = sum(1 for s in sessions if s.status in ("started", "processing", "answer_processing"))
        invited = sum(1 for s in sessions if s.status in ("invited", "pending"))
        results.append(RequisitionSummary(
            id=r.id,
            title=r.title,
            ats_id=r.ats_id,
            status=r.status,
            owner_id=r.owner_id,
            jd_text=r.jd_text,
            candidate_count=len(sessions),
            completed_count=completed,
            in_progress_count=in_progress,
            invited_count=invited
        ))
    return results

@app.get("/api/v1/requisitions/{req_id}", response_model=RequisitionDetails)
def get_requisition_details(
    req_id: int,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Get a single requisition by its ID, including its candidates.
    Ensures the user owns this requisition.
    """
    # This explicit query forces SQLAlchemy to load the nested
    # relationships every time, bypassing the simple query cache.
    statement = select(Requisition).where(
        Requisition.id == req_id,
        Requisition.owner_id == current_user.id
    ).options(
        # Force it to load the list of interview_sessions...
        selectinload(Requisition.interview_sessions)
        # ...and for each session, also load its related candidate.
        .selectinload(InterviewSession.candidate)
    )

    requisition = session.exec(statement).first()

    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found or you do not have access")

    return requisition

@app.patch("/api/v1/requisitions/{req_id}", response_model=Requisition)
def update_requisition(
    req_id: int,
    req_update: RequisitionUpdate,
    session: Session = Depends(get_session),
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing requisition (e.g. ATS ID, title, status).
    Ensures the user owns this requisition.
    """
    db_req = session.exec(
        select(Requisition).where(
            Requisition.id == req_id,
            Requisition.owner_id == current_user.id
        )
    ).first()
    if not db_req:
        raise HTTPException(status_code=404, detail="Requisition not found or you do not have access")

    if req_update.title is not None:
        db_req.title = req_update.title.strip()
    if req_update.ats_id is not None:
        db_req.ats_id = req_update.ats_id.strip() if req_update.ats_id else None
    if req_update.status is not None:
        db_req.status = req_update.status.strip()
    if req_update.jd_text is not None:
        db_req.jd_text = req_update.jd_text

    session.add(db_req)
    session.commit()
    session.refresh(db_req)
    return db_req

# --- Interview Endpoints ---

@app.post("/api/v1/interviews/upload-cv")
async def upload_cv(
    file: UploadFile = File(...),
):
    """Uploads a CV file, parses it, and returns the text."""
    try:
        content = await file.read()
        import pymupdf
        doc = pymupdf.open(stream=content, filetype="pdf")
        text = ""
        for page in doc:
            text += page.get_text()
        
        cleaned_text = text.strip()
        if len(cleaned_text) < 20:
            raise HTTPException(
                status_code=400, 
                detail="Uploaded PDF does not contain extractable text. Please paste the resume as text or ensure the PDF is not an image scan."
            )

        # Validate that the document is genuinely a candidate resume
        validation = validate_resume_text(cleaned_text)
        if not validation.is_valid_resume:
            raise HTTPException(
                status_code=400,
                detail=validation.error_message
            )

        return {
            "cv_text": cleaned_text,
            "filename": file.filename,
            "char_count": len(cleaned_text),
            "document_type": validation.document_type,
            "confidence_score": validation.confidence_score,
            "is_valid_resume": True,
            "warning": None
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Failed to parse CV document: {e}")
        raise HTTPException(
            status_code=400,
            detail=f"Unable to parse document as a valid PDF resume: {e}. Please ensure the file is an uncorrupted PDF or paste the text directly."
        )

@app.post("/api/v1/interviews", response_model=InterviewSession)
def create_interview(
    data: InterviewCreate, 
    session: Session = Depends(get_session)
):
    # Validate resume text before creating interview session
    validation = validate_resume_text(data.cv_text)
    if not validation.is_valid_resume:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid candidate resume: {validation.error_message}"
        )
    # 1. Find or create candidate
    candidate = session.exec(
        select(Candidate).where(Candidate.email == data.candidate_email)
    ).first()
    if not candidate:
        candidate = Candidate(
            email=data.candidate_email,
            full_name=data.candidate_name,
            cv_text=data.cv_text
        )
        session.add(candidate)
        session.commit()
        session.refresh(candidate)
    else:
        # Update existing candidate's name and CV text
        candidate.full_name = data.candidate_name
        if data.cv_text:
            candidate.cv_text = data.cv_text
        session.add(candidate)
        session.commit()
        session.refresh(candidate)

    # 2. Get Requisition
    requisition = session.get(Requisition, data.requisition_id)
    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found")

    # 3. Create a MINIMAL DAR3 stub
    dar = DAR3()
    dar.meta["candidate_name"] = candidate.full_name
    dar.inputs["jd_text"] = requisition.jd_text
    dar.inputs["cv_text"] = data.cv_text if data.cv_text else (candidate.cv_text or "")

    # 4. Create the SQL InterviewSession with "invited" status
    db_session = InterviewSession(
        session_uuid=str(uuid.uuid4()),
        requisition_id=requisition.id,
        candidate_id=candidate.id,
        dar_data=dar.model_dump(), # Store the minimal stub
        status="invited"
    )
    session.add(db_session)
    session.commit()
    session.refresh(db_session)

    # 5. Dispatch interview invitation email
    try:
        send_interview_invitation(
            candidate_name=candidate.full_name,
            candidate_email=candidate.email,
            requisition_title=requisition.title,
            session_uuid=db_session.session_uuid,
            access_code=db_session.access_code
        )
    except Exception as e:
        logging.error(f"Error sending invitation email: {e}")

    return db_session

@app.post("/api/v1/interviews/{session_uuid}/resend-invite")
def resend_interview_invite(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """Resends the interview invitation email to the candidate."""
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    candidate = db_session.candidate
    requisition = db_session.requisition
    if not candidate or not requisition:
        raise HTTPException(status_code=400, detail="Incomplete interview session data")

    try:
        result = send_interview_invitation(
            candidate_name=candidate.full_name,
            candidate_email=candidate.email,
            requisition_title=requisition.title,
            session_uuid=db_session.session_uuid,
            access_code=db_session.access_code
        )
        return {"status": "success", "message": f"Invitation email sent to {candidate.email}", "details": result}
    except Exception as e:
        logging.error(f"Failed to resend invitation email: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to resend email: {e}")

@app.post("/api/v1/interviews/{session_uuid}/start", status_code=202)
def start_interview(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """
    Called by the candidate when they click 'Start Interview'.
    This triggers the async resume assessment.
    """
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    if db_session.status != "invited":
        if db_session.status in ("started", "processing", "answer_processing"):
            # Idempotent response - interview is already running
            return {"status": db_session.status, "message": "Interview already in progress."}
        elif db_session.status == "completed":
            return {"status": "completed", "message": "Interview already completed."}
        # Don't let them re-start an invalid state
        raise HTTPException(status_code=400, detail=f"Interview already in status: {db_session.status}")

    # 1. Update status to "processing"
    db_session.status = "processing"
    session.add(db_session)
    session.commit()

    # 2. NOW dispatch the AI task
    dispatch_task(start_interview_task, db_session.session_uuid)

    return {"status": "processing", "message": "Interview task started."}


@app.get("/api/v1/interviews/{session_uuid}/status")
def get_interview_status(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """A lightweight endpoint for the frontend to poll."""
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()

    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    return {"status": db_session.status, "candidate_name": db_session.candidate.full_name}

def parse_safety_taxonomy(taxonomy: str) -> dict[str, str]:
    """Parses the safety taxonomy string into a dictionary."""
    category_map = {}
    lines = taxonomy.strip().split('\n')
    for line in lines:
        line = line.strip()
        if not line.startswith("S") or ":" not in line:
            continue
        parts = line.split(":", 1)
        if len(parts) == 2:
            category_map[parts[0].strip()] = parts[1].strip().rstrip('.')
    return category_map

SAFETY_CATEGORY_MAP = parse_safety_taxonomy(SAFETY_TAXONOMY)

@app.get("/api/v1/interviews/{session_uuid}/next-question")
def get_next_question(
    session_uuid: str, 
    session: Session = Depends(get_session)
):
    try:
        db_session = session.exec(
            select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
        ).first()
        if not db_session:
            raise HTTPException(status_code=404, detail="Session not found")

        dar = DAR3(**db_session.dar_data)
        if db_session.status == "completed":
            return {"action": "SYNTHESIS"}
        coord = get_live_coordinator()

        current_round_key = dar.meta.get("routing", {}).get("current_round", "manager") or "manager"
        round_name = AGENT_NAME.get(current_round_key, "Interview")
        round_order = dar.meta.get("routing", {}).get("round_order", ["manager", "senior", "expert"])
        try:
            round_num = round_order.index(current_round_key) + 1
        except (ValueError, IndexError):
            round_num = 1

        candidate_name = dar.meta.get("candidate_name") or (db_session.candidate.full_name if db_session.candidate else "")

        # --- 1. INSTANT RETURN FOR PENDING QUESTION (Zero LLM latency, idempotent, safe against reloads) ---
        if dar.interview_log and dar.interview_log[-1].status == "Pending":
            last_item = dar.interview_log[-1]
            return {
                "action": "PENDING_QUESTION",
                "question": last_item.question,
                "context": last_item.evidence or [],
                "q_id": last_item.q_id,
                "category": last_item.category or "General",
                "subtopic": last_item.subtopic or "Overview",
                "round_display_name": f"Round {round_num}: {round_name}",
                "round_key": current_round_key,
                "total_time_mins": dar.constraints.get("total_max_time_mins", 60),
                "round_time_mins": dar.constraints.get("per_round_time_mins", {}).get(current_round_key, 10),
                "interview_start_time": dar.meta.get("timestamps", {}).get("interview_start", 0),
                "round_start_time": dar.meta.get("timestamps", {}).get("round_start", 0),
                "current_round_num": round_num,
                "total_rounds": len(round_order),
                "safety_warning": None,
                "candidate_name": candidate_name
            }

        # --- 2. GENERATE NEXT STEP (Only when previous question is answered or log is empty) ---
        try:
            action, active_tuple, q_text, q_ctx = coord.get_next_step(dar)
            db_session.dar_data = dar.model_dump()
            session.add(db_session)
            session.commit()
        except Exception as step_err:
            logging.error(f"Error in coord.get_next_step for session {session_uuid}: {step_err}", exc_info=True)
            # Safe Fallback Question - Never crash the interview into a 500 error!
            pick = coord._pick_next_subtopic(dar) if hasattr(coord, '_pick_next_subtopic') else None
            fallback_cat = pick[0] if pick else "Technical Engineering"
            fallback_sub = pick[1] if pick else "System Design & Architecture"
            active_tuple = (fallback_cat, fallback_sub)
            action = "NEW_TOPIC"
            q_text = f"Regarding {fallback_sub} in {fallback_cat}: Could you elaborate on your experience, trade-offs you considered, and how you ensured reliability in production?"
            q_ctx = []
            new_qid = str(uuid.uuid4())[:8]
            dar.interview_log.append(InterviewLogItem(
                q_id=new_qid,
                agent=AGENT_NAME.get(current_round_key, "Interviewer"),
                category=fallback_cat,
                subtopic=fallback_sub,
                question=q_text,
                is_follow_up=False,
                status="Pending"
            ))
            db_session.dar_data = dar.model_dump()
            session.add(db_session)
            session.commit()

        if action == "SYNTHESIS":
            db_session.status = "completed"
            if not dar.synthesis.final_score:
                try:
                    dar = coord.synthesize(dar)
                    db_session.dar_data = dar.model_dump()
                except Exception as synth_err:
                    logging.warning(f"Synthesis failed, using fallback summary: {synth_err}")
            session.add(db_session)
            session.commit()
            return {"action": "SYNTHESIS"}

        # --- Check Safety Violations from previous answered item ---
        safety_warning = None
        if dar.interview_log and len(dar.interview_log) > 1:
            prev_item = dar.interview_log[-2] if dar.interview_log[-1].status == "Pending" else dar.interview_log[-1]
            if prev_item.status == "Answered":
                violated_codes = prev_item.result.get("input_guard_categories", [])
                if violated_codes:
                    violations = [SAFETY_CATEGORY_MAP.get(code, "Unknown") for code in violated_codes]
                    safety_warning = {
                        "message": "Your previous answer was flagged for review.",
                        "categories": violations
                    }

        q_id = dar.interview_log[-1].q_id if dar.interview_log else str(uuid.uuid4())[:8]
        cat_name = active_tuple[0] if (active_tuple and len(active_tuple) > 0) else "General"
        sub_name = active_tuple[1] if (active_tuple and len(active_tuple) > 1) else "Overview"

        return {
            "action": action,
            "question": q_text,
            "context": q_ctx,
            "q_id": q_id,
            "category": cat_name,
            "subtopic": sub_name,
            "round_display_name": f"Round {round_num}: {round_name}",
            "round_key": current_round_key,
            "total_time_mins": dar.constraints.get("total_max_time_mins", 60),
            "round_time_mins": dar.constraints.get("per_round_time_mins", {}).get(current_round_key, 10),
            "interview_start_time": dar.meta.get("timestamps", {}).get("interview_start", 0),
            "round_start_time": dar.meta.get("timestamps", {}).get("round_start", 0),
            "current_round_num": round_num,
            "total_rounds": len(round_order),
            "safety_warning": safety_warning,
            "candidate_name": candidate_name
        }
    except HTTPException:
        raise
    except Exception as e:
        logging.error(f"Critical error in get_next_question for session {session_uuid}: {e}", exc_info=True)
        # Ultra-safe fallback response to prevent any frontend 500 crashes
        return {
            "action": "FALLBACK_QUESTION",
            "question": "Could you walk through a complex engineering problem you solved recently and describe the key architectural tradeoffs?",
            "context": [],
            "q_id": str(uuid.uuid4())[:8],
            "category": "Technical Experience",
            "subtopic": "Problem Solving",
            "round_display_name": "Technical Interview",
            "round_key": "manager",
            "total_time_mins": 60,
            "round_time_mins": 15,
            "interview_start_time": 0,
            "round_start_time": 0,
            "current_round_num": 1,
            "total_rounds": 3,
            "safety_warning": None,
            "candidate_name": "Candidate"
        }

@app.post("/api/v1/interviews/{session_uuid}/end-round", status_code=200)
def end_current_round(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """
    Called by the candidate to manually end a round.
    This is now a single, atomic operation that advances the round AND gets
    the next question, returning it directly. This fixes the read-after-write
    race condition.
    """
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    try:
        # 1. Load data
        dar = DAR3(**db_session.dar_data)
        coord = get_live_coordinator()

        # 2. Advance the round
        coord.force_advance_round(dar)

        # 3. Get the next question for the NEW round
        action, active_tuple, q_text, q_ctx = coord.get_next_step(dar)

        # 4. Save the final state in a single transaction
        db_session.dar_data = dar.model_dump()
        session.add(db_session)
        session.commit()
        
        # 5. Check for synthesis action (end of interview)
        if action == "SYNTHESIS":
            db_session.status = "completed"
            if not dar.synthesis.final_score:
                try:
                    dar = coord.synthesize(dar)
                    db_session.dar_data = dar.model_dump()
                except Exception as synth_err:
                    logging.warning(f"Synthesis failed during end-round: {synth_err}")
            session.add(db_session)
            session.commit()
            return {"action": "SYNTHESIS"}

        # 6. Construct and return the full question payload, just like /next-question
        current_round_key = dar.meta.get("routing", {}).get("current_round", "manager") or "manager"
        round_name = AGENT_NAME.get(current_round_key, "Interview")
        round_order = dar.meta.get("routing", {}).get("round_order", ["manager", "senior", "expert"])
        try:
            round_num = round_order.index(current_round_key) + 1
        except (ValueError, IndexError):
            round_num = 1
        
        q_id = dar.interview_log[-1].q_id if dar.interview_log else str(uuid.uuid4())[:8]
        cat_name = active_tuple[0] if (active_tuple and len(active_tuple) > 0) else "General"
        sub_name = active_tuple[1] if (active_tuple and len(active_tuple) > 1) else "Overview"

        return {
            "action": action,
            "question": q_text,
            "context": q_ctx,
            "q_id": q_id,
            "category": cat_name,
            "subtopic": sub_name,
            "round_display_name": f"Round {round_num}: {round_name}",
            "round_key": current_round_key,
            "total_time_mins": dar.constraints.get("total_max_time_mins", 60),
            "round_time_mins": dar.constraints.get("per_round_time_mins", {}).get(current_round_key, 10),
            "interview_start_time": dar.meta.get("timestamps", {}).get("interview_start", 0),
            "round_start_time": dar.meta.get("timestamps", {}).get("round_start", 0),
            "current_round_num": round_num,
            "total_rounds": len(round_order)
        }

    except Exception as e:
        session.rollback()
        logging.error(f"Failed to end round and get next question: {e}", exc_info=True)
        return {
            "action": "NEW_TOPIC",
            "question": "Welcome to the next interview round. Could you summarize your core technical background and the architecture of systems you've built?",
            "context": [],
            "q_id": str(uuid.uuid4())[:8],
            "category": "Core Engineering",
            "subtopic": "Architecture & Scalability",
            "round_display_name": "Next Round",
            "round_key": "senior",
            "total_time_mins": 60,
            "round_time_mins": 15,
            "interview_start_time": 0,
            "round_start_time": 0,
            "current_round_num": 2,
            "total_rounds": 3
        }

@app.post("/api/v1/interviews/{session_uuid}/end-interview", status_code=200)
def end_interview(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """
    Called by the candidate to manually end the entire interview.
    """
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")

    dar = DAR3(**db_session.dar_data)
    coord = get_live_coordinator()
    if not dar.synthesis.final_score:
        dar = coord.synthesize(dar)
        db_session.dar_data = dar.model_dump()

    db_session.status = "completed"
    session.add(db_session)
    session.commit()

    return {"status": "completed", "message": "Interview ended successfully."}

@app.post("/api/v1/interviews/{session_uuid}/answer")
def submit_answer(
    session_uuid: str, 
    answer: AnswerCreate,
    session: Session = Depends(get_session)
):
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
        
    if db_session.status not in ["started", "answer_processing"]:
        raise HTTPException(status_code=400, detail=f"Interview not in a state to accept answers. Status is {db_session.status}")

    # --- FIX: Set status to answer_processing ---
    db_session.status = "answer_processing"
    session.add(db_session)
    session.commit()

    # Dispatch the ASYNC task to process the answer
    dispatch_task(
        process_answer_task,
        session_uuid=session_uuid,
        answer_text=answer.answer_text,
        q_id=answer.q_id, # <-- PASS Q_ID
        category=answer.category,
        subtopic=answer.subtopic,
        is_follow_up=answer.is_follow_up,
        context=answer.context,
        question=answer.question
    )

    return {"status": "processing"}

@app.get("/api/v1/reports/{session_uuid}")
def get_report(session_uuid: str, session: Session = Depends(get_session)):
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Session not found")
    
    dar = DAR3(**db_session.dar_data)
    coord = get_live_coordinator()

    # If synthesis isn't done, run it now.
    if not dar.synthesis.final_score:
        dar = coord.synthesize(dar)
        # Save the synthesized data
        db_session.dar_data = dar.model_dump()
    return dar

@app.get("/api/v1/reports/{session_uuid}/pdf")
def get_report_pdf(session_uuid: str, session: Session = Depends(get_session)):
    """Generates and streams a professional PDF evaluation report."""
    db_session = session.exec(
        select(InterviewSession).where(InterviewSession.session_uuid == session_uuid)
    ).first()
    if not db_session:
        raise HTTPException(status_code=404, detail="Interview session not found")

    dar = DAR3(**db_session.dar_data)
    coord = get_live_coordinator()

    # Ensure synthesis has run
    if not dar.synthesis.final_score:
        dar = coord.synthesize(dar)
        db_session.dar_data = dar.model_dump()
        session.add(db_session)
        session.commit()

    candidate_name = db_session.candidate.full_name if db_session.candidate else "Candidate"
    candidate_email = db_session.candidate.email if db_session.candidate else "N/A"
    requisition_title = db_session.requisition.title if db_session.requisition else "Job Role"

    pdf_bytes = generate_pdf_report(
        candidate_name=candidate_name,
        candidate_email=candidate_email,
        requisition_title=requisition_title,
        session_uuid=db_session.session_uuid,
        access_code=db_session.access_code,
        status=db_session.status,
        dar_data=db_session.dar_data
    )

    clean_filename = f"XHire_Report_{candidate_name.replace(' ', '_')}_{session_uuid[:8]}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{clean_filename}"'
        }
    )

# --- Voice I/O Endpoints ---

class TTSRequest(SQLModel):
    text: str

@app.post("/api/v1/tts")
async def get_speech_from_text(
    tts_request: TTSRequest = Body(...)
):
    """
    Proxies a text-to-speech request to the Piper server.
    """
    try:
        audio_bytes = get_tts_audio(
            text=tts_request.text,
            tts_url=DEFAULT_TTS_URL,
            timeout_s=3
        )
        return StreamingResponse(io.BytesIO(audio_bytes), media_type="audio/wav")

    except TTSError as e:
        raise HTTPException(status_code=503, detail=f"TTS server offline: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected TTS error: {e}")


@app.post("/api/v1/asr")
async def get_text_from_speech(
    file: UploadFile = File(...)
):
    """
    Proxies an audio file to the Whisper ASR server.
    Uses the refactored asr_utils.
    """
    try:
        audio_bytes = await file.read()

        transcription = transcribe_audio(
            audio_bytes=audio_bytes,
            asr_url=DEFAULT_ASR_URL,
            timeout_s=3
        )

        return {"transcription": transcription}

    except ASRError as e:
        raise HTTPException(status_code=503, detail=f"ASR server offline: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected ASR error: {e}")


# ===================================================
# --- AI TEXT DETECTION ENDPOINTS ---
# ===================================================

@app.post("/api/v1/detect-ai", response_model=AIDetectionResult)
async def analyze_ai_text(request: AIDetectRequest):
    """
    Evaluates candidate text for AI generation using Perplexity and Burstiness metrics.
    Detects ChatGPT and Claude verbatim answers with probability scores and flags.
    """
    return detect_ai_text(request.text)


# ===================================================
# --- CANDIDATE CALENDAR SCHEDULING ENDPOINTS ---
# ===================================================

@app.get("/api/v1/sessions/{session_uuid}/schedule-info", response_model=ScheduleInfoResponse)
async def get_session_schedule_info(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """
    Fetches interview metadata and available calendar booking slots for a candidate session.
    """
    db_session = session.exec(
        select(InterviewSession)
        .where(InterviewSession.session_uuid == session_uuid)
        .options(selectinload(InterviewSession.candidate), selectinload(InterviewSession.requisition))
    ).first()

    if not db_session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    available_days = generate_available_slots(days_ahead=5)

    return ScheduleInfoResponse(
        session_uuid=db_session.session_uuid,
        candidate_name=db_session.candidate.full_name,
        candidate_email=db_session.candidate.email,
        requisition_title=db_session.requisition.title,
        access_code=db_session.access_code,
        scheduled_at=db_session.scheduled_at,
        scheduled_timezone=db_session.scheduled_timezone or "UTC",
        available_days=available_days
    )


@app.post("/api/v1/sessions/{session_uuid}/book-slot", response_model=BookSlotResponse)
async def book_session_slot(
    session_uuid: str,
    payload: BookSlotRequest,
    session: Session = Depends(get_session)
):
    """
    Reserves an interview time slot for the candidate and generates calendar links.
    """
    from datetime import datetime
    db_session = session.exec(
        select(InterviewSession)
        .where(InterviewSession.session_uuid == session_uuid)
        .options(selectinload(InterviewSession.candidate), selectinload(InterviewSession.requisition))
    ).first()

    if not db_session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    try:
        slot_dt = datetime.fromisoformat(payload.datetime_iso)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid ISO datetime format: {e}")

    # Update session scheduling fields
    db_session.scheduled_at = slot_dt
    db_session.scheduled_timezone = payload.timezone
    if db_session.status in ("pending", "invited"):
        db_session.status = "scheduled"

    # Store in DAR metadata as well
    if db_session.dar_data and isinstance(db_session.dar_data, dict):
        if "meta" not in db_session.dar_data:
            db_session.dar_data["meta"] = {}
        db_session.dar_data["meta"]["scheduled_at"] = slot_dt.isoformat()
        db_session.dar_data["meta"]["scheduled_timezone"] = payload.timezone

    session.add(db_session)
    session.commit()
    session.refresh(db_session)

    # Build calendar links
    interview_url = f"{FRONTEND_URL}/candidate/{db_session.session_uuid}"
    event_title = f"{db_session.requisition.title} - AI Technical Interview"
    description = (
        f"Candidate: {db_session.candidate.full_name}\\n"
        f"Access Code: {db_session.access_code}\\n"
        f"Interview Portal: {interview_url}\\n\\n"
        f"Conducted by Xhire Multi-Agent System."
    )

    google_cal_url = generate_google_calendar_url(
        title=event_title,
        description=description,
        start_dt=slot_dt,
        duration_minutes=45,
        location_url=interview_url
    )

    ics_url = f"/api/v1/sessions/{db_session.session_uuid}/calendar.ics"

    return BookSlotResponse(
        message="Interview slot scheduled successfully!",
        session_uuid=db_session.session_uuid,
        scheduled_at=slot_dt,
        scheduled_timezone=payload.timezone,
        google_calendar_url=google_cal_url,
        ics_download_url=ics_url,
        interview_url=interview_url
    )


@app.get("/api/v1/sessions/{session_uuid}/calendar.ics")
async def download_session_ics(
    session_uuid: str,
    session: Session = Depends(get_session)
):
    """
    Generates and downloads an RFC 5545 .ics iCalendar file for the scheduled interview.
    """
    from fastapi.responses import Response
    db_session = session.exec(
        select(InterviewSession)
        .where(InterviewSession.session_uuid == session_uuid)
        .options(selectinload(InterviewSession.candidate), selectinload(InterviewSession.requisition))
    ).first()

    if not db_session:
        raise HTTPException(status_code=404, detail="Interview session not found.")

    if not db_session.scheduled_at:
        # Default to tomorrow 14:00 UTC if not yet chosen
        from datetime import datetime, timezone, timedelta
        slot_dt = datetime.now(timezone.utc) + timedelta(days=1, hours=4)
    else:
        slot_dt = db_session.scheduled_at

    interview_url = f"{FRONTEND_URL}/candidate/{db_session.session_uuid}"
    title = f"{db_session.requisition.title} Interview - Xhire"
    description = (
        f"AI Technical Interview for {db_session.candidate.full_name}\n"
        f"Access Code: {db_session.access_code}\n"
        f"Interview Room: {interview_url}"
    )

    ics_data = generate_ics_calendar(
        event_id=db_session.session_uuid,
        title=title,
        description=description,
        start_dt=slot_dt,
        duration_minutes=45,
        location_url=interview_url
    )

    return Response(
        content=ics_data,
        media_type="text/calendar",
        headers={
            "Content-Disposition": f"attachment; filename=interview-{db_session.session_uuid[:8]}.ics"
        }
    )


# ===================================================
# --- COMPARATIVE CANDIDATE MATRIX ENDPOINTS ---
# ===================================================

@app.get("/api/v1/requisitions/{req_id}/candidate-matrix", response_model=CandidateMatrixResponse)
def get_requisition_candidate_matrix(
    req_id: int,
    session: Session = Depends(get_session)
):
    """
    Computes comparative candidate matrix, empirical percentiles per rubric dimension,
    and multi-candidate radar chart datasets for a job requisition.
    """
    requisition = session.get(Requisition, req_id)
    if not requisition:
        raise HTTPException(status_code=404, detail="Requisition not found.")

    return build_candidate_matrix(
        requisition_id=requisition.id,
        requisition_title=requisition.title,
        sessions=requisition.interview_sessions or []
    )


# ===================================================
# --- JD AUTO-TUNING & QUESTION GENERATION ENDPOINTS ---
# ===================================================

@app.post("/api/v1/requisitions/auto-tune-jd", response_model=AutoTuneJDResponse)
def auto_tune_jd_endpoint(
    payload: AutoTuneJDRequest
):
    """
    Auto-tunes high-level recruiter requirements into structured job descriptions,
    seniority-calibrated rubric weights, and multi-persona question banks.
    """
    return auto_tune_job_description(
        raw_text=payload.raw_requirements,
        seniority=payload.seniority,
        focus_areas=payload.focus_areas
    )