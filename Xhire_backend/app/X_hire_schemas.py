from __future__ import annotations
import time
import uuid
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict

# ==============================
# ---------- SCHEMAS -----------
# ==============================
class SubTopic(BaseModel):
    status: str = Field("Pending", pattern=r"^(Pending|In_Progress|Covered|Failed|Awaiting_Critic)$")
    depth_level: int = 1
    confidence: int = 0
    attempts: int = 0
    notes: List[str] = Field(default_factory=list)
    validation_payload: Optional[Dict[str, Any]] = None
    last_ask_time: Optional[float] = None
    last_answer: Optional[str] = None
    sources: List[str] = Field(default_factory=list)

class Category(BaseModel):
    assigned_agent: str
    subtopics: Dict[str, SubTopic]

class InterviewLogItem(BaseModel):
    q_id: str
    agent: str
    category: str
    subtopic: str
    question: str
    is_follow_up: bool = False
    status: str = "Pending"
    question_vector: List[float] = Field(default_factory=list)
    user_answer: Optional[str] = None
    evidence: List[Dict[str, Any]] = Field(default_factory=list)  # RAG citations
    result: Dict[str, Any] = Field(default_factory=lambda: {
        "confidence_before": 0,
        "confidence_delta": 0,
        "confidence_after": 0,
        "rationale": "",
        "transition_phrase": None,
        "depth_before": 1,
        "depth_after": 1,
        "rubric_used": None,
        "input_guard_response": None,
        "input_guard_categories": [], 
        "evidence_confidence": 0,
        "model_confidence": 0,
        "fusion_factor": 0,
    })

# --- NEW: Schema for your Resume Score ---
class ResumePillarScore(BaseModel):
    pillar: str
    score: float = Field(..., ge=1, le=5)
    rationale: str

class ResumeAssessment(BaseModel):
    suitability_index: float = Field(0.0, description="Overall Suitability Index (SI)")
    verdict: str = Field("Not Assessed", description="e.g., 'Good Fit', 'Weak Fit'")
    pillar_scores: List[ResumePillarScore] = Field(default_factory=list)

# --- MODIFIED: Synthesis Schema ---
class Synthesis(BaseModel):
    # 1. Top-Line KPIs
    final_score: Optional[float] = None
    summary: Optional[str] = None # This will store the HTML summary string
    safety_summary: Optional[str] = None
    cited_summary: Optional[Dict[str, Any]] = None # This will store the full JSON object for the citable summary

    # 2. Resume Assessment (copied for dashboard)
    resume_assessment: Optional[ResumeAssessment] = None

    # 3. The "Claim vs. Proof" Gap
    performance_gap: Optional[float] = Field(None,
        description="The % difference between Interview Score and Resume Score (Claim)")

    # 4. Data for Radar Chart (from interview)
    radar_data: Dict[str, float] = Field(default_factory=dict,
        description="Data for the category skills radar chart. {Category: Score}")

    # 5. Data for Skill Heatmap (from interview)
    heatmap_data: List[Dict[str, Any]] = Field(default_factory=list,
        description="Data for the subtopic heatmap. [{category, subtopic, confidence, status, attempts}]")

    # 6. Data for Depth-of-Knowledge Bar Chart (from interview)
    depth_data: List[Dict[str, Any]] = Field(default_factory=list,
        description="Data for max depth achieved per category. [{category, max_depth}]")
    
    # 7. Data for Interview Fidelity Plot (from interview)
    fidelity_data: List[Dict[str, Any]] = Field(default_factory=list,
        description="Data for model vs. evidence confidence. [{q_id, subtopic, model_conf, evidence_conf}]")

# --- MODIFIED: DAR3 Schema ---
class DAR3(BaseModel):
    meta: Dict[str, Any] = Field(default_factory=lambda: {
        "interview_id": str(uuid.uuid4())[:8],
        "candidate_name": "",
        "timestamps": {"created": time.time(), "interview_start": 0.0, "round_start": 0.0},
        "routing": {"current_round": None, "round_order": [], "next_node_override": None},
        "ui": {"message_for_user": None, "paused_by_human": False},
    })
    
    # --- NEW: Top-level field for the initial assessment ---
    resume_assessment: ResumeAssessment = Field(default_factory=ResumeAssessment)

    inputs: Dict[str, str] = Field(default_factory=lambda: {"jd_text": "", "cv_text": ""})
    constraints: Dict[str, Any] = Field(default_factory=lambda: {
        "total_max_time_mins": 60,
        "per_round_time_mins": {"manager": 15, "senior": 25, "expert": 20},
        "target_confidence": 85,
        "futility_stop_threshold": 3,
        "rag_top_k": 3,
    })
    categories: Dict[str, Category] = Field(default_factory=dict)
    interview_log: List[InterviewLogItem] = Field(default_factory=list)
    synthesis: Synthesis = Field(default_factory=Synthesis)
    audit: Dict[str, Any] = Field(default_factory=lambda: {
        "flags": [], 
        "notes": [],
        "safety_violations": []
    })
    errors: List[str] = Field(default_factory=list)

# Architect strict output schema (for validation only)
class ArchitectOutSub(BaseModel):
    status: str = Field("Pending", pattern=r"^(Pending)$")

class ArchitectOutCat(BaseModel):
    assigned_agent: str
    SubTopics: Dict[str, ArchitectOutSub]

class ArchitectOut(BaseModel):
    categories: Dict[str, ArchitectOutCat]

# --- Schemas for Nested API Responses ---
class CandidateBase(BaseModel):
    id: int
    email: str
    full_name: str
    cv_text: str
    model_config = ConfigDict(from_attributes=True)

from datetime import datetime

class InterviewSessionBase(BaseModel):
    id: int
    session_uuid: str
    status: str
    access_code: str
    requisition_id: int
    candidate_id: int
    scheduled_at: Optional[datetime] = None
    scheduled_timezone: Optional[str] = "UTC"
    ai_integrity_score: Optional[float] = 100.0
    is_ai_flagged: bool = False
    dar_data: dict
    candidate: CandidateBase
    model_config = ConfigDict(from_attributes=True)

class RequisitionDetails(BaseModel):
    id: int
    title: str
    ats_id: Optional[str] = None
    status: str
    jd_text: str
    owner_id: int
    interview_sessions: List[InterviewSessionBase] = []
    model_config = ConfigDict(from_attributes=True)

class ScheduleInfoResponse(BaseModel):
    session_uuid: str
    candidate_name: str
    candidate_email: str
    requisition_title: str
    access_code: str
    scheduled_at: Optional[datetime] = None
    scheduled_timezone: Optional[str] = "UTC"
    available_days: List[Dict[str, Any]] = []

class BookSlotRequest(BaseModel):
    datetime_iso: str
    timezone: str = "UTC"

class BookSlotResponse(BaseModel):
    message: str
    session_uuid: str
    scheduled_at: datetime
    scheduled_timezone: str
    google_calendar_url: str
    ics_download_url: str
    interview_url: str

class AIDetectRequest(BaseModel):
    text: str