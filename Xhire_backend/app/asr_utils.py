# file: Xhire_backend/app/asr_utils.py
import requests
import json
import io
from typing import Optional
import logging

# Set up a logger for this module
log = logging.getLogger(__name__)

class ASRError(Exception):
    """Custom exception for ASR failures."""
    pass

def transcribe_audio(audio_bytes: bytes, asr_url: str, timeout_s: int = 3) -> str:
    """
    Sends audio bytes to a Whisper ASR server and returns the transcribed text.
    Raises ASRError on failure.
    """
    if not asr_url or not audio_bytes:
        log.warning("ASR Error: Missing ASR URL or audio data.")
        raise ASRError("Missing ASR URL or audio data")

    try:
        files = {'file': ('audio.wav', io.BytesIO(audio_bytes), 'audio/wav')}
        data = {"response_format": "text"} 
        
        response = requests.post(asr_url, files=files, data=data, timeout=timeout_s) 
        
        if response.status_code != 200:
            err_msg = f"ASR server returned status {response.status_code}. Response: {response.text[:200]}"
            log.warning(err_msg)
            raise ASRError(err_msg)

        transcription = response.text.strip()
        if not transcription:
             log.warning("ASR returned 200 but transcription was empty.")
        
        return transcription

    except requests.exceptions.RequestException as e:
        log.info(f"Whisper ASR server unavailable at {asr_url}: {e}")
        raise ASRError(f"ASR service unavailable: {e}")
    except Exception as e:
        log.error(f"Unexpected ASR error: {e}")
        raise ASRError(f"Unexpected ASR error: {e}")