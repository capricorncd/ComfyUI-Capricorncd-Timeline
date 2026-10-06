"""Local portrait LUTs shared with the timeline preview."""

import json
import os
import tempfile
from pathlib import Path


LUT_FILE = Path(__file__).resolve().parents[1] / "js" / "filters" / "portrait.json"


def collect_filters(tracks, fps):
    rows = []
    for track in reversed(tracks):
        if track.get("type") != "filter" or track.get("enabled") is False or track.get("visible") is False:
            continue
        for clip in track.get("clips", []):
            if clip.get("enabled") is False or clip.get("visible") is False:
                continue
            strength = max(0, min(1, float(clip.get("filter_strength", 0.7))))
            start = round(float(clip.get("start_ms", 0)) * fps / 1000) / fps
            end = round((float(clip.get("start_ms", 0)) + float(clip.get("duration_ms", 0))) * fps / 1000) / fps
            if strength > 0 and end > start:
                rows.append({"preset": clip.get("filter_preset", "fair"), "strength": strength, "start": start, "end": end})
    return rows


def write_lut(preset, strength):
    data = json.loads(LUT_FILE.read_text(encoding="utf-8"))
    if preset not in data["presets"]:
        raise ValueError(f"Unknown portrait filter: {preset}")
    size = data["size"]
    colors = data["presets"][preset]
    fd, path = tempfile.mkstemp(suffix=".cube", prefix="cap_portrait_")
    with os.fdopen(fd, "w", encoding="ascii", newline="\n") as stream:
        stream.write(f"LUT_3D_SIZE {size}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n")
        for b in range(size):
            for g in range(size):
                for r in range(size):
                    index = ((b * size + g) * size + r) * 3
                    original = (r / (size - 1), g / (size - 1), b / (size - 1))
                    values = [original[i] + (colors[index + i] - original[i]) * strength for i in range(3)]
                    stream.write(" ".join(f"{v:.7f}" for v in values) + "\n")
    return path
