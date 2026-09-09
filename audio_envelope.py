import math

import torch


def normalize_volume_points(points):
    values = {}
    for point in points if isinstance(points, list) else []:
        if not isinstance(point, dict):
            continue
        time, gain = point.get("source_ms"), point.get("gain")
        if not isinstance(time, (int, float)) or not isinstance(gain, (int, float)):
            continue
        if math.isfinite(time) and math.isfinite(gain):
            values[max(0, time)] = max(0, min(2, gain))
    return [{"source_ms": time, "gain": gain} for time, gain in sorted(values.items())]


def apply_volume_points(waveform, sample_rate, source_start_ms, points):
    points = normalize_volume_points(points)
    if not points:
        return waveform
    time = torch.arange(waveform.shape[-1], device=waveform.device, dtype=torch.float32) * (1000.0 / sample_rate) + source_start_ms
    gain = torch.full_like(time, points[-1]["gain"])
    for a, b in reversed(list(zip(points, points[1:]))):
        fraction = ((time - a["source_ms"]) / (b["source_ms"] - a["source_ms"])).clamp(0, 1)
        gain = torch.where(time < b["source_ms"], a["gain"] + fraction * (b["gain"] - a["gain"]), gain)
    gain = torch.where(time <= points[0]["source_ms"], points[0]["gain"], gain)
    return waveform * gain.to(waveform.dtype)


def volume_points_filter(points, source_in_sec):
    points = normalize_volume_points(points)
    if not points:
        return ""
    time = f"(t+{source_in_sec:.9f})"
    expr = f"{points[-1]['gain']:.9f}"
    for a, b in reversed(list(zip(points, points[1:]))):
        start, end = a["source_ms"] / 1000, b["source_ms"] / 1000
        ramp = f"{a['gain']:.9f}+({b['gain']-a['gain']:.9f})*({time}-{start:.9f})/{end-start:.9f}"
        expr = f"if(lt({time},{end:.9f}),{ramp},{expr})"
    expr = f"if(lte({time},{points[0]['source_ms']/1000:.9f}),{points[0]['gain']:.9f},{expr})"
    return f",aeval=exprs='val(ch)*({expr})'"
