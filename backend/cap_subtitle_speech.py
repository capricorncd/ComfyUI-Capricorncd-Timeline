"""Subtitle speech client. The external service, not ComfyUI, owns synthesis."""
import asyncio
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.parse import urlsplit
import uuid
import wave

import aiohttp
import folder_paths

LIMIT = 32 * 1024 * 1024
CONTRACT = {
    "version": "capricorncd.subtitle-speech.v1", "method": "POST",
    "request": {"content_type": "multipart/form-data", "parts": {
        "reference_audio": "PCM16 WAV, mono, 48000 Hz, 1–30 seconds",
        "metadata": {"contract": "capricorncd.subtitle-speech.v1", "request_id": "UUID",
                     "subtitle_id": "string", "character_media_id": "string", "text": "1–4000 characters",
                     "prompt": "0–4000 characters", "start_ms": "nonnegative integer",
                     "end_ms": "exclusive timeline end, integer; end_ms = start_ms + duration_ms",
                     "duration_ms": "target duration, integer 100–300000", "model": "string"},
    }},
    "response": {"status": 200, "content_type": "audio/wav", "codec": "PCM16",
                 "sample_rate": 48000, "channels": 1, "duration_seconds": "0.1–300", "max_bytes": LIMIT},
    "errors": {"status": "4xx/5xx; 409 when busy", "body": {"error": {"code": "string", "message": "string"}}},
    "policy": "One request per subtitle; serial execution. No redirects, result URLs, retries or asynchronous jobs. Preserve text and language; use prompt only for delivery. Actual audio duration is preserved, not time-stretched to the target.",
}


def _config_path():
    return Path(folder_paths.get_user_directory()) / "capricorncd" / "timeline_speech.json"


def _read_config():
    path = _config_path()
    return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {"url": "", "model": "", "timeout_seconds": 300}


def public_config():
    config = _read_config()
    return {k: v for k, v in config.items() if k != "api_key"} | {"has_key": bool(config.get("api_key")), "contract": CONTRACT}


