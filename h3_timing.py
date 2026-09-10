"""Frame-based H3 generation snapshots; independent of mutable editor settings."""
import re


H3_SUFFIX = re.compile(r"__h3v1_c(\d+)_r(\d+)_h(\d+)_t(\d+)_f(\d+)_s([01])(?=\.[^.]+$)")


def timing_from_filename(path):
    match = H3_SUFFIX.search(str(path))
    if not match:
        return None
    context, raw, head, tail, fps_milli, save = map(int, match.groups())
    if fps_milli <= 0 or raw <= context + head + tail:
        raise ValueError("Invalid H3 timing in video filename.")
    return dict(version=1, context_frames=context, raw_frames=raw,
                head_frames=head, tail_frames=tail, fps=fps_milli / 1000,
                play_frames=raw - context - head - tail, save_latent=bool(save))


def timing_filename(path, timing):
    stem, dot, ext = str(path).rpartition(".")
    if not dot:
        return path
    stem = H3_SUFFIX.sub("", str(path)).rpartition(".")[0]
    return (f"{stem}__h3v1_c{timing['context_frames']}_r{timing['raw_frames']}"
            f"_h{timing['head_frames']}_t{timing['tail_frames']}"
            f"_f{round(timing['fps'] * 1000)}_s{int(timing['save_latent'])}.{ext}")


def plan_h3_clips(clips, fps):
    previous_by_track = {}
    shifts = {}
    plans = []
    for clip in clips:
        track = clip.get("z_index", 0)
        previous = previous_by_track.get(track)
        start = clip["preview_start_ms"]
        end = clip["preview_end_ms"]
        is_h3 = clip.get("agent", "MiniMaxH3") == "MiniMaxH3"
        linked = bool(is_h3 and previous and previous.get("h3_timing")
                      and previous.get("save_latent") and previous.get("z_index", 0) == track
                      and abs(previous["preview_end_ms"] - start) <= 1)
        if not linked:
            shifts[track] = 0
        requested = int(clip.get("h3_motion_context_length", 0))
        if is_h3 and (requested or clip.get("save_latent")):
            context = (requested - 5) // 17 * 17 + 5 if linked and requested >= 5 else 0
            if context:
                context = min(context, previous["h3_timing"]["raw_frames"])
            frames = max(5, round((clip["end_ms"] - clip["start_ms"]) * fps / 1000))
            raw = frames + context + (5 - frames - context) % 17
            head = max(0, round((start - clip["start_ms"]) * fps / 1000))
            tail = max(0, round((clip["end_ms"] - end) * fps / 1000))
            play = raw - context - head - tail
            if play <= 0:
                raise ValueError("H3 trim removes the entire clip.")
            play_start = round(start * fps / 1000) + shifts.get(track, 0)
            clip["h3_timing"] = dict(
                version=1, fps=fps, requested_context_frames=requested,
                context_frames=context, raw_frames=raw, head_frames=head,
                tail_frames=tail, play_frames=play, save_latent=bool(clip.get("save_latent")),
                play_start_frame=play_start, play_end_frame=play_start + play,
                source_start_ms=start, source_end_ms=end,
                previous_source_clip_id=previous.get("source_clip_id") if context else None,
            )
            shifts[track] = shifts.get(track, 0) + play - round((end - start) * fps / 1000)
            if clip.get("output_video"):
                clip["output_video"] = timing_filename(clip["output_video"], clip["h3_timing"])
            plans.append(clip)
        previous_by_track[track] = clip

    continued = {c["h3_timing"]["previous_source_clip_id"] for c in plans if c["h3_timing"]["context_frames"]}
    for clip in plans:
        timing = clip["h3_timing"]
        if timing["context_frames"] and clip.get("source_clip_id") not in continued:
            target = round((clip["preview_end_ms"] - clip["preview_start_ms"]) * fps / 1000)
            extra = max(0, timing["play_frames"] - target)
            timing["tail_frames"] += extra
            timing["play_frames"] -= extra
            timing["play_end_frame"] -= extra
            if clip.get("output_video"):
                clip["output_video"] = timing_filename(clip["output_video"], timing)


def source_clip_timing(clip):
    """Undo only our automatic playback layout, never a user's later resize/move."""
    layout = clip.get("h3_layout")
    if not isinstance(layout, dict) or not all(isinstance(layout.get(key), (int, float)) for key in (
        "start_sec", "duration_sec", "source_start_sec", "source_duration_sec",
    )):
        return clip
    start = float(clip.get("start_ms", 0))
    duration = float(clip.get("duration_ms", float(clip.get("end_ms", start)) - start))
    if abs(start - layout["start_sec"] * 1000) <= 2:
        start = round(layout["source_start_sec"] * 1000)
    if abs(duration - layout["duration_sec"] * 1000) <= 2:
        duration = round(layout["source_duration_sec"] * 1000)
    out = dict(clip, start_ms=start, duration_ms=duration, end_ms=start + duration,
               resource_start_sec=start / 1000, resource_duration_sec=duration / 1000)
    out.pop("h3_layout", None)
    return out


def trim_h3_video(timing, actual_frames, fps):
    if abs(fps - timing["fps"]) > 0.01:
        raise ValueError("H3 video fps differs from the generation snapshot.")
    raw, context = timing["raw_frames"], timing["context_frames"]
    head, tail = timing["head_frames"], timing["tail_frames"]
    if abs(actual_frames - raw) <= 1:
        offset = context + head
    elif abs(actual_frames - (raw - context)) <= 1:
        offset = head
    elif abs(actual_frames - timing["play_frames"]) <= 1:
        return 0, actual_frames / fps
    else:
        raise ValueError(f"H3 video has {actual_frames} frames; generation snapshot expects {raw} raw, {raw - context} context-trimmed or {timing['play_frames']} final frames.")
    return offset / fps, (actual_frames - offset - tail) / fps
