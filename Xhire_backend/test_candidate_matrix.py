import pytest
from app.candidate_matrix import build_candidate_matrix, compute_percentile, extract_category_scores

class MockCandidate:
    def __init__(self, name, email):
        self.full_name = name
        self.email = email

class MockSession:
    def __init__(self, uuid, name, email, score, status="completed", flagged=False):
        self.session_uuid = uuid
        self.status = status
        self.candidate = MockCandidate(name, email)
        self.ai_integrity_score = 95.0
        self.is_ai_flagged = flagged
        self.dar_data = {
            "synthesis": {
                "final_score": score,
                "radar_data": {
                    "Problem Framing": score - 5,
                    "Architecture Design": score + 5,
                    "Tradeoffs & Scalability": score,
                    "Conceptual Correctness": score - 2,
                    "Mechanistic Understanding": score + 2,
                    "Communication & STAR": score - 4,
                }
            }
        }

def test_percentile_calculation():
    scores = [50.0, 60.0, 70.0, 80.0, 90.0]
    assert compute_percentile(90.0, scores) == 90.0
    assert compute_percentile(50.0, scores) == 10.0
    assert compute_percentile(70.0, scores) == 50.0

def test_build_candidate_matrix():
    mock_sessions = [
        MockSession("uuid-1", "Alice Smith", "alice@example.com", 92.0),
        MockSession("uuid-2", "Bob Jones", "bob@example.com", 84.0),
        MockSession("uuid-3", "Charlie Brown", "charlie@example.com", 72.0),
    ]

    matrix = build_candidate_matrix(1, "Senior AI Engineer", mock_sessions)
    assert matrix.total_candidates == 3
    assert matrix.completed_candidates == 3
    assert len(matrix.leaderboard) == 3
    assert matrix.leaderboard[0].candidate_name == "Alice Smith"
    assert matrix.leaderboard[0].rank == 1
    assert matrix.leaderboard[0].percentile > 80.0
    assert "Problem Framing" in matrix.category_averages
    assert len(matrix.top_strengths) > 0
