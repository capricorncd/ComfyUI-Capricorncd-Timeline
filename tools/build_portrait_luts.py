"""Rebuild local portrait presets; no face detection or external assets."""
import json
import math
from pathlib import Path


def smooth(lo, hi, value):
    t = max(0, min(1, (value - lo) / (hi - lo)))
    return t * t * (3 - 2 * t)


def color(r, g, b, lift, cool, saturation):
    y = 0.299 * r + 0.587 * g + 0.114 * b
    cb = -0.168736 * r - 0.331264 * g + 0.5 * b + 0.5
    cr = 0.5 * r - 0.418688 * g - 0.081312 * b + 0.5
    skin = math.exp(-0.5 * (((cb - 0.42) / 0.055) ** 2 + ((cr - 0.59) / 0.065) ** 2))
    skin *= smooth(0.10, 0.35, y) * (1 - smooth(0.85, 1, y))
    amount = skin * lift * 4 * y * (1 - y)
    return [round(max(0, min(1, value + amount * (1 - value) + skin * (value - y) * saturation + tint * skin * cool)), 7)
            for value, tint in ((r, -0.10), (g, 0.05), (b, 1.0))]


if __name__ == "__main__":
    size = 17
    presets = {}
    for name, values in {"fair": (0.30, 0.075, -0.12), "bright": (0.20, 0.025, -0.04), "natural": (0.10, 0.015, 0.02)}.items():
        presets[name] = [v for b in range(size) for g in range(size) for r in range(size)
                         for v in color(r / (size - 1), g / (size - 1), b / (size - 1), *values)]
    path = Path(__file__).resolve().parents[1] / "js" / "filters" / "portrait.json"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"size": size, "presets": presets}, separators=(",", ":")) + "\n", encoding="utf-8")
