"""Persistent first-pass AV latents; manifests contain the conditioning input snapshot."""
import copy
import json
import re
import secrets
from pathlib import Path

import folder_paths
from safetensors.torch import load_file, save_file
from comfy.nested_tensor import NestedTensor


DRAFT_ROOT = "capricorncd-timeline/h3_drafts"


def draft_directory(version_id):
    if not isinstance(version_id, str) or not re.fullmatch(r"[0-9a-f]{32}", version_id):
        raise ValueError("Invalid first-pass version ID.")
    root = Path(folder_paths.get_output_directory()).resolve()
    path = (root / DRAFT_ROOT / version_id).resolve()
    if not path.is_relative_to(root):
        raise ValueError("First-pass version is outside the output directory.")
    return path


def read_draft(version_id):
    path = draft_directory(version_id)
    if not (path / "latent.safetensors").is_file() or not (path / "version.json").is_file():
        raise ValueError("First-pass latent is missing. Generate a new candidate or restore the version files.")
    manifest = json.loads((path / "version.json").read_text(encoding="utf-8"))
    if manifest.get("schema_version") != 1 or manifest.get("id") != version_id:
        raise ValueError("Unsupported first-pass version manifest.")
    return manifest


def save_draft(latent, data, index, width, height, frame_count, prompt, steps):
    version_id = secrets.token_hex(16)
    path = draft_directory(version_id)
    path.mkdir(parents=True, exist_ok=False)
    tensors, layout = {}, {}
    for key in ("samples", "noise_mask"):
        value = latent.get(key)
        if value is None:
            continue
        nested = isinstance(value, NestedTensor)
        parts = value.unbind() if nested else [value]
        layout[key] = {"nested": nested, "count": len(parts)}
        for i, part in enumerate(parts):
            tensors[f"{key}_{i}"] = part.detach().cpu().contiguous().clone()
    save_file(tensors, str(path / "latent.safetensors"))
    row = data["clips"][index]
    manifest = {"schema_version": 1, "id": version_id,
                "clip_id": str(row.get("source_clip_id") or row["id"]),
                "source_output": row["output_video"],
                "seed": row["seed"], "width": width, "height": height, "frames": frame_count,
                "fps": data["fps"], "prompt": prompt, "steps": steps,
                "data": copy.deepcopy(data), "index": index, "layout": layout}
    (path / "version.json").write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return manifest


def load_draft_latent(manifest):
    tensors = load_file(str(draft_directory(manifest["id"]) / "latent.safetensors"))
    latent = {}
    for key, layout in manifest["layout"].items():
        parts = [tensors[f"{key}_{i}"] for i in range(layout["count"])]
        latent[key] = NestedTensor(parts) if layout["nested"] else parts[0]
    return latent


def finish_draft(manifest, filename):
    manifest["file"] = filename
    path = draft_directory(manifest["id"]) / "version.json"
    path.write_text(json.dumps(manifest, ensure_ascii=False), encoding="utf-8")
    return {key: manifest[key] for key in ("id", "clip_id", "source_output", "seed", "width", "height", "frames", "fps", "prompt", "file")}


def restore_draft(data, version_id):
    manifest = read_draft(version_id)
    current = data["clips"]
    if len(current) != 1 or str(current[0].get("source_clip_id") or current[0]["id"]) != manifest["clip_id"]:
        raise ValueError("Select a first-pass version belonging to this director Clip.")
    snapshot = copy.deepcopy(manifest["data"])
    row = snapshot["clips"][manifest["index"]]
    if snapshot["fps"] != data["fps"] or row["end_ms"] - row["start_ms"] != current[0]["end_ms"] - current[0]["start_ms"]:
        raise ValueError("Clip duration or project fps changed. Restore them or generate a new first-pass candidate.")
    row["output_video"] = current[0]["output_video"]
    row["h3_refine_version"] = version_id
    snapshot.update(width=data["width"], height=data["height"], clips=[row])
    return snapshot, manifest


def latest_draft(data, row):
    for version in row.get("h3_drafts", []):
        if version.get("enabled") is False:
            continue
        try:
            return restore_draft({**data, "clips": [row]}, version.get("id"))
        except (ValueError, OSError, KeyError, IndexError):
            continue
    return None
