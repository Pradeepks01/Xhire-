import logging
from typing import List, Optional
from openai import OpenAI, RateLimitError, APIError, NotFoundError

log = logging.getLogger(__name__)

# Fallback generation models list requested by user
GENERATION_MODELS = [
    "gemini-flash-lite-latest",
    "gemini-2.5-flash-lite",
    "gemini-flash-latest",
    "gemini-2.5-flash",
    "gemini-3.7-flash",
    "gemini-pro-latest",
    "gemini-2.5-pro"
]

# ==============================
# ---------- LLM CLIENT --------
# ==============================

import httpx

def get_client(base_url: str, api_key: str) -> OpenAI:
    http_client = httpx.Client(
        limits=httpx.Limits(max_keepalive_connections=5, max_connections=15, keepalive_expiry=5.0),
        timeout=httpx.Timeout(15.0, connect=6.0)
    )
    return OpenAI(base_url=base_url, api_key=api_key, http_client=http_client, max_retries=2)

# Client for the Guardrail model
def get_guard_client(base_url: str, api_key: str) -> OpenAI:
    http_client = httpx.Client(
        limits=httpx.Limits(max_keepalive_connections=5, max_connections=10, keepalive_expiry=5.0),
        timeout=httpx.Timeout(12.0, connect=6.0)
    )
    return OpenAI(base_url=base_url, api_key=api_key, http_client=http_client, max_retries=2)

def _build_candidate_models(primary_model: str) -> List[str]:
    candidates = []
    if primary_model:
        candidates.append(primary_model)
    for m in ["gemini-flash-lite-latest", "gemini-2.5-flash-lite", "gemini-flash-latest"]:
        if m not in candidates:
            candidates.append(m)
    return candidates[:3]

def oai_chat(client: OpenAI, system: str, user: str, model: str, temperature=0.2, max_tokens=512) -> str:
    candidates = _build_candidate_models(model)
    last_err = None

    for cand_model in candidates:
        try:
            resp = client.chat.completions.create(
                model=cand_model,
                temperature=temperature,
                max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            return (resp.choices[0].message.content or "").strip()
        except (RateLimitError, APIError, NotFoundError, Exception) as e:
            last_err = e
            log.warning(f"Model '{cand_model}' failed ({type(e).__name__}: {e}). Rotating to next fallback model in GENERATION_MODELS...")

    log.error(f"All models in GENERATION_MODELS failed: {last_err}")
    raise last_err

# NEW: Chat function for the Guardrail model
def guard_chat(client: OpenAI, system: str, user: str, model: str, temperature=0.0, max_tokens=300) -> str:
    candidates = _build_candidate_models(model)
    last_err = None

    for cand_model in candidates:
        try:
            resp = client.chat.completions.create(
                model=cand_model,
                temperature=temperature,
                max_tokens=max_tokens,
                messages=[{"role": "system", "content": system}, {"role": "user", "content": user}],
            )
            return (resp.choices[0].message.content or "").strip()
        except (RateLimitError, APIError, NotFoundError, Exception) as e:
            last_err = e
            log.warning(f"Guardrail model '{cand_model}' failed ({type(e).__name__}: {e}). Rotating to next fallback model in GENERATION_MODELS...")

    log.error(f"All guardrail models in GENERATION_MODELS failed: {last_err}")
    raise last_err

def oai_embed(client: OpenAI, model: str, texts: List[str]) -> Optional[List[List[float]]]:
    try:
        resp = client.embeddings.create(model=model, input=texts)
        return [d.embedding for d in resp.data]
    except Exception:
        return None