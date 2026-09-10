"""Local BGM connection settings. No model loading or outbound requests."""
import json
import os
from pathlib import Path
import tempfile
from urllib.parse import urlsplit

import folder_paths


def _path():
    return Path(folder_paths.get_user_directory()) / "capricorncd" / "timeline_bgm.json"


def _read():
    path = _path()
    if not path.exists():
        return {"connection": "comfyui", "url": "http://127.0.0.1:8188", "model": "", "workflow": None}
    return json.loads(path.read_text(encoding="utf-8"))


def public_bgm_settings():
    config = _read()
    return {key: value for key, value in config.items() if key != "api_key"} | {"has_key": bool(config.get("api_key"))}


def save_bgm_settings(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected BGM configuration object.")
    connection = payload.get("connection")
    if connection not in ("comfyui", "standalone"):
        raise ValueError("Unsupported connection type.")
    url = str(payload.get("url") or "").strip().rstrip("/")
    parsed = urlsplit(url)
    if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("Use an HTTP(S) service URL without credentials, query or fragment.")
    workflow = payload.get("workflow")
    if workflow is not None:
        if not isinstance(workflow, dict) or not workflow or any(
            not isinstance(node, dict) or not isinstance(node.get("class_type"), str)
            or not isinstance(node.get("inputs"), dict) for node in workflow.values()
        ):
            raise ValueError("Import a ComfyUI API workflow (node IDs with class_type and inputs), not a UI workflow.")
    old = _read()
    key = str(payload.get("api_key") or "").strip()
    if payload.get("clear_key") is True:
        key = ""
    elif not key and old.get("connection") == connection and old.get("url") == url:
        key = old.get("api_key", "")
    config = {"connection": connection, "url": url, "model": str(payload.get("model") or "").strip(),
              "workflow": workflow if connection == "comfyui" else None, "api_key": key}
    path = _path()
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp = tempfile.mkstemp(dir=path.parent, prefix="bgm_", suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(config, stream, ensure_ascii=False, indent=2)
        os.replace(temp, path)
    finally:
        if os.path.exists(temp):
            os.unlink(temp)
    return public_bgm_settings()
