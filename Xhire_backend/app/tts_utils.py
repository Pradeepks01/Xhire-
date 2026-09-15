# file: Xhire_backend/app/tts_utils.py
import requests
import json
from typing import Optional
import logging

log = logging.getLogger(__name__)

class TTSError(Exception):
    """Custom exception for TTS failures."""
    pass

def get_tts_audio(
    text: str, 
    tts_url: str, 
    voice: Optional[str] = None, 
    length_scale: float = 1.0, 
    noise_scale: float = 0.667, 
    noise_w_scale: float = 0.8,
    timeout_s: int = 3
    ) -> bytes:
    """
    Sends text to a Piper TTS HTTP server and returns WAV audio bytes.
    Raises TTSError on failure.
    """
    if not tts_url or not text:
        log.warning("TTS Error: Missing TTS URL or text data.")
        raise TTSError("Missing TTS URL or text data")
    
    tts_url = tts_url.rstrip('/') 

    try:
        payload = {
            "text": text,
            "length_scale": length_scale,
            "noise_scale": noise_scale,
            "noise_w_scale": noise_w_scale
        }
        if voice:
            payload["voice"] = voice
            
        headers = {"Content-Type": "application/json"}
        response = requests.post(tts_url, headers=headers, data=json.dumps(payload), timeout=timeout_s)

        if response.status_code != 200:
            err_msg = f"TTS server returned status {response.status_code}. Response: {response.text[:200]}"
            log.warning(err_msg)
            raise TTSError(err_msg)

        return response.content 
            
    except requests.exceptions.RequestException as e:
        log.debug(f"Piper TTS server unavailable at {tts_url}: {e}")
        raise TTSError(f"TTS service unavailable: {e}")
    except Exception as e:
        log.error(f"Unexpected TTS error: {e}")
        raise TTSError(f"Unexpected TTS error: {e}")