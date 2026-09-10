"""Voice service configuration and the versioned HTTP boundary contract."""
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlsplit

import folder_paths


VOICE_CONTRACT = {
    "version": "capricorncd.voice.v1",
    "method": "POST",
    "request_content_type": "multipart/form-data",
    "request_parts": {
        "source_audio": "audio/wav; PCM16; 48000Hz; mono; current clip source interval only",
        "reference_audio": "audio/wav; PCM16; 48000Hz; mono; single bound reference recording",
        "metadata": {"contract": "capricorncd.voice.v1", "request_id": "UUID",
                     "clip_id": "string", "character_media_id": "string",
                     "duration_ms": "positive integer; clipped source duration", "model": "string"},
    },
    "reference_duration_seconds": {"min": 1, "max": 30},
    "source_duration_seconds": {"min": 0.1, "max": 300},
    "max_upload_bytes": 67108864,
    "success": {"status": 200, "content_type": "audio/wav", "codec": "PCM16",
                "sample_rate": 48000, "channels": 1, "max_bytes": 67108864,
                "duration_tolerance_ms": 100},
    "error": {"status": "4xx or 5xx", "content_type": "application/json",
              "body": {"error": {"code": "string", "message": "string"}}},
    "busy_status": 409,
    "policy": ["No automatic retries, redirects, asynchronous result URLs or remote filesystem paths.",
               "Preserve speech content, language, timing and original audio; do not mix BGM or FX into source.",
               "Do not time-stretch, truncate or replace a clip on response validation failure.",
               "One local generation at a time; service must reject busy requests with 409.",
               "Credentials stay in Authorization: Bearer, never in URLs, metadata or project files."],
}


def _path():
    return Path(folder_paths.get_user_directory()) / "capricorncd" / "timeline_voice.json"


def _read():
    path = _path()
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"url": "", "model": "", "timeout_seconds": 300}


def public_voice_settings():
    config = _read()
    return {k: v for k, v in config.items() if k != "api_key"} | {
        "has_key": bool(config.get("api_key")), "contract": VOICE_CONTRACT,
        "execution_available": False,
    }


def save_voice_settings(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected voice configuration object.")
    url = str(payload.get("url") or "").strip()
    if url:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Use a full HTTP(S) endpoint without credentials, query or fragment.")
        _ = parsed.port
    timeout = payload.get("timeout_seconds", 300)
    if isinstance(timeout, bool) or not isinstance(timeout, int) or not 10 <= timeout <= 1800:
        raise ValueError("Timeout must be an integer between 10 and 1800 seconds.")
    old = _read()
    key = str(payload.get("api_key") or "").strip()
    if payload.get("clear_key") is True or not url:
        key = ""
    elif not key and old.get("url") == url:
        key = old.get("api_key", "")
    config = {"url": url, "model": str(payload.get("model") or "").strip(),
              "timeout_seconds": timeout, "api_key": key, "contract_version": VOICE_CONTRACT["version"]}
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix="voice_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(config, stream, ensure_ascii=False, indent=2)
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
    return public_voice_settings()
