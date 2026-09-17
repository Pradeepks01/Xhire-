import pytest
from app.jd_autotuner import auto_tune_job_description

def test_auto_tune_senior_ai_engineer():
    raw_req = """
    Looking for a Senior Python & Machine Learning Engineer.
    Needs 5+ years experience with PyTorch, distributed systems, FastAPI, and Redis caching.
    Will build low latency inference pipelines.
    """
    res = auto_tune_job_description(raw_req, seniority="Senior")
    assert "Senior" in res.calibrated_seniority
    assert len(res.responsibilities) >= 3
    assert len(res.required_skills) >= 3
    assert "manager" in res.rubrics
    assert "senior" in res.rubrics
    assert "expert" in res.rubrics
    assert len(res.curated_questions["manager"]) >= 3
    assert len(res.curated_questions["senior"]) >= 3
    assert len(res.curated_questions["expert"]) >= 3

def test_auto_tune_junior_calibration():
    raw_req = "Junior Python Developer with knowledge of data structures and web APIs."
    res = auto_tune_job_description(raw_req, seniority="Junior")
    assert res.calibrated_seniority == "Junior"
    # Junior rubrics emphasize implementation and conceptual correctness over architecture
    assert res.rubrics["expert"]["criteria"]["conceptual_correctness"] >= 40
