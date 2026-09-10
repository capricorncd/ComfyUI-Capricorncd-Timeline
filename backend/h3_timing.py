"""Frame-based H3 generation snapshots; independent of mutable editor settings."""
import re


H3_SUFFIX = re.compile(r"__h3v([12])_c(\d+)_r(\d+)_h(\d+)_t(\d+)_f(\d+)_s([01])(?:_n(\d+))?(?=\.[^.]+$)")


def timing_from_filename(path):
    match = H3_SUFFIX.search(str(path))
    if not match:
        return None
    version, context, raw, head, tail, fps_milli, save = map(int, match.groups()[:7])
    carry = int(match.group(8) or 0)
    if (version == 2 and match.group(8) is None) or (version == 1 and carry):
        raise ValueError("Invalid H3 context carry in video filename.")
    if fps_milli <= 0 or not 0 <= carry <= context or raw <= context - carry + head + tail:
        raise ValueError("Invalid H3 timing in video filename.")
    return dict(version=version, context_frames=context, raw_frames=raw, context_carry_frames=carry,
                head_frames=head, tail_frames=tail, fps=fps_milli / 1000,
                play_frames=raw - context + carry - head - tail, save_latent=bool(save))


def timing_filename(path, timing):
    stem, dot, ext = str(path).rpartition(".")
    if not dot:
        return path
    stem = H3_SUFFIX.sub("", str(path)).rpartition(".")[0]
    version = timing.get("version", 1)
    carry = f"_n{timing.get('context_carry_frames', 0)}" if version == 2 else ""
    return (f"{stem}__h3v{version}_c{timing['context_frames']}_r{timing['raw_frames']}"
            f"_h{timing['head_frames']}_t{timing['tail_frames']}"
            f"_f{round(timing['fps'] * 1000)}_s{int(timing['save_latent'])}{carry}.{ext}")


def choose_h3_context(previous, requested=22):
    """Keep raw_end - context inside the previous visible source interval."""
    visible_start = previous["context_frames"] - previous.get("context_carry_frames", 0) + previous["head_frames"]
    low = previous["tail_frames"] + 1
    high = previous["raw_frames"] - visible_start
    first = 5 + max(0, (low - 5 + 16) // 17) * 17
    candidates = range(first, high + 1, 17)
    if not candidates:
        raise ValueError("H3 context cannot start inside the previous clip's visible frames; increase its duration or reduce its head/tail extensions.")
    return min(candidates, key=lambda value: (abs(value - requested), value))


def plan_h3_clips(clips, fps):
    previous_by_track = {}
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
        requested = int(clip.get("h3_motion_context_length", 0)) or (22 if linked else 0)
        if is_h3 and (requested or clip.get("save_latent")):
            preferred = max(5, (requested - 5) // 17 * 17 + 5)
            context = choose_h3_context(previous["h3_timing"], preferred) if linked else 0
            if linked:
                clip["h3_motion_context_length"] = context
            carry = previous["h3_timing"]["tail_frames"] if linked else 0
            head = max(0, round((start - clip["start_ms"]) * fps / 1000))
            tail = max(0, round((clip["end_ms"] - end) * fps / 1000))
            target = round(end * fps / 1000) - round(start * fps / 1000)
            required = max(5, target + context - carry + head + tail)
            raw = required + (5 - required) % 17
            tail = raw - (context - carry + head + target)
            play = target
            if play <= 0:
                raise ValueError("H3 trim removes the entire clip.")
            play_start = round(start * fps / 1000)
            clip["h3_timing"] = dict(
                version=2, fps=fps, requested_context_frames=requested, context_carry_frames=carry,
                context_frames=context, raw_frames=raw, head_frames=head,
                tail_frames=tail, play_frames=play, save_latent=bool(clip.get("save_latent")),
                play_start_frame=play_start, play_end_frame=play_start + play,
                source_start_ms=start, source_end_ms=end,
                previous_source_clip_id=previous.get("source_clip_id") if context else None,
            )
            if clip.get("output_video"):
                clip["output_video"] = timing_filename(clip["output_video"], clip["h3_timing"])
            plans.append(clip)
        previous_by_track[track] = clip

    for clip in plans:
        timing = clip["h3_timing"]
        if clip.get("output_video"):
            clip["output_video"] = timing_filename(clip["output_video"], timing)
        clip["playback_spans"] = [dict(source_clip_id=clip.get("source_clip_id"),
            output_video=clip.get("output_video"), start_frame=timing["context_frames"] - timing["context_carry_frames"] + timing["head_frames"],
            frame_count=timing["play_frames"])]
    by_id = {c.get("source_clip_id"): c for c in plans}
    for clip in plans:
        timing = clip["h3_timing"]
        previous = by_id.get(timing["previous_source_clip_id"])
        if not previous:
            continue
        prior = previous["h3_timing"]
        # Context includes the preceding raw video's padding, which is not visible.
        overlap = timing["context_frames"] - prior["tail_frames"]
        previous["playback_spans"][0]["frame_count"] -= overlap
        previous["playback_spans"].append(dict(source_clip_id=clip.get("source_clip_id"),
            output_video=clip.get("output_video"), start_frame=0,
            frame_count=overlap, role="regenerated_context"))


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
    carry = timing.get("context_carry_frames", 0)
    tolerance = 0 if timing.get("version", 1) == 2 else 1
    if abs(actual_frames - raw) <= tolerance:
        offset = context - carry + head
    elif abs(actual_frames - timing["play_frames"]) <= tolerance:
        return 0, actual_frames / fps
    elif abs(actual_frames - (raw - context)) <= tolerance:
        if carry:
            raise ValueError("H3 video has already lost context carry frames; use the original untrimmed generation.")
        offset = head
    else:
        raise ValueError(f"H3 video has {actual_frames} frames; generation snapshot expects {raw} raw, {raw - context} context-trimmed or {timing['play_frames']} final frames.")
    return offset / fps, (actual_frames - offset - tail) / fps
