"""
Job Description Auto-Tuning & Question Bank Generation Engine
Transforms raw recruiter requirements into calibrated job specifications,
role-specific rubric weights, and curated multi-persona question banks.
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class AutoTuneJDRequest(BaseModel):
    raw_requirements: str
    seniority: str = "Senior"
    focus_areas: List[str] = Field(default_factory=list)

class AutoTuneJDResponse(BaseModel):
    title: str
    calibrated_seniority: str
    summary: str
    responsibilities: List[str]
    required_skills: List[str]
    nice_to_have: List[str]
    rubrics: Dict[str, Dict[str, Any]]
    curated_questions: Dict[str, List[str]]

SENIORITY_RUBRICS = {
    "Junior": {
        "manager": {"criteria": {"clarity_star": 30, "ownership_impact": 20, "teamwork_communication": 30, "reflection": 20}},
        "senior":  {"criteria": {"problem_framing": 30, "architecture_design": 15, "tradeoffs": 15, "implementation_reasoning": 40}},
        "expert":  {"criteria": {"conceptual_correctness": 45, "mechanistic_understanding": 30, "comparative_reasoning": 15, "math_intuition": 10}},
    },
    "Mid": {
        "manager": {"criteria": {"clarity_star": 25, "ownership_impact": 25, "teamwork_communication": 25, "reflection": 15, "integrity": 10}},
        "senior":  {"criteria": {"problem_framing": 25, "architecture_design": 25, "tradeoffs": 25, "implementation_reasoning": 15, "communication": 10}},
        "expert":  {"criteria": {"conceptual_correctness": 35, "mechanistic_understanding": 25, "comparative_reasoning": 25, "math_intuition": 15}},
    },
    "Senior": {
        "manager": {"criteria": {"clarity_star": 20, "ownership_impact": 35, "teamwork_communication": 20, "reflection": 15, "integrity": 10}},
        "senior":  {"criteria": {"problem_framing": 20, "architecture_design": 35, "tradeoffs": 30, "implementation_reasoning": 15}},
        "expert":  {"criteria": {"conceptual_correctness": 30, "mechanistic_understanding": 30, "comparative_reasoning": 25, "math_intuition": 15}},
    },
    "Lead": {
        "manager": {"criteria": {"clarity_star": 15, "ownership_impact": 40, "teamwork_communication": 25, "reflection": 20}},
        "senior":  {"criteria": {"problem_framing": 15, "architecture_design": 40, "tradeoffs": 35, "implementation_reasoning": 10}},
        "expert":  {"criteria": {"conceptual_correctness": 25, "mechanistic_understanding": 25, "comparative_reasoning": 35, "math_intuition": 15}},
    }
}

def auto_tune_job_description(
    raw_text: str,
    seniority: str = "Senior",
    focus_areas: Optional[List[str]] = None
) -> AutoTuneJDResponse:
    """
    Analyzes raw recruiter notes and auto-generates structured JD,
    custom rubric weights, and targeted question banks.
    """
    clean_raw = raw_text.strip()
    norm_seniority = seniority.capitalize()
    if norm_seniority not in SENIORITY_RUBRICS:
        norm_seniority = "Senior"

    # Infer or extract role title
    first_line = clean_raw.split('\n')[0][:60].strip()
    if any(k in first_line.lower() for k in ["engineer", "developer", "scientist", "architect", "lead"]):
        title = first_line
    else:
        title = f"{norm_seniority} AI / Software Engineer"

    # Calibrate Rubrics
    rubrics = SENIORITY_RUBRICS.get(norm_seniority, SENIORITY_RUBRICS["Senior"])

    # Extract keywords for question personalization
    kw_raw = clean_raw.lower()
    tech_tags = []
    if "python" in kw_raw: tech_tags.append("Python")
    if "pytorch" in kw_raw: tech_tags.append("PyTorch")
    if "distributed" in kw_raw or "scaling" in kw_raw: tech_tags.append("Distributed Systems")
    if "fastapi" in kw_raw or "api" in kw_raw: tech_tags.append("API Engineering")
    if "redis" in kw_raw or "cache" in kw_raw: tech_tags.append("High-Throughput Caching")
    if "docker" in kw_raw or "kubernetes" in kw_raw: tech_tags.append("Container Orchestration")
    if "sql" in kw_raw or "postgres" in kw_raw: tech_tags.append("Database Architecture")
    if not tech_tags:
        tech_tags = ["Python", "Machine Learning Pipelines", "System Architecture", "API Design"]

    # Generate Targeted Question Banks per Persona
    curated_questions = {
        "manager": [
            f"Describe a situation where you had to lead the design or delivery of a critical {tech_tags[0]} initiative under tight deadlines.",
            "Can you tell me about a time a production release failed or caused performance regression? How did you manage stakeholder communication and mitigation?",
            "How do you resolve technical disagreements regarding architectural tradeoffs within your engineering team?",
            "Tell me about a high-impact optimization you delivered that significantly reduced cloud cost or latency."
        ],
        "senior": [
            f"How would you architect a fault-tolerant, horizontally scalable pipeline using {tech_tags[0]} and asynchronous workers?",
            f"Suppose our API experiences a 10x traffic surge during peak hours. What bottleneck mitigation strategies and caching layers would you deploy?",
            "Walk me through how you choose between synchronous REST/gRPC vs. asynchronous event-driven queues (e.g. Celery/Kafka) for real-time inference.",
            "How do you design database schema migrations and indexing strategies for high-write tables without incurring downtime?"
        ],
        "expert": [
            f"Explain the internal mechanistic execution of {tech_tags[0]}. How does the runtime manage memory, garbage collection, or tensor allocation?",
            "Compare the computational tradeoffs of KV caching, quantization (FP16 vs INT8/INT4), and batch size scaling in LLM serving engines.",
            "How would you diagnose and eliminate GIL contention, CPU thread thrashing, or CUDA memory fragmentation under concurrent workloads?",
            "What mathematical objective functions or regularizations would you apply to prevent gradient explosion and training instability in deep models?"
        ]
    }

    # Generate Structured Responsibilities & Skills
    responsibilities = [
        f"Architect, scale, and maintain high-performance {title} backend services and ML pipelines.",
        "Collaborate cross-functionally with product managers and infrastructure teams to design resilient systems.",
        "Drive code review rigor, unit test coverage, and automated CI/CD deployment pipelines.",
        "Monitor production service health, investigate tail-latency anomalies, and ensure 99.9% uptime SLAs."
    ]

    required_skills = [
        f"{'5+' if norm_seniority in ['Senior', 'Lead'] else '2+'} years of experience building scalable backend software or AI platforms.",
        f"Deep hands-on proficiency with {', '.join(tech_tags[:3])}.",
        "Solid foundations in data structures, concurrency, distributed caching, and relational databases.",
        "Demonstrated ability to make rigorous engineering tradeoffs between throughput, latency, and operational complexity."
    ]

    nice_to_have = [
        "Experience with WebRTC, real-time audio streaming, or multi-agent LLM systems.",
        "Contributions to open-source software libraries or engineering research publications.",
        "Experience with Kubernetes, Helm, and cloud-native infrastructure automation (Terraform, AWS, GCP)."
    ]

    summary = (
        f"We are looking for an exceptional {title} ({norm_seniority} Level) to lead the development of our "
        f"autonomous multi-agent platforms. In this role, you will design distributed services, optimize inference "
        f"pipelines, and drive system reliability at scale."
    )

    return AutoTuneJDResponse(
        title=title,
        calibrated_seniority=norm_seniority,
        summary=summary,
        responsibilities=responsibilities,
        required_skills=required_skills,
        nice_to_have=nice_to_have,
        rubrics=rubrics,
        curated_questions=curated_questions
    )
