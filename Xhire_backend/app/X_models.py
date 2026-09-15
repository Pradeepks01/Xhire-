
from typing import Optional, List, Any
from sqlmodel import Field, SQLModel, Relationship, JSON, Column
from datetime import datetime, timezone
import uuid 

from .X_hire_schemas import DAR3 


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    hashed_password: str
    role: str = Field(index=True)  # "recruiter", "hm", "admin"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    requisitions: List["Requisition"] = Relationship(back_populates="owner")

class Requisition(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    title: str
    ats_id: Optional[str] = Field(default=None, index=True)
    status: str = Field(default="open", index=True)
    jd_text: str = Field(sa_column=Column(JSON))
    owner_id: int = Field(foreign_key="user.id")
    owner: User = Relationship(back_populates="requisitions")
    interview_sessions: List["InterviewSession"] = Relationship(
        back_populates="requisition", sa_relationship_kwargs={"lazy": "selectin"}
    )

class Candidate(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(unique=True, index=True)
    full_name: str
    cv_text: str = Field(sa_column=Column(JSON))
    interview_sessions: List["InterviewSession"] = Relationship(back_populates="candidate")

class InterviewSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_uuid: str = Field(unique=True, index=True)
    status: str = Field(default="pending", index=True) # "pending", "started", "completed"

    access_code: str = Field(
        default_factory=lambda: str(uuid.uuid4())[:8].upper(), 
        unique=True, 
        index=True
    )
    
    requisition_id: int = Field(foreign_key="requisition.id")
    candidate_id: int = Field(foreign_key="candidate.id")
    
    requisition: Requisition = Relationship(back_populates="interview_sessions")
    candidate: Candidate = Relationship(
        back_populates="interview_sessions", sa_relationship_kwargs={"lazy": "selectin"}
    )

    # Scheduling fields
    scheduled_at: Optional[datetime] = Field(default=None, index=True)
    scheduled_timezone: Optional[str] = Field(default="UTC")

    # AI Text Detection & Integrity fields
    ai_integrity_score: Optional[float] = Field(default=100.0)
    is_ai_flagged: bool = Field(default=False, index=True)

    # THE CORE: This column stores your *ENTIRE* DAR3 object.
    # We use JSONB for efficient querying in PostgreSQL.
    dar_data: dict = Field(sa_column=Column(JSON))