def save_config(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected configuration object.")
    url = str(payload.get("url") or "").strip()
    if url:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError("Use a full HTTP(S) endpoint without URL credentials, query or fragment.")
        _ = parsed.port
    timeout = payload.get("timeout_seconds", 300)
    if type(timeout) is not int or not 10 <= timeout <= 1800:
        raise ValueError("Timeout must be an integer from 10 to 1800 seconds.")
    old = _read_config()
    key = str(payload.get("api_key") or "").strip()
    if payload.get("clear_key") is True or not url:
        key = ""
    elif not key and old.get("url") == url:
        key = old.get("api_key", "")
    config = {"url": url, "model": str(payload.get("model") or "").strip(), "timeout_seconds": timeout, "api_key": key}
    path = _config_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix="speech_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(config, f, ensure_ascii=False, indent=2)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return public_config()


def validate_request(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected speech request object.")
    for key in ("subtitle_id", "character_media_id", "reference_file", "text"):
        if not isinstance(payload.get(key), str) or not payload[key].strip():
            raise ValueError(f"Missing {key}.")
    prompt = payload.get("prompt", "")
    if not isinstance(prompt, str) or len(prompt) > 4000 or len(payload["text"]) > 4000:
        raise ValueError("Text and prompt must be strings of at most 4000 characters each.")
    if type(payload.get("start_ms")) is not int or payload["start_ms"] < 0:
        raise ValueError("Invalid subtitle start_ms.")
    if type(payload.get("duration_ms")) is not int or not 100 <= payload["duration_ms"] <= 300000:
        raise ValueError("Subtitle duration must be 0.1–300 seconds.")
    if type(payload.get("end_ms")) is not int or payload["end_ms"] != payload["start_ms"] + payload["duration_ms"]:
        raise ValueError("end_ms must equal start_ms + duration_ms.")
    root = Path(folder_paths.get_input_directory()).resolve()
    reference = (root / payload["reference_file"]).resolve()
    if not reference.is_relative_to(root) or not reference.is_file() or reference.suffix.lower() not in (".wav", ".mp3", ".flac", ".ogg", ".m4a", ".aac", ".opus"):
        raise ValueError("Reference must be an existing audio asset under ComfyUI input.")
    if reference.stat().st_size > LIMIT:
        raise ValueError("Reference audio exceeds 32 MiB.")
    return reference


def wav_duration(data, minimum=0.1, maximum=300):
    if len(data) > LIMIT:
        raise ValueError("Audio exceeds 32 MiB.")
    try:
        with wave.open(io.BytesIO(data), "rb") as audio:
            if (audio.getnchannels(), audio.getsampwidth(), audio.getframerate(), audio.getcomptype()) != (1, 2, 48000, "NONE"):
                raise ValueError("Service must return mono 48000 Hz PCM16 WAV.")
            frames = audio.getnframes()
            if len(audio.readframes(frames)) != frames * 2:
                raise ValueError("Truncated WAV response.")
            duration = frames / 48000
    except (wave.Error, EOFError) as exc:
        raise ValueError("Invalid WAV audio.") from exc
    if not minimum <= duration <= maximum:
        raise ValueError(f"Audio duration must be {minimum}–{maximum} seconds.")
    return duration


def prepare_reference(path):
    with tempfile.TemporaryDirectory(prefix="cap_speech_ref_") as temp:
        output = Path(temp) / "reference.wav"
        command = ["ffmpeg", "-v", "error", "-nostdin", "-i", str(path), "-vn", "-t", "31",
                   "-ac", "1", "-ar", "48000", "-c:a", "pcm_s16le", str(output)]
        result = subprocess.run(command, capture_output=True, timeout=60,
                                creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0)
        if result.returncode:
            raise ValueError("Cannot decode reference audio.")
        data = output.read_bytes()
        wav_duration(data, minimum=1, maximum=30)
        return data


async def generate(payload):
    reference = validate_request(payload)
    config = _read_config()
    if not config.get("url"):
        raise ValueError("Configure the subtitle speech service first.")
    reference_data = await asyncio.to_thread(prepare_reference, reference)
    request_id = str(uuid.uuid4())
    metadata = {key: payload.get(key, "") for key in ("subtitle_id", "character_media_id", "text", "prompt", "start_ms", "end_ms", "duration_ms")}
    metadata.update(contract=CONTRACT["version"], request_id=request_id, model=config.get("model", ""))
    form = aiohttp.FormData()
    form.add_field("metadata", json.dumps(metadata, ensure_ascii=False), content_type="application/json")
    form.add_field("reference_audio", reference_data, filename="reference.wav", content_type="audio/wav")
    headers = {"Authorization": "Bearer " + config["api_key"]} if config.get("api_key") else {}
    timeout = aiohttp.ClientTimeout(total=config.get("timeout_seconds", 300))
    async with aiohttp.ClientSession(timeout=timeout, trust_env=False) as session:
        async with session.post(config["url"], data=form, headers=headers, allow_redirects=False) as response:
            if response.status != 200:
                raise ValueError(f"Speech service returned HTTP {response.status}; no audio was added. No automatic retry.")
            if response.content_type != "audio/wav":
                raise ValueError("Speech service must return audio/wav, not JSON, a URL or a job ID.")
            data = bytearray()
            async for chunk in response.content.iter_chunked(65536):
                data.extend(chunk)
                if len(data) > LIMIT:
                    raise ValueError("Speech response exceeds 32 MiB.")
    duration = wav_duration(data)
    root = Path(folder_paths.get_input_directory())
    directory = root / "capricorncd-timeline" / "audios"
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / f"speech_{request_id}.wav"
    with destination.open("xb") as f:
        f.write(data)
    return {"file": destination.relative_to(root).as_posix(), "kind": "audio", "location": "input",
            "duration_seconds": duration, "start_ms": payload["start_ms"], "end_ms": payload["end_ms"], "subtitle_id": payload["subtitle_id"], "request_id": request_id}
