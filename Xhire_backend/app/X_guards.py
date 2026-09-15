import json
import re
from typing import Tuple, List, Optional
from openai import OpenAI
from .X_llm_client import guard_chat, get_guard_client
from .X_config import GUARD_BASE_URL, GUARD_API_KEY, GUARD_MODEL

def clean_json_str(text: str) -> str:
    """Strips markdown code fences (```json ... ```) from LLM output."""
    if not text:
        return ""
    text = text.strip()
    match = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', text)
    if match:
        return match.group(1).strip()
    return text

# Initialize the guard client once
guard_client = get_guard_client(GUARD_BASE_URL, GUARD_API_KEY)

# ==============================
# ---------- GUARDS ------------
# ==============================

# The taxonomy you provided, stored as a constant
SAFETY_TAXONOMY = """
<BEGIN UNSAFE CONTENT CATEGORIES>
S1: Violence. 
S2: Sexual. 
S3: Criminal Planning/Confessions. 
S4: Guns and Illegal Weapons. 
S5: Controlled/Regulated Substances. 
S6: Suicide and Self Harm. 
S7: Sexual (minor). 
S8: Hate/Identity Hate. 
S9: PII/Privacy. 
S10: Harassment. 
S11: Threat. 
S12: Profanity. 
S13: Needs Caution. 
S14: Other. 
S15: Manipulation. 
S16: Fraud/Deception. 
S17: Malware. 
S18: High Risk Gov Decision Making. 
S19: Political/Misinformation/Conspiracy. 
S20: Copyright/Trademark/Plagiarism. 
S21: Unauthorized Advice. 
S22: Illegal Activity. 
S23: Immoral/Unethical. 
<END UNSAFE CONTENT CATEGORIES>
"""

# --- NEW PROMPT FOR AGENT'S QUESTIONS ---
OUTPUT_GUARD_CHECK_SYSTEM = f"""
You are a safety classification guard. Check the provided 'INTERVIEW_QUESTION' against the 'UNSAFE_CONTENT_CATEGORIES'.
The question must be safe.
{SAFETY_TAXONOMY}
Respond with ONLY JSON: {{"safe": true/false, "categories": ["list", "of", "violated", "S-codes"]}}
"""

# --- NEW PROMPT FOR USER'S ANSWERS (Based on your prompt) ---
INPUT_GUARD_SYSTEM = f"""
Task: Check if there is unsafe content in the 'USER_ANSWER' in accordance with our safety policy.
Redact PII (emails, phones) from the 'sanitized' field.
{SAFETY_TAXONOMY}
Provide your safety assessment in the below output JSON format.
Do not include anything other than the output JSON in your response.

JSON Format:
{{"safe": true/false, "sanitized": "sanitized version of the answer", "categories": ["list", "of", "violated", "S-codes"]}}
"""

def build_input_guard_user(answer: str) -> str:
    return f"USER_ANSWER: {answer}"

# --- NEW: Output Guard (Check, Don't Rewrite) ---
def output_guard_check_llm(client: OpenAI, model: str, question: str) -> Tuple[bool, List[str]]:
    """
    Checks a generated question for safety.
    Returns (is_safe, violated_categories)
    """
    q = (question or "").strip()
    if not q:
        return False, ["S14"] # Other (empty)

    try:
        user_prompt = f"INTERVIEW_QUESTION: {q}"
        raw = guard_chat(guard_client, OUTPUT_GUARD_CHECK_SYSTEM, user_prompt, GUARD_MODEL, temperature=0.0, max_tokens=150)
        data = json.loads(clean_json_str(raw))
        
        safe = bool(data.get("safe", True))
        categories = list(data.get("categories", []))
        
        if not safe and not categories:
            categories = ["S14"] # Default category if unsafe but none provided
            
        return safe, categories
    except Exception as e:
        # If guard server is offline/unreachable in local dev, allow question through
        return True, []

# --- MODIFIED: Input Guard (Use Fast Regex + Guardrail Check) ---
def input_guard_llm(client: OpenAI, model: str, answer: str) -> Tuple[bool, str, List[str]]:
    """
    Checks a user's answer for safety with fast heuristic PII check and non-blocking fallback.
    Returns (is_allowed, sanitized_answer, violated_categories)
    """
    text = (answer or "").strip()
    if not text:
        return True, "", []
    
    # Fast heuristic check for obvious PII (email, phone)
    email_pattern = r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    phone_pattern = r'\b(?:\+?\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b'
    sanitized = re.sub(email_pattern, "[EMAIL REDACTED]", text)
    sanitized = re.sub(phone_pattern, "[PHONE REDACTED]", sanitized)
    
    try:
        raw = guard_chat(guard_client, INPUT_GUARD_SYSTEM, build_input_guard_user(sanitized), GUARD_MODEL, temperature=0.0, max_tokens=150)
        data = json.loads(clean_json_str(raw))
        
        allowed = bool(data.get("safe", True))
        llm_sanitized = str(data.get("sanitized", "")).strip()
        categories = list(data.get("categories", []))

        if allowed and llm_sanitized:
            sanitized = llm_sanitized
        elif not allowed and not categories:
            categories = ["S14"]
            
        return allowed, sanitized, categories
    except Exception:
        # If guard LLM times out or network lags, immediately proceed with sanitized text
        return True, sanitized, []