"""Selected reference media that can supply a preceding segment's context."""


def reference_context_media(clip, materials, end_ms=None):
    duration = max(0, clip.get("end_ms", 0) - clip.get("start_ms", 0))
    end_ms = min(duration, duration if end_ms is None else end_ms)
    videos, audios = [], []
    for ref in clip.get("images", []):
        material = materials.get(str(ref.get("id", "")), ref)
        trim = material.get("video_trim") or {}
        if material.get("kind") != "video" and not trim:
            continue
        rate = float(trim.get("rate", 1))
        selected = min(end_ms / 1000 * rate, float(trim.get("duration", duration / 1000 * rate)))
        if selected > 0:
            videos.append(dict(file=trim.get("file") or material.get("file", ""),
                location=material.get("location", "input"), start=float(trim.get("start", 0)),
                duration=selected, rate=rate,
                **({"flip_horizontal": True} if material.get("flip_horizontal") is True else {})))
    for row in clip.get("audios", []):
        material = materials.get(str(row.get("id", "")), row)
        rate = float(row.get("playback_rate", 1))
        start = int(row.get("source_start_ms", 0))
        offset = int(row.get("clip_offset_ms", 0))
        end = min(int(row["source_end_ms"]), start + round((end_ms - offset) * rate))
        if end > start:
            audios.append(dict(row, file=material.get("file", row.get("file", "")),
                location=material.get("location", row.get("location", "input")), source_end_ms=end))
    return dict(videos=videos, audios=audios, duration_ms=end_ms)


def previous_context_media(data, index, current=None):
    current = current if current is not None else data["clips"][index]
    if current.get("previous_reference_media"):
        return current["previous_reference_media"]
    owner = (current.get("h3_timing") or {}).get("previous_source_clip_id")
    clips = data.get("clips", [])[:index] + data.get("composition_clips", [])
    previous = next((row for row in reversed(clips)
                     if str(row.get("source_clip_id") or row.get("id")) == str(owner)), None) if owner else None
    if previous:
        return reference_context_media(previous, {str(row["id"]): row for row in data.get("materials", [])})
    return dict(videos=[], audios=[], duration_ms=0)
