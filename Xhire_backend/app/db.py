import os
from sqlmodel import create_engine, SQLModel, Session

# Get the database URL from the environment variable, normalizing postgres:// to postgresql://
DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./Xhire.db")
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

if DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
    engine = create_engine(DATABASE_URL, echo=False, connect_args=connect_args)
else:
    # PostgreSQL configuration with connection pooling and pre-ping
    engine = create_engine(
        DATABASE_URL,
        echo=False,
        pool_size=10,
        max_overflow=20,
        pool_pre_ping=True,
    )

def create_db_and_tables():
    """Initializes the database and tables, adding new columns safely if missing."""
    from sqlalchemy import text
    SQLModel.metadata.create_all(engine)
    
    # Safe column additions for existing databases
    with engine.connect() as conn:
        for col, col_type in [
            ("scheduled_at", "TIMESTAMP"),
            ("scheduled_timezone", "VARCHAR"),
            ("ai_integrity_score", "FLOAT"),
            ("is_ai_flagged", "BOOLEAN DEFAULT FALSE"),
        ]:
            try:
                conn.execute(text(f"ALTER TABLE interviewsession ADD COLUMN {col} {col_type}"))
                conn.commit()
            except Exception:
                # Column already exists
                pass

def get_session():
    """FastAPI dependency to get a database session."""
    with Session(engine) as session:
        yield session