"""
Document Classification & Resume Validation Engine
Inspects uploaded documents to determine whether they are genuine candidate resumes
or invalid documents such as academic exam result sheets, mark cards, or invoices.
"""

import re
from typing import List, Tuple, Dict, Any
from pydantic import BaseModel, Field

# Patterns indicating an Academic Marksheet or Exam Result sheet
MARKSHEET_PATTERNS = [
    r"\bprovisional results?\b",
    r"\buniversity seat number\b",
    r"\busn\b",
    r"\bsemester\s*:\s*\d+",
    r"\bcie/see marks?\b",
    r"\bwithheld results?\b",
    r"\bnomenclature\s*/\s*abbreviations\b",
    r"\bgrade card\b",
    r"\bmarks card\b",
    r"\bmarks sheet\b",
    r"\bexamination results?\b",
    r"\bstatement of marks\b",
    r"\bsgpa\b",
    r"\bcgpa\s*:\s*\d+",
    r"\bsubject code\b",
    r"\bcourse code\b",
    r"\bcredits earned\b",
    r"\bcredits registered\b",
    r"\btotal credits\b",
    r"\bvtu\b",
    r"\bcontroller of examinations\b",
    r"\bregistrar \(evaluation\)\b",
]

# Patterns indicating an Invoice, Receipt, or Bill
INVOICE_PATTERNS = [
    r"\btax invoice\b",
    r"\bbill to\b",
    r"\binvoice number\b",
    r"\binvoice date\b",
    r"\bpayment receipt\b",
    r"\btotal amount due\b",
    r"\belectricity bill\b",
    r"\bgst(?:in)?\s*:\s*\w+",
]

# Positive Resume Anchors (a real resume should contain several of these)
RESUME_EXPERIENCE_PATTERNS = [
    r"\bexperience\b",
    r"\bwork history\b",
    r"\bemployment\b",
    r"\bprojects?\b",
    r"\binternships?\b",
    r"\bprofessional experience\b",
    r"\bkey responsibilities\b",
    r"\bachievements\b",
]

RESUME_SKILLS_PATTERNS = [
    r"\bskills?\b",
    r"\btechnologies\b",
    r"\bprogramming languages?\b",
    r"\btechnical proficienc(?:y|ies)\b",
    r"\btools & frameworks\b",
    r"\bcore competencies\b",
]

RESUME_EDUCATION_PATTERNS = [
    r"\beducation\b",
    r"\bbachelor\b",
    r"\bmaster\b",
    r"\bdegree\b",
    r"\bb\.?e\.?\b",
    r"\bb\.?tech\b",
    r"\bm\.?tech\b",
    r"\bm\.?s\.?\b",
    r"\buniversity\b",
    r"\bcollege\b",
]

class ResumeValidationResult(BaseModel):
    is_valid_resume: bool
    document_type: str  # "RESUME", "ACADEMIC_MARKSHEET", "INVOICE", "EVALUATION_REPORT", "UNRECOGNIZED"
    error_message: str = ""
    detected_indicators: List[str] = Field(default_factory=list)
    confidence_score: float = Field(..., description="Confidence that document is a resume (0-100%)")

def validate_resume_text(text: str) -> ResumeValidationResult:
    """
    Validates whether the uploaded text is a genuine candidate resume.
    Rejects exam marks cards, invoices, evaluation reports, or random text.
    """
    if not text or len(text.strip()) < 50:
        return ResumeValidationResult(
            is_valid_resume=False,
            document_type="UNRECOGNIZED",
            error_message="The uploaded document is too short or contains insufficient text to be a valid resume.",
            confidence_score=0.0
        )

    clean_lower = text.lower()

    # 1. Check for Internal Evaluation Report accidental upload
    if (
        "technical interview evaluation report" in clean_lower or
        "autonomous technical screening" in clean_lower or
        "interview score (proof)" in clean_lower
    ):
        return ResumeValidationResult(
            is_valid_resume=False,
            document_type="EVALUATION_REPORT",
            error_message="The uploaded file appears to be an Xhire Interview Evaluation Report, not a candidate resume.",
            confidence_score=0.0,
            detected_indicators=["Evaluation Report Headers"]
        )

    # 2. Check for Academic Marksheet / Results
    marksheet_matches = []
    for pattern in MARKSHEET_PATTERNS:
        matches = re.findall(pattern, clean_lower)
        if matches:
            marksheet_matches.append(matches[0])

    if len(marksheet_matches) >= 2:
        return ResumeValidationResult(
            is_valid_resume=False,
            document_type="ACADEMIC_MARKSHEET",
            error_message=(
                f"The uploaded document appears to be an Academic Exam Result / Marksheet "
                f"({', '.join(marksheet_matches[:3])}), not a candidate resume/CV. "
                "Please upload a candidate resume containing professional skills, projects, and work experience."
            ),
            detected_indicators=marksheet_matches,
            confidence_score=5.0
        )

    # 3. Check for Invoice or Financial Bill
    invoice_matches = []
    for pattern in INVOICE_PATTERNS:
        matches = re.findall(pattern, clean_lower)
        if matches:
            invoice_matches.append(matches[0])

    if len(invoice_matches) >= 2:
        return ResumeValidationResult(
            is_valid_resume=False,
            document_type="INVOICE",
            error_message="The uploaded file appears to be an invoice or receipt, not a candidate resume.",
            detected_indicators=invoice_matches,
            confidence_score=0.0
        )

    # 4. Check for Positive Resume Pillars
    has_exp = any(re.search(p, clean_lower) for p in RESUME_EXPERIENCE_PATTERNS)
    has_skills = any(re.search(p, clean_lower) for p in RESUME_SKILLS_PATTERNS)
    has_edu = any(re.search(p, clean_lower) for p in RESUME_EDUCATION_PATTERNS)

    matched_sections = []
    if has_exp:
        matched_sections.append("Experience/Projects")
    if has_skills:
        matched_sections.append("Skills/Technologies")
    if has_edu:
        matched_sections.append("Education")

    # A genuine resume must have at least 2 of the 3 primary sections
    if len(matched_sections) < 2:
        return ResumeValidationResult(
            is_valid_resume=False,
            document_type="UNRECOGNIZED",
            error_message=(
                "The uploaded document does not match a standard candidate resume format. "
                "A valid resume must contain at least two core sections: Work Experience/Projects, "
                "Technical Skills, or Educational background."
            ),
            detected_indicators=matched_sections,
            confidence_score=25.0
        )

    # Calculate confidence score
    confidence = 60.0 + (len(matched_sections) * 12.0)
    word_count = len(text.split())
    if word_count >= 150:
        confidence = min(98.0, confidence + 10.0)

    return ResumeValidationResult(
        is_valid_resume=True,
        document_type="RESUME",
        error_message="",
        detected_indicators=matched_sections,
        confidence_score=round(confidence, 1)
    )
