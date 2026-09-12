from __future__ import annotations

import datetime
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile

import folder_paths

from .cap_i18n import get_last_known_lang, t as _t
from .cap_data_json_parser import CAP_DataJsonClipParser
from .cap_save_sidecar import build_sidecar_payload, clip_prompts_from_data_json, sidecar_path, write_sidecar
from .cap_seq_to_video import _ffmpeg_path, _write_audio_tmp
from .h3_timing import timing_from_filename, trim_h3_video
from .cap_video_metadata import embed_video_generation, read_video_generation

log = logging.getLogger(__name__)

_VIDEO_EXTS = (".mp4", ".mov", ".webm", ".mkv", ".m4v")


_FFMPEG_ERROR_MARKERS = (
    "Error", "error", "Invalid", "Unable", "No such", "Conversion failed",
    "Cannot", "cannot", "failed", "Failed",
)


def _extract_ffmpeg_error(stderr: str, limit: int = 4000) -> str:
    """Pull the most relevant tail out of ffmpeg's stderr.

    With many -i inputs (several clips + audio tracks + a watermark image),
    ffmpeg's per-input banner text alone can run past a fixed last-N-chars
    window, burying the actual fatal error (which is printed *after* all the
    input banners). Search backwards for the last error-looking line instead
    of blindly slicing the tail.
    """
    stderr = stderr or ""
    lines = stderr.splitlines()
    for i in range(len(lines) - 1, -1, -1):
        if any(marker in lines[i] for marker in _FFMPEG_ERROR_MARKERS):
            snippet = "\n".join(lines[max(0, i - 5):])
            return snippet[-limit:]
    return stderr[-limit:]


def _run_ffmpeg(cmd: list) -> None:
    kwargs: dict = {
        "capture_output": True,
        "text": True,
        # ffmpeg's stderr can contain non-ASCII (Chinese filenames, embedded
        # metadata, etc.) encoded as UTF-8. Without an explicit encoding,
        # Python decodes subprocess output using the OS locale codepage
        # (e.g. cp932 on some Windows setups), which raises inside the
        # internal reader thread on those bytes and leaves stderr truncated
        # or empty — masking the real ffmpeg error.
        "encoding": "utf-8",
        "errors": "replace",
        "timeout": 1800,
    }
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    result = subprocess.run(cmd, **kwargs)
    if result.returncode != 0:
        raise RuntimeError(_t("ffmpeg_failed", get_last_known_lang(), detail=_extract_ffmpeg_error(result.stderr)))


def _probe_duration_sec(path: str) -> float | None:
    kwargs: dict = {"capture_output": True, "text": True, "encoding": "utf-8", "errors": "replace", "timeout": 30}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                _ffmpeg_path(path),
            ],
            **kwargs,
        )
        if result.returncode != 0:
            return None
        return float(str(result.stdout or "").strip())
    except Exception:
        return None


def _probe_has_audio(path: str) -> bool:
    kwargs: dict = {"capture_output": True, "text": True, "encoding": "utf-8", "errors": "replace", "timeout": 30}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "a:0",
                "-show_entries", "stream=codec_type",
                "-of", "csv=p=0",
                _ffmpeg_path(path),
            ],
            **kwargs,
        )
        return result.returncode == 0 and "audio" in (result.stdout or "").lower()
    except Exception:
        return False


def extract_audio_file(
    src_path: str,
    dest_path: str,
    *,
    trim_in_sec: float = 0.0,
    duration_sec: float | None = None,
) -> None:
    """Demux / re-encode audio from a video into a WAV for the timeline library."""
    if not src_path or not os.path.isfile(src_path):
        raise ValueError(_t("file_not_found", get_last_known_lang()))
    if not shutil.which("ffmpeg"):
        raise RuntimeError(_t("ffmpeg_not_found", get_last_known_lang()))
    if not _probe_has_audio(src_path):
        raise ValueError(_t("video_has_no_audio", get_last_known_lang()))

    tin = max(0.0, float(trim_in_sec or 0.0))
    dur = None
    if duration_sec is not None:
        try:
            d = float(duration_sec)
            if d > 0.01:
                dur = d
        except (TypeError, ValueError):
            dur = None

    os.makedirs(os.path.dirname(dest_path) or ".", exist_ok=True)
    cmd = ["ffmpeg", "-y", "-hide_banner", "-loglevel", "error"]
    if tin > 1e-6:
        cmd.extend(["-ss", f"{tin:.6f}"])
    cmd.extend(["-i", _ffmpeg_path(src_path)])
    if dur is not None:
        cmd.extend(["-t", f"{dur:.6f}"])
    cmd.extend([
        "-vn",
        "-acodec", "pcm_s16le",
        "-ar", "44100",
        "-ac", "2",
        _ffmpeg_path(dest_path),
    ])
    _run_ffmpeg(cmd)
    if not os.path.isfile(dest_path) or os.path.getsize(dest_path) <= 0:
        raise RuntimeError(_t("ffmpeg_failed", get_last_known_lang(), detail="empty audio output"))


