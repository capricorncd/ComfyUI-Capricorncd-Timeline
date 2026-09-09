"""Conservative stream-copy eligibility for a linear timeline."""

import json
import os
import shutil
import subprocess
import sys
import tempfile
from fractions import Fraction


def _probe(path, frames=False):
    cmd = ["ffprobe", "-v", "error", "-of", "json"]
    if frames:
        cmd += ["-select_streams", "v:0", "-show_frames",
                "-show_entries", "frame=key_frame,best_effort_timestamp_time"]
    else:
        cmd += ["-show_streams", "-show_format", "-show_data_hash", "sha256"]
    cmd.append(path)
    result = subprocess.run(
        cmd, capture_output=True, text=True, encoding="utf-8", errors="replace",
        timeout=120, creationflags=subprocess.CREATE_NO_WINDOW if sys.platform == "win32" else 0,
    )
    if result.returncode:
        return None
    return json.loads(result.stdout)


def stream_copy_plan(plan, watermark_active):
    """Return eligible ordered segments, or a user-facing fallback reason code."""
    if watermark_active or plan["subtitle_segs"]:
        return None, "overlays"
    if not shutil.which("ffprobe"):
        return None, "format"
    if plan["audio_segs"]:
        return None, "audio_mix"
    segments = sorted(plan["video_segs"], key=lambda row: row["start_sec"])
    previous_end = 0.0
    signature = None
    muted = None
    probes = {}
    for seg in segments:
        if seg["kind"] != "video" or seg.get("layer") != "director":
            return None, "overlays"
        if abs(seg["start_sec"] - previous_end) > 0.0001:
            return None, "overlap_gap"
        previous_end = seg["end_sec"]
        if seg["volume"] != 1 and not seg["muted"]:
            return None, "audio_mix"
        if muted is not None and muted != seg["muted"]:
            return None, "audio_mix"
        muted = seg["muted"]
        path = seg["path"]
        if path not in probes:
            probes[path] = _probe(path)
        probe = probes[path]
        if not probe:
            return None, "format"
        streams = [s for s in probe.get("streams", []) if s.get("codec_type") in ("video", "audio")]
        video = next((s for s in streams if s["codec_type"] == "video"), None)
        if not video or video.get("codec_name") not in ("h264", "hevc"):
            return None, "format"
        if abs(float(video.get("start_time") or 0)) > 0.001:
            return None, "format"
        if (video.get("width"), video.get("height")) != (plan["width"], plan["height"]):
            return None, "size_fps"
        if abs(float(Fraction(video.get("r_frame_rate", "0/1"))) - plan["fps"]) > 0.0001:
            return None, "size_fps"
        if video.get("sample_aspect_ratio", "1:1") not in ("1:1", "N/A"):
            return None, "format"
        if video.get("side_data_list"):
            return None, "format"
        selected = [s for s in streams if s["codec_type"] == "video" or not muted]
        fields = ("codec_type", "codec_name", "codec_tag_string", "profile", "level",
                  "width", "height", "pix_fmt", "time_base", "r_frame_rate",
                  "sample_aspect_ratio", "sample_rate", "channels", "channel_layout",
                  "color_range", "color_space", "color_transfer", "color_primaries",
                  "extradata_hash")
        current = tuple(tuple(s.get(k) for k in fields) for s in selected)
        if signature is not None and signature != current:
            return None, "format"
        signature = current
        tin = seg["source_in_sec"]
        end = tin + seg["duration_sec"]
        full = float(video.get("duration") or probe["format"]["duration"])
        tolerance = 0.001
        if end > full + tolerance:
            return None, "cut"
        trimmed = tin > tolerance or end < full - tolerance
        if trimmed:
            # Demuxer outpoint uses DTS. With B frames it is not a frame-accurate cut.
            if video.get("has_b_frames", 0):
                return None, "cut"
            frames = _probe(path, frames=True)
            if not frames:
                return None, "cut"
            keys = [float(f["best_effort_timestamp_time"]) for f in frames.get("frames", [])
                    if f.get("key_frame") and "best_effort_timestamp_time" in f]
            if not any(abs(tin - k) <= tolerance for k in keys):
                return None, "cut"
            if end < full - tolerance and not any(abs(end - k) <= tolerance for k in keys):
                return None, "cut"
            # AAC packet boundaries need not coincide with video keyframes.
            if not muted and any(s["codec_type"] == "audio" for s in streams):
                return None, "cut"
    if abs(previous_end - plan["total_sec"]) > 0.001:
        return None, "overlap_gap"
    return segments, ""


def copy_segments(segments, output_path, run_ffmpeg):
    with tempfile.TemporaryDirectory(prefix="cap_compose_copy_") as directory:
        manifest = os.path.join(directory, "clips.ffconcat")
        with open(manifest, "w", encoding="utf-8", newline="\n") as stream:
            stream.write("ffconcat version 1.0\n")
            for seg in segments:
                path = seg["path"].replace("\\", "/").replace("'", "'\\''")
                if "\n" in path or "\r" in path:
                    raise ValueError("Invalid video filename")
                stream.write(f"file '{path}'\n")
                stream.write(f"inpoint {seg['source_in_sec']:.9f}\n")
                stream.write(f"outpoint {seg['source_in_sec'] + seg['duration_sec']:.9f}\n")
                stream.write(f"duration {seg['duration_sec']:.9f}\n")
        cmd = ["ffmpeg", "-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", manifest,
               "-map", "0:v:0"]
        cmd += ["-an"] if segments[0]["muted"] else ["-map", "0:a:0?"]
        cmd += ["-c", "copy", "-movflags", "+faststart", output_path]
        run_ffmpeg(cmd)
