"""
Comparative Candidate Matrix Engine
Aggregates candidate evaluations across a requisition, calculates statistical
percentile rankings across rubric dimensions, and builds multi-candidate radar datasets.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

STANDARD_CATEGORIES = [
    "Problem Framing",
    "Architecture Design",
    "Tradeoffs & Scalability",
    "Conceptual Correctness",
    "Mechanistic Understanding",
    "Communication & STAR"
]

class CandidateMetric(BaseModel):
    session_uuid: str
    candidate_name: str
    candidate_email: str
    status: str
    overall_score: float
    percentile: float
    rank: int
    scores: Dict[str, float]
    percentiles: Dict[str, float]
    radar_data: List[Dict[str, Any]]
    ai_integrity_score: float
    is_ai_flagged: bool

class CandidateMatrixResponse(BaseModel):
    requisition_id: int
    requisition_title: str
    total_candidates: int
    completed_candidates: int
    radar_categories: List[str]
    leaderboard: List[CandidateMetric]
    category_averages: Dict[str, float]
    top_strengths: Dict[str, str]

def compute_percentile(score: float, all_scores: List[float]) -> float:
    """Calculates empirical percentile rank (0-100%)."""
    if not all_scores:
        return 50.0
    less_count = sum(1 for s in all_scores if s < score)
    equal_count = sum(1 for s in all_scores if s == score)
    pct = ((less_count + (0.5 * equal_count)) / len(all_scores)) * 100.0
    return round(pct, 1)

def extract_category_scores(dar_data: Dict[str, Any]) -> Dict[str, float]:
    """Extracts normalized category scores (0-100) from DAR synthesis radar or categories."""
    scores = {}
    synthesis = dar_data.get("synthesis", {}) if isinstance(dar_data, dict) else {}
    radar = synthesis.get("radar_data", {})

    # Use radar data if present
    for cat in STANDARD_CATEGORIES:
        if cat in radar:
            scores[cat] = float(radar[cat])
        elif cat.lower() in [k.lower() for k in radar]:
            key = next(k for k in radar if k.lower() == cat.lower())
            scores[cat] = float(radar[key])
        else:
            # Fallback estimation from overall final_score with small natural variation
            base = float(synthesis.get("final_score") or 65.0)
            scores[cat] = max(20.0, min(95.0, base))

    return scores

def build_candidate_matrix(
    requisition_id: int,
    requisition_title: str,
    sessions: List[Any]
) -> CandidateMatrixResponse:
    """
    Computes comparative rankings, percentiles across rubric dimensions,
    and multi-candidate radar chart data.
    """
    candidates_data = []

    for s in sessions:
        dar = s.dar_data if isinstance(s.dar_data, dict) else {}
        synth = dar.get("synthesis", {}) if isinstance(dar, dict) else {}
        final_score = float(synth.get("final_score") or 0.0)
        scores = extract_category_scores(dar)

        cand_name = s.candidate.full_name if s.candidate else "Candidate"
        cand_email = s.candidate.email if s.candidate else ""

        candidates_data.append({
            "session_uuid": s.session_uuid,
            "candidate_name": cand_name,
            "candidate_email": cand_email,
            "status": s.status,
            "overall_score": final_score,
            "scores": scores,
            "ai_integrity_score": getattr(s, "ai_integrity_score", 100.0) or 100.0,
            "is_ai_flagged": getattr(s, "is_ai_flagged", False) or False,
        })

    # Sort candidates by overall score descending
    candidates_data.sort(key=lambda x: x["overall_score"], reverse=True)

    all_overall_scores = [c["overall_score"] for c in candidates_data]
    category_scores_map = {
        cat: [c["scores"].get(cat, 50.0) for c in candidates_data]
        for cat in STANDARD_CATEGORIES
    }

    # Category Averages
    category_averages = {
        cat: round(sum(scores) / len(scores), 1) if scores else 0.0
        for cat, scores in category_scores_map.items()
    }

    leaderboard: List[CandidateMetric] = []
    top_strengths: Dict[str, str] = {}

    for idx, c in enumerate(candidates_data):
        c_overall_pct = compute_percentile(c["overall_score"], all_overall_scores)
        cat_pcts = {
            cat: compute_percentile(c["scores"].get(cat, 50.0), category_scores_map[cat])
            for cat in STANDARD_CATEGORIES
        }

        radar_data = [
            {"category": cat, "score": round(c["scores"].get(cat, 50.0), 1)}
            for cat in STANDARD_CATEGORIES
        ]

        leaderboard.append(CandidateMetric(
            session_uuid=c["session_uuid"],
            candidate_name=c["candidate_name"],
            candidate_email=c["candidate_email"],
            status=c["status"],
            overall_score=round(c["overall_score"], 1),
            percentile=c_overall_pct,
            rank=idx + 1,
            scores={k: round(v, 1) for k, v in c["scores"].items()},
            percentiles=cat_pcts,
            radar_data=radar_data,
            ai_integrity_score=round(c["ai_integrity_score"], 1),
            is_ai_flagged=c["is_ai_flagged"]
        ))

    # Determine top performers per category
    for cat in STANDARD_CATEGORIES:
        if candidates_data:
            best = max(candidates_data, key=lambda x: x["scores"].get(cat, 0))
            best_score = best["scores"].get(cat, 0)
            if best_score > 0:
                top_strengths[cat] = f"{best['candidate_name']} ({best_score:.0f}%)"

    completed_count = sum(1 for c in candidates_data if c["status"] == "completed")

    return CandidateMatrixResponse(
        requisition_id=requisition_id,
        requisition_title=requisition_title,
        total_candidates=len(candidates_data),
        completed_candidates=completed_count,
        radar_categories=STANDARD_CATEGORIES,
        leaderboard=leaderboard,
        category_averages=category_averages,
        top_strengths=top_strengths
    )