def _probe_video_size(path: str) -> tuple[int, int] | None:
    kwargs: dict = {"capture_output": True, "text": True, "encoding": "utf-8", "errors": "replace", "timeout": 30}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    try:
        result = subprocess.run(
            [
                "ffprobe", "-v", "error",
                "-select_streams", "v:0",
                "-show_entries", "stream=width,height",
                "-of", "csv=p=0:s=x",
                _ffmpeg_path(path),
            ],
            **kwargs,
        )
        if result.returncode != 0:
            return None
        text = str(result.stdout or "").strip().splitlines()
        if not text:
            return None
        parts = text[0].lower().replace(" ", "").split("x")
        if len(parts) != 2:
            return None
        width = int(float(parts[0]))
        height = int(float(parts[1]))
        if width < 2 or height < 2:
            return None
        return width, height
    except Exception:
        return None


def _safe_under(base: str, candidate: str) -> str:
    base_real = os.path.realpath(base)
    cand_real = os.path.realpath(candidate)
    if cand_real != base_real and not cand_real.startswith(base_real + os.sep):
        raise ValueError(_t("path_escapes_dir", get_last_known_lang(), path=candidate))
    return cand_real


class CAP_ComposeClipVideos:
    """Compose the clip output_video files listed in runtime data_json."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "data_json": ("STRING", {"default": "", "multiline": True}),
                "filename_prefix": ("STRING", {
                    "default": "capricorncd-timeline/compose",
                    "tooltip": "Filename prefix for the composed video (may include subfolders, relative to output)",
                }),
                "trim_extends": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Trim extends",
                    "label_off": "No trim",
                    "tooltip": (
                        "When a clip has a start/end extend and the video is the extended duration, "
                        "trim the extend before composing, keeping only the preview-duration range."
                    ),
                }),
                "save_sidecar": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Save JSON",
                    "label_off": "Skip",
                    "tooltip": "Write a same-named JSON next to the composed video recording each clip's prompt, model, etc.",
                }),
            },
            "optional": {
                "audio": ("AUDIO", {"tooltip": "Audio starting at the beginning of the composed video. Mixed with original audio when enabled; padded or trimmed to video length."}),
                "use_original_audio": ("BOOLEAN", {
                    "default": True,
                    "label_on": "Use original audio",
                    "label_off": "Ignore original audio",
                    "tooltip": "Include audio from source videos. Disable to use only the optional audio input, or export a silent video when disconnected.",
                }),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename",)
    OUTPUT_NODE = True
    FUNCTION = "execute"
    CATEGORY = "Capricorncd"
    DESCRIPTION = (
        "Compose data_json clip output_video files in list order into one MP4. "
        "Trim repeated motion context and explicit extends, preserving continuation tails. "
        "Optionally mix an AUDIO input with the original sound, or replace it. "
        "When save_sidecar is true, write a same-name JSON next to the video."
    )

    @classmethod
    def IS_CHANGED(cls, **_kwargs):
        return float("nan")

    def _parse_data(self, data_json: str) -> dict:
        try:
            data = json.loads(data_json or "{}")
        except json.JSONDecodeError:
            data = {}
        return data if isinstance(data, dict) else {}

    def _resolve_clips_dir(self, clips_dir: str, run_timestamp: str) -> str:
        output_dir = os.path.abspath(folder_paths.get_output_directory())
        raw = str(clips_dir or "").strip().replace("\\", "/")
        prefix = str(run_timestamp or "").strip().replace("\\", "/").strip("/")

        if not raw:
            if not prefix:
                raise ValueError(_t("clips_dir_empty_no_run_timestamp", get_last_known_lang()))
            path = os.path.join(output_dir, *prefix.split("/"))
            path = _safe_under(output_dir, path)
            if not os.path.isdir(path):
                raise ValueError(_t("clip_dir_not_found", get_last_known_lang(), path=path))
            return path

        if os.path.isabs(raw):
            path = os.path.abspath(raw)
            if not os.path.isdir(path):
                raise ValueError(_t("clip_dir_not_found", get_last_known_lang(), path=path))
            return path

        path = os.path.join(output_dir, *raw.strip("/").split("/"))
        path = _safe_under(output_dir, path)
        if not os.path.isdir(path):
            raise ValueError(_t("clip_dir_not_found", get_last_known_lang(), path=path))
        return path

    def _clip_stem(self, clip: dict, index: int, fps: float, name_mode: str, parser: CAP_DataJsonClipParser) -> str:
        mode = str(name_mode or "from_start").strip().lower()
        if mode == "index":
            return f"{index:04d}"
        start_ms = int(clip.get("start_ms", 0) or 0)
        end_ms = int(clip.get("end_ms", start_ms) or start_ms)
        frame_count = parser._frame_count(start_ms, end_ms, fps)
        return parser._from_tag(start_ms, frame_count, fps)

    def _find_clip_video(self, clips_dir: str, stem: str) -> str | None:
        stem = str(stem or "").strip()
        if not stem:
            return None
        exact = []
        prefixed = []
        try:
            names = os.listdir(clips_dir)
        except OSError:
            return None
        for name in names:
            path = os.path.join(clips_dir, name)
            if not os.path.isfile(path):
                continue
            root, ext = os.path.splitext(name)
            if ext.lower() not in _VIDEO_EXTS:
                continue
            if root == stem:
                exact.append(path)
            elif root.startswith(stem + "_"):
                prefixed.append(path)
        pool = exact or prefixed
        if not pool:
            return None
        pool.sort(key=lambda p: os.path.getmtime(p), reverse=True)
        return pool[0]

    def _trim_plan(self, clip: dict, video_path: str, trim_extends: bool, fps: float = 24.0, previous_clip: dict | None = None) -> tuple[float | None, float | None]:
        """Return (ss, duration) in seconds, or (None, None) if no trim."""
        if not trim_extends:
            return None, None
        start = float(clip.get("start_ms", 0))
        end = float(clip.get("end_ms", start))
        frames = round((end - start) * fps / 1000)
        if frames <= 0:
            raise ValueError("Compose Clip Videos: clip duration must be positive.")
        context = max(0, int(clip.get("h3_motion_context_length", 0) or 0))
        context = (context - 5) // 17 * 17 + 5 if context >= 5 else 0
        if not previous_clip or not previous_clip.get("save_latent", False):
            context = 0
        timing = timing_from_filename(video_path) or clip.get("h3_timing")
        if timing or context or clip.get("save_latent", False):
            probe = subprocess.run(
                ["ffprobe", "-v", "error", "-select_streams", "v:0",
                 "-show_entries", "stream=nb_frames,duration,r_frame_rate", "-of", "json", _ffmpeg_path(video_path)],
                capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=30,
                **({"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}),
            )
            if probe.returncode:
                raise ValueError(f"Compose Clip Videos: cannot probe video: {video_path}")
            stream = json.loads(probe.stdout)["streams"][0]
            numerator, denominator = stream["r_frame_rate"].split("/")
            source_fps = float(numerator) / float(denominator)
            if abs(source_fps - fps) > 0.01:
                raise ValueError(f"Compose Clip Videos: video fps {source_fps:g} differs from data_json fps {fps:g}: {video_path}")
            actual = int(stream["nb_frames"]) if stream.get("nb_frames", "N/A") != "N/A" else round(float(stream["duration"]) * fps)
            if timing:
                return trim_h3_video(timing, actual, source_fps)
            aligned = frames + (5 - frames) % 17
            extended = aligned + context + (5 - aligned - context) % 17
            head = max(0.0, float(clip.get("preview_start_ms", start + float(clip.get("head_extend_sec", 0) or 0) * 1000)) - start)
            tail_end = float(clip.get("preview_end_ms", end - float(clip.get("tail_extend_sec", 0) or 0) * 1000))
            keep = round((tail_end - start - head) * fps / 1000)
            if keep <= 0:
                raise ValueError("Compose Clip Videos: trim removes the entire clip.")
            if abs(actual - keep) <= 1:
                return None, keep / fps
            offset = 0
            if context and abs(actual - extended) <= 1:
                offset = context
            elif not any(abs(actual - count) <= 1 for count in (frames, aligned, extended - context)):
                raise ValueError(f"Compose Clip Videos: ambiguous context trim for {video_path} ({actual} frames); expected {frames}, {aligned}, {extended - context} or {extended} frames.")
            # Alignment frames contain motion used by the next continuation.
            tail_frames = max(0, round((end - tail_end) * fps / 1000))
            keep = actual - offset - round(head * fps / 1000) - tail_frames
            if keep <= 0:
                raise ValueError("Compose Clip Videos: trim removes the entire clip.")
            return offset / fps + head / 1000, keep / fps
        try:
            head = max(0, int(clip.get("head_extend_sec", 0) or 0))
        except (TypeError, ValueError):
            head = 0
        try:
            tail = max(0, int(clip.get("tail_extend_sec", 0) or 0))
        except (TypeError, ValueError):
            tail = 0
        if head <= 0 and tail <= 0:
            return None, None

        # Preview-duration videos already match timeline slot — skip trim.
        if bool(clip.get("generate_preview_video", False)):
            return None, None

        start_ms = int(clip.get("start_ms", 0) or 0)
        end_ms = int(clip.get("end_ms", start_ms) or start_ms)
        preview_start = clip.get("preview_start_ms", None)
        preview_end = clip.get("preview_end_ms", None)
        try:
            preview_start = int(preview_start) if preview_start is not None else start_ms + head * 1000
        except (TypeError, ValueError):
            preview_start = start_ms + head * 1000
        try:
            preview_end = int(preview_end) if preview_end is not None else end_ms - tail * 1000
        except (TypeError, ValueError):
            preview_end = end_ms - tail * 1000

        preview_dur = max(1, preview_end - preview_start) / 1000.0
        ext_dur = max(1, end_ms - start_ms) / 1000.0
        vid_dur = _probe_duration_sec(video_path)

        # Only trim when the file looks like the extended-length render.
        if vid_dur is not None and vid_dur + 0.2 < ext_dur * 0.9:
            return None, None
        if vid_dur is not None and abs(vid_dur - preview_dur) <= 0.2 and head > 0:
            return None, None

        return float(head), float(preview_dur)

    def _normalize_segment(
        self,
        src: str,
        dst: str,
        ss: float | None,
        duration: float | None,
        keep_audio: bool,
    ) -> None:
        cmd = ["ffmpeg", "-y"]
        if ss is not None and ss > 0:
            cmd += ["-ss", f"{ss:.6f}"]
        cmd += ["-i", _ffmpeg_path(src)]
        source_audio = keep_audio and _probe_has_audio(src)
        if keep_audio and not source_audio:
            cmd += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
        if duration is not None and duration > 0:
            cmd += ["-t", f"{duration:.6f}"]
        cmd += ["-map", "0:v:0", "-c:v", "libx264", "-pix_fmt", "yuv420p"]
        if keep_audio:
            cmd += ["-map", "0:a:0" if source_audio else "1:a:0",
                    "-af", "aresample=48000,aformat=channel_layouts=stereo,apad",
                    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", "-shortest"]
        else:
            cmd += ["-an"]
        cmd.append(_ffmpeg_path(dst))
        log.info("[CAP_ComposeClipVideos] normalize: %s", " ".join(cmd))
        _run_ffmpeg(cmd)

    def _merge_audio(self, video_path: str, audio_path: str, output_path: str, keep_audio: bool) -> None:
        provided = "[1:a:0]aresample=48000,aformat=channel_layouts=stereo"
        if keep_audio:
            filters = (
                provided + "[provided];"
                "[0:a:0][provided]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0,"
                "alimiter=limit=0.95:level=0:latency=1,apad[aout]"
            )
        else:
            filters = provided + ",apad[aout]"
        _run_ffmpeg([
            "ffmpeg", "-y", "-i", _ffmpeg_path(video_path), "-i", _ffmpeg_path(audio_path),
            "-filter_complex", filters, "-map", "0:v:0", "-map", "[aout]",
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
            "-shortest", "-movflags", "+faststart", _ffmpeg_path(output_path),
        ])

    def _build_output_path(self, filename_prefix: str) -> tuple[str, str, str]:
        output_dir = os.path.abspath(folder_paths.get_output_directory())
        stamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        prefix = str(filename_prefix).strip().replace("\\", "/") or "capricorncd-timeline/compose"
        subfolder = os.path.dirname(prefix)
        base = os.path.basename(prefix) or "composed"
        base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base).strip(" .") or "composed"
        output_filename = f"{base}_{stamp}.mp4"
        full_output_folder = os.path.abspath(os.path.join(output_dir, subfolder)) if subfolder else output_dir
        full_output_folder = _safe_under(output_dir, full_output_folder)
        os.makedirs(full_output_folder, exist_ok=True)
        output_path = os.path.join(full_output_folder, output_filename)
        subfolder_ui = subfolder.replace("\\", "/") if subfolder else ""
        return output_filename, subfolder_ui, output_path

    def execute(
        self,
        data_json: str,
        clips_dir: str = "",
        name_mode: str = "from_start",
        filename_prefix: str = "capricorncd-timeline/compose",
        trim_extends: bool = True,
        save_sidecar: bool = True,
        prompt=None,
        extra_pnginfo=None,
        audio=None,
        use_original_audio: bool = True,
    ):
        if not shutil.which("ffmpeg"):
            raise RuntimeError(_t("ffmpeg_not_found", get_last_known_lang()))

        data = self._parse_data(data_json)
        clips = data.get("clips", [])
        if not isinstance(clips, list) or not clips:
            raise ValueError(_t("no_clips_in_data_json", get_last_known_lang()))

        fps = max(1.0, float(data.get("fps", 24.0) or 24.0))
        run_timestamp = str(data.get("run_timestamp") or data.get("run_prefix") or "").strip()
        resolved_dir = None
        parser = CAP_DataJsonClipParser()

        sources: list[tuple[dict, int, str]] = []
        for index, clip in enumerate(clips):
            if not isinstance(clip, dict):
                continue
            if clip.get("enabled", True) is False:
                continue
            filename = str(clip.get("output_video") or "").strip().replace("\\", "/")
            if filename:
                path = _safe_under(folder_paths.get_output_directory(), os.path.join(folder_paths.get_output_directory(), filename))
                if os.path.splitext(path)[1].lower() not in _VIDEO_EXTS or not os.path.isfile(path):
                    raise ValueError(f"Compose Clip Videos: output_video not found: {filename}")
            else:
                if resolved_dir is None:
                    resolved_dir = self._resolve_clips_dir(clips_dir, run_timestamp)
                stem = self._clip_stem(clip, index, fps, name_mode, parser)
                path = self._find_clip_video(resolved_dir, stem)
            if not path:
                raise ValueError(_t("clip_video_not_found", get_last_known_lang(), index=index, stem=repr(stem), dir=resolved_dir))
            sources.append((clip, index, path))

        if not sources:
            raise ValueError(_t("no_clips_to_compose", get_last_known_lang()))

        keep_audio = bool(use_original_audio) and any(_probe_has_audio(path) for _, _, path in sources)

        output_filename, subfolder, output_path = self._build_output_path(filename_prefix)
        tmp_dir = tempfile.mkdtemp(prefix="cap_compose_clips_")
        concat_list = None
        audio_tmp = None
        segment_paths: list[str] = []

        try:
            if audio is not None:
                audio_tmp = _write_audio_tmp(audio)
                if not audio_tmp:
                    raise ValueError("Compose Clip Videos: audio input is empty or invalid.")
            for order, (clip, index, src) in enumerate(sources):
                if trim_extends and clip.get("playback_spans"):
                    for part, span in enumerate(clip["playback_spans"]):
                        count = int(span["frame_count"])
                        if count <= 0:
                            continue
                        source = next((path for row, _, path in sources if row.get("source_clip_id") == span["source_clip_id"]), None)
                        if not source:
                            raise ValueError("Compose Clip Videos: context replacement requires the next clip video.")
                        probe = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=nb_frames,r_frame_rate", "-of", "json", _ffmpeg_path(source)], capture_output=True,
                            text=True, timeout=30, **({"creationflags": subprocess.CREATE_NO_WINDOW} if sys.platform == "win32" else {}))
                        if probe.returncode:
                            raise ValueError("Cannot probe context replacement source.")
                        stream = json.loads(probe.stdout)["streams"][0]
                        timing = timing_from_filename(source)
                        if timing and int(stream.get("nb_frames", 0)) != timing["raw_frames"]:
                            raise ValueError("Context replacement requires the original untrimmed generated video.")
                        num, den = map(float, stream["r_frame_rate"].split("/"))
                        if abs(num / den - fps) > 0.01:
                            raise ValueError("Context replacement source fps differs from the project.")
                        dst = os.path.join(tmp_dir, f"seg_{order:04d}_{part}.mp4")
                        self._normalize_segment(source, dst, int(span["start_frame"]) / fps, count / fps, keep_audio)
                        segment_paths.append(dst)
                    continue
                previous_clip = sources[order - 1][0] if order else None
                ss, dur = self._trim_plan(clip, src, bool(trim_extends), fps, previous_clip)
                dst = os.path.join(tmp_dir, f"seg_{order:04d}.mp4")
                self._normalize_segment(src, dst, ss, dur, keep_audio)
                segment_paths.append(dst)

            fd, concat_list = tempfile.mkstemp(suffix=".txt", prefix="cap_compose_concat_")
            os.close(fd)
            with open(concat_list, "w", encoding="utf-8", newline="\n") as wf:
                for path in segment_paths:
                    escaped = _ffmpeg_path(path).replace("'", r"'\''")
                    wf.write(f"file '{escaped}'\n")

            composed_path = os.path.join(tmp_dir, "composed.mp4") if audio_tmp else output_path
            cmd = [
                "ffmpeg", "-y",
                "-f", "concat",
                "-safe", "0",
                "-i", _ffmpeg_path(concat_list),
                "-c", "copy",
                _ffmpeg_path(composed_path),
            ]
            log.info("[CAP_ComposeClipVideos] concat %d clips -> %s", len(segment_paths), output_path)
            _run_ffmpeg(cmd)
            if audio_tmp:
                self._merge_audio(composed_path, audio_tmp, output_path, keep_audio)
        finally:
            if audio_tmp and os.path.exists(audio_tmp):
                os.unlink(audio_tmp)
            if concat_list and os.path.exists(concat_list):
                os.unlink(concat_list)
            shutil.rmtree(tmp_dir, ignore_errors=True)

        generation = {
            "schema": "capricorncd.video.generation.v1", "kind": "composition", "clips": [],
            "audio": {"use_original_audio": bool(use_original_audio), "audio_input": audio is not None},
        }
        for clip, index, path in sources:
            original = read_video_generation(path)
            generation["clips"].append({
                "index": index, "file": os.path.basename(path),
                "timeline_clip_id": str(clip.get("source_clip_id") or clip.get("id") or ""),
                "generation": original,
                "metadata_status": "recorded" if original else "unavailable",
            })
        embed_video_generation(output_path, generation)
        if save_sidecar:
            extra = {"clips": len(sources), "sources": [path for _, _, path in sources]}
            extra["generation"] = generation
            clip_rows = clip_prompts_from_data_json(data_json)
            if clip_rows:
                extra["clip_prompts"] = clip_rows
            write_sidecar(
                sidecar_path(output_path),
                build_sidecar_payload(
                    output_filename,
                    prompt=prompt,
                    extra=extra,
                ),
            )

        rel_name = f"{subfolder}/{output_filename}" if subfolder else output_filename
        return {
            "ui": {
                "video": [{
                    "filename": output_filename,
                    "subfolder": subfolder,
                    "type": "output",
                }]
            },
            "result": (rel_name,),
        }


NODE_CLASS_MAPPINGS = {"CAP_ComposeClipVideos": CAP_ComposeClipVideos}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_ComposeClipVideos": "Compose Clip Videos"}
