import pytest
from app.resume_validator import validate_resume_text

def test_vtu_marksheet_rejection():
    # Exact text from user's uploaded image
    vtu_result_text = """
    ವಿ.ತಾ.ವಿ ಪದವಿ / ಸ್ನಾತಕೋತ್ತರ ಪದವಿ ಪರೀಕ್ಷೆಯ ಸಾಮಯಿಕ ಫಲಿತಾಂಶ ಡಿಸೆಂಬರ್-೨೦೨೫ / ಜನವರಿ-೨೦೨೬.
    VTU PROVISIONAL RESULTS OF UG / PG December-2025 / January-2026 EXAMINATION.
    Nomenclature / Abbreviations
    Note :
    1) Some subject results are pending due to CIE/SEE mark issues or technical reasons and will be updated shortly.
    2) Withheld results will be announced later.
    Semester : 7
    University Seat Number
    1SB22AI047
    Student Name
    PRADEEP K S
    Subject Code: 18AI71, CIE: 38, SEE: 45, Total: 83, Result: P
    SGPA: 8.24
    """
    res = validate_resume_text(vtu_result_text)
    assert res.is_valid_resume is False
    assert res.document_type == "ACADEMIC_MARKSHEET"
    assert "Academic Exam Result" in res.error_message
    print("\nRejected Marksheet Result:", res)

def test_genuine_resume_acceptance():
    valid_resume_text = """
    PRADEEP K S
    Email: pradeep@example.com | Phone: +91 9876543210
    
    PROFESSIONAL SUMMARY
    Full Stack AI Engineer with 3+ years experience building machine learning pipelines,
    FastAPI microservices, and React web applications.

    TECHNICAL SKILLS
    - Languages: Python, TypeScript, SQL
    - Frameworks: PyTorch, FastAPI, Next.js, Celery, Docker
    - Databases: PostgreSQL, Redis, SQLite

    WORK EXPERIENCE
    AI Software Engineer | Tech Corp (2023 - Present)
    - Architected distributed LLM inference engine handling 50k requests/day.
    - Reduced latency by 40% using Redis caching and asynchronous job workers.

    PROJECTS
    - Autonomous Interview Assistant: Multi-agent coordination system with real-time speech evaluation.
    - Code Complexity Analyzer: AST-based static analysis tool for Python codebases.

    EDUCATION
    Bachelor of Engineering (B.E.) in Artificial Intelligence
    Visvesvaraya Technological University (VTU), 2020 - 2024
    """
    res = validate_resume_text(valid_resume_text)
    assert res.is_valid_resume is True
    assert res.document_type == "RESUME"
    assert res.confidence_score > 70.0
    print("\nAccepted Resume Result:", res)

def test_invoice_rejection():
    invoice_text = """
    TAX INVOICE
    Bill To: John Doe
    Invoice Number: INV-2026-0042
    Invoice Date: 12-Jan-2026
    Total Amount Due: $450.00
    Payment Receipt - Paid via Credit Card
    """
    res = validate_resume_text(invoice_text)
    assert res.is_valid_resume is False
    assert res.document_type == "INVOICE"
