"""
Data Migration Script: SQLite (Xhire.db) -> PostgreSQL
Usage:
    python migrate_to_postgres.py "postgresql://user:password@host:5432/dbname"
"""

import sys
import os
from sqlmodel import create_engine, Session, select, SQLModel
from app.X_models import User, Requisition, Candidate, InterviewSession

def run_migration(pg_url: str, sqlite_path: str = "Xhire.db"):
    print(f"Connecting to source SQLite: {sqlite_path}")
    if not os.path.exists(sqlite_path):
        print(f"Error: SQLite source file '{sqlite_path}' does not exist.")
        return False

    sqlite_engine = create_engine(f"sqlite:///{sqlite_path}", echo=False)
    print(f"Connecting to target PostgreSQL: {pg_url}")
    pg_engine = create_engine(pg_url, echo=False)

    print("Creating all tables in PostgreSQL target...")
    SQLModel.metadata.create_all(pg_engine)

    with Session(sqlite_engine) as src_session, Session(pg_engine) as dst_session:
        # 1. Migrate Users
        users = src_session.exec(select(User)).all()
        print(f"Found {len(users)} users in SQLite.")
        for u in users:
            existing = dst_session.exec(select(User).where(User.email == u.email)).first()
            if not existing:
                dst_session.add(User(
                    id=u.id,
                    email=u.email,
                    full_name=u.full_name,
                    hashed_password=u.hashed_password,
                    role=u.role,
                    created_at=u.created_at
                ))
        dst_session.commit()
        print("Users migrated successfully.")

        # 2. Migrate Requisitions
        reqs = src_session.exec(select(Requisition)).all()
        print(f"Found {len(reqs)} requisitions in SQLite.")
        for r in reqs:
            existing = dst_session.exec(select(Requisition).where(Requisition.id == r.id)).first()
            if not existing:
                dst_session.add(Requisition(
                    id=r.id,
                    title=r.title,
                    ats_id=r.ats_id,
                    status=r.status,
                    jd_text=r.jd_text,
                    owner_id=r.owner_id
                ))
        dst_session.commit()
        print("Requisitions migrated successfully.")

        # 3. Migrate Candidates
        candidates = src_session.exec(select(Candidate)).all()
        print(f"Found {len(candidates)} candidates in SQLite.")
        for c in candidates:
            existing = dst_session.exec(select(Candidate).where(Candidate.id == c.id)).first()
            if not existing:
                dst_session.add(Candidate(
                    id=c.id,
                    email=c.email,
                    full_name=c.full_name,
                    cv_text=c.cv_text
                ))
        dst_session.commit()
        print("Candidates migrated successfully.")

        # 4. Migrate InterviewSessions
        sessions = src_session.exec(select(InterviewSession)).all()
        print(f"Found {len(sessions)} interview sessions in SQLite.")
        for s in sessions:
            existing = dst_session.exec(select(InterviewSession).where(InterviewSession.session_uuid == s.session_uuid)).first()
            if not existing:
                dst_session.add(InterviewSession(
                    id=s.id,
                    session_uuid=s.session_uuid,
                    status=s.status,
                    access_code=s.access_code,
                    requisition_id=s.requisition_id,
                    candidate_id=s.candidate_id,
                    dar_data=s.dar_data
                ))
        dst_session.commit()
        print("Interview sessions migrated successfully.")

    print("\n--- Full Database Migration Completed Successfully! ---")
    return True

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
    else:
        target_url = os.environ.get("DATABASE_URL")

    if not target_url or target_url.startswith("sqlite"):
        print("Please provide a valid PostgreSQL target URL:")
        print("python migrate_to_postgres.py 'postgresql://user:pass@host:5432/dbname'")
        sys.exit(1)

    run_migration(target_url)
