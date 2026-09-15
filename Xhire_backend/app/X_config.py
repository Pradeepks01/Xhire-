import os
import pathlib
from dotenv import load_dotenv

# Load .env file if present
load_dotenv()

# ==============================
# ---------- CONFIG ------------
# ==============================
GENERATION_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.7-flash",
    "gemini-pro-latest",
    "gemini-2.5-pro"
]

DEFAULT_BASE_URL = os.environ.get("LLM_BASE_URL", "http://127.0.0.1:11434/v1")
DEFAULT_MODEL    = os.environ.get("LLM_MODEL", GENERATION_MODELS[0])
DEFAULT_API_KEY  = os.environ.get("LLM_API_KEY", "not-needed")

# ==============================
# ---------- EMAIL & FRONTEND --
# ==============================
FRONTEND_URL     = os.environ.get("FRONTEND_URL", "http://localhost:3000")
SMTP_HOST        = os.environ.get("SMTP_HOST", "")
SMTP_PORT        = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER        = os.environ.get("SMTP_USER", "")
SMTP_PASSWORD    = os.environ.get("SMTP_PASSWORD", "")
SMTP_FROM        = os.environ.get("SMTP_FROM", "noreply@xhire.ai")
SMTP_TLS         = os.environ.get("SMTP_TLS", "true").lower() in ("true", "1", "yes")

# ==============================
# ---------- GUARDRAILS --------
# ==============================
# Configuration for the safety guardrail model
GUARD_BASE_URL = os.environ.get("GUARD_LLM_BASE_URL", "http://127.0.0.1:11434/v1")
GUARD_MODEL    = os.environ.get("GUARD_LLM_MODEL", "hf.co/mradermacher/Llama-3.1-Nemotron-Safety-Guard-8B-v3-GGUF:Q4_K_M")
GUARD_API_KEY  = os.environ.get("GUARD_LLM_API_KEY", "ollama")


DEFAULT_EMB      = os.environ.get("EMB_MODEL", "text-embedding-3-small")  # used if server supports embeddings

# ==============================
# ---------- VOICE I/O ---------
# ==============================
DEFAULT_TTS_URL = os.environ.get("TTS_URL", "http://127.0.0.1:5000")
DEFAULT_ASR_URL = os.environ.get("ASR_URL", "http://127.0.0.1:2022/v1/audio/transcriptions")

ROUND_ORDER = ["manager", "senior", "expert"]
AGENT_NAME = {
    "manager": "ManagerInterviewer",
    "senior": "SeniorDS_Interviewer",
    "expert": "ExpertDS_Interviewer",
}
KB_DIR = pathlib.Path("rag")

DEPTH_LABEL = {1: "L1 Recall", 2: "L2 Application", 3: "L3 Analysis"}

RUBRICS = {
    "manager": {"criteria": {"clarity_star": 25, "ownership_impact": 25, "teamwork_communication": 25, "reflection": 15, "integrity": 10}},
    "senior":  {"criteria": {"problem_framing": 20, "architecture_design": 30, "tradeoffs": 25, "implementation_reasoning": 15, "communication": 10}},
    "expert":  {"criteria": {"conceptual_correctness": 35, "mechanistic_understanding": 25, "comparative_reasoning": 25, "math_intuition": 15}},
}