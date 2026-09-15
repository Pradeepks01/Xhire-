import pytest
from sqlmodel import SQLModel, create_engine, Session, select
from app.X_models import User, Requisition, Candidate, InterviewSession
from app.worker import celery_app, start_interview_task, process_answer_task

def test_database_models_in_memory():
    """Test SQLModel schemas, tables creation, and relationship integrity in an in-memory SQLite DB."""
    test_engine = create_engine("sqlite:///:memory:", echo=False)
    SQLModel.metadata.create_all(test_engine)

    with Session(test_engine) as session:
        # 1. Create Recruiter User
        user = User(
            email="test_recruiter@example.com",
            full_name="Test Recruiter",
            hashed_password="hashed_secret_pw",
            role="recruiter",
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        assert user.id is not None
        assert user.email == "test_recruiter@example.com"

        # 2. Create Requisition
        req = Requisition(
            title="Senior AI Engineer",
            ats_id="REQ-101",
            status="open",
            jd_text={"role": "AI Engineer", "level": "Senior"},
            owner_id=user.id,
        )
        session.add(req)
        session.commit()
        session.refresh(req)
        assert req.id is not None

        # 3. Create Candidate
        cand = Candidate(
            email="candidate@example.com",
            full_name="Jane Doe",
            cv_text="Experienced in Python, FastAPI, and PyTorch",
        )
        session.add(cand)
        session.commit()
        session.refresh(cand)
        assert cand.id is not None

        # 4. Create InterviewSession with DAR data
        session_obj = InterviewSession(
            session_uuid="test-session-uuid-1234",
            status="pending",
            requisition_id=req.id,
            candidate_id=cand.id,
            dar_data={"round": "manager", "scores": {"clarity": 25}},
        )
        session.add(session_obj)
        session.commit()
        session.refresh(session_obj)
        assert session_obj.id is not None
        assert session_obj.access_code is not None
        assert len(session_obj.access_code) == 8
        assert session_obj.dar_data["round"] == "manager"

def test_celery_task_definitions():
    """Verify Celery task registration and configuration."""
    assert celery_app is not None
    assert start_interview_task.name == "start_interview_task"
    assert process_answer_task.name == "process_answer_task"
