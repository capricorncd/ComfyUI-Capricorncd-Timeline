from __future__ import annotations

import json
import logging
import os
import sys

import torch
import torchaudio
import comfy.nested_tensor

import nodes
from comfy_api.latest._input_impl.video_types import VideoFromFile
from comfy_extras.nodes_minimax_h3 import FPS as H3_FPS, MiniMaxH3ImageToVideo, MiniMaxH3ReferenceToVideo, align_frame_count

from .cap_data_json_parser import CAP_DataJsonClipParser
from .cap_timeline_project_io import _resolve_output_file
from .timecode import AUDIO_EXTENSIONS, VIDEO_EXTENSIONS
from .media_speed import playback_rate

MAX_REF_IMAGES = 9
MAX_REF_VIDEOS = 3
MAX_REF_AUDIOS = 3
REF_VIDEO_FPS = 24
REF_VIDEO_MAX_SEC = 15.0

_LOG = logging.getLogger("cap_minimax_h3")


def _h3_audio_clip(clip, duration_ms):
    start_ms = int(clip.get("start_ms", 0))
    original_ms = max(1, int(clip.get("end_ms", start_ms)) - start_ms)
    extra_ms = max(0, duration_ms - original_ms)
    rows = []
    for row in clip.get("audios") or []:
        row = dict(row)
        rate = playback_rate(row.get("playback_rate"))
        end = int(row["source_end_ms"])
        span = (end - int(row.get("source_start_ms", 0))) / rate
        if int(row.get("clip_offset_ms", 0)) + span >= original_ms - 1:
            row["source_end_ms"] = end + round(extra_ms * rate)
        rows.append(row)
    return {**clip, "end_ms": start_ms + duration_ms, "audios": rows}


def _lock_audio(latent, encoded):
    video, _ = latent["samples"].unbind()
    return {**latent,
            "samples": comfy.nested_tensor.NestedTensor((video, encoded)),
            "noise_mask": comfy.nested_tensor.NestedTensor((torch.ones_like(video), torch.zeros_like(encoded)))}


def _digital_human_audio(latent, source, audio_vae, frame_count, prefix_frames):
    if source is None:
        raise ValueError("Digital Human requires an audio clip on the corresponding timeline audio track.")
    rate = source["sample_rate"]
    waveform = source["waveform"][:1]
    prefix = round(prefix_frames / 24 * rate)
    length = round(frame_count / 24 * rate)
    waveform = torch.nn.functional.pad(waveform, (prefix, 0))[..., :length]
    waveform = torch.nn.functional.pad(waveform, (0, length - waveform.shape[-1]))
    source = {"waveform": waveform, "sample_rate": rate}
    vae_rate = getattr(audio_vae, "audio_sample_rate", 32000)
    if rate != vae_rate:
        waveform = torchaudio.functional.resample(waveform, rate, vae_rate)
    encoded = audio_vae.encode(waveform.movedim(1, -1))
    target = latent["samples"].unbind()[1].shape[-1]
    if encoded.shape[-1] < target:
        encoded = torch.cat((encoded, encoded[..., -1:].expand(*encoded.shape[:-1], target - encoded.shape[-1])), dim=-1)
    encoded = encoded[..., :target].clone()
    return _lock_audio(latent, encoded), source, encoded


def _kind_of(row: dict, path: str) -> str:
    kind = str((row or {}).get("kind") or "").lower()
    if kind in ("image", "video", "audio"):
        return kind
    ext = os.path.splitext(path or "")[1].lower()
    if ext in VIDEO_EXTENSIONS:
        return "video"
    if ext in AUDIO_EXTENSIONS:
        return "audio"
    return "image"


def _frames_at_fps(frames: torch.Tensor, src_fps: float, dst_fps: float = REF_VIDEO_FPS, max_duration: float = REF_VIDEO_MAX_SEC) -> torch.Tensor:
    n = int(frames.shape[0])
    if n <= 0:
        return frames
    src_fps = max(1e-6, float(src_fps) or dst_fps)
    duration = min(n / src_fps, max_duration)
    target_n = max(1, int(round(duration * dst_fps)))
    if abs(src_fps - dst_fps) < 0.01 and n <= target_n:
        return frames[:target_n]
    idx = [min(n - 1, int(round(i * src_fps / dst_fps))) for i in range(target_n)]
    return frames[idx]


def _pad_video_frames(frames: torch.Tensor, min_frames: int = 5) -> torch.Tensor:
    n = int(frames.shape[0])
    if n >= min_frames:
        return frames
    return torch.cat([frames, frames[-1:].repeat(min_frames - n, 1, 1, 1)], dim=0)


def _snap_h3_grid(n: int) -> int:
    """Snap down to the H3 VAE run grid; returns 0 when below a usable pin (5)."""
    n = int(n)
    if n < 5:
        return 0
    return (n - 5) // 17 * 17 + 5


def _motion_context_cls():
    """Resolve MiniMaxH3MotionContext from the installed H3 Motion Context pack."""
    try:
        from nodes import NODE_CLASS_MAPPINGS as _ncm
        cls = _ncm.get("MiniMaxH3MotionContext")
        if cls is not None:
            return cls
    except Exception:
        pass
    for mod in list(sys.modules.values()):
        if mod is None:
            continue
        cls = getattr(mod, "MiniMaxH3MotionContext", None)
        if isinstance(cls, type) and callable(getattr(cls, "apply", None)):
            return cls
    raise RuntimeError(
        "Cap MiniMaxH3: h3_motion_context_length > 0 requires "
        "ComfyUI-H3-Motion-Context to be installed."
    )


def _context_latent_usable(latent, width: int, height: int) -> bool:
    """True when latent looks like an H3 AV latent at the target resolution."""
    if not isinstance(latent, dict) or latent.get("samples") is None:
        return False
    samples = latent["samples"]
    try:
        if hasattr(samples, "unbind"):
            parts = list(samples.unbind())
        elif isinstance(samples, (tuple, list)):
            parts = list(samples)
        else:
            return False
        if not parts:
            return False
        video = parts[0]
        if video.ndim == 4:
            video = video.unsqueeze(0)
        if video.ndim != 5:
            return False
        src_w = int(video.shape[4]) * 16
        src_h = int(video.shape[3]) * 16
        if src_w != int(width) or src_h != int(height):
            _LOG.warning(
                "Cap MiniMaxH3: context_latent is %dx%d, clip is %dx%d; trying previous output video.",
                src_w, src_h, width, height,
            )
            return False
        return True
    except Exception as exc:
        _LOG.warning("Cap MiniMaxH3: context_latent unusable (%s); skipping motion context.", exc)
        return False


def _prev_clip_output_video_path(data_json: str, index: int, previous_output_video: str = "") -> str:
    """Resolve previous runtime clip's CapTimelineEditor output_video under output/."""
    try:
        data = json.loads(data_json or "{}")
    except json.JSONDecodeError:
        data = {}
    if not isinstance(data, dict):
        return ""
    clips = data.get("clips")
    rel = str(previous_output_video or "").strip().replace("\\", "/")
    if not rel and isinstance(clips, list) and 0 <= index < len(clips):
        current = clips[index]
        rel = str(current.get("previous_output_video") or "").strip().replace("\\", "/")
        owner = (current.get("h3_timing") or {}).get("previous_source_clip_id")
        prev = next((row for row in clips[:index] if str(row.get("source_clip_id") or row.get("id")) == str(owner)), None) if owner else (clips[index - 1] if index else None)
        if isinstance(prev, dict):
            rel = rel or str(prev.get("output_video") or "").strip().replace("\\", "/")
    if not rel:
        return ""
    path = _resolve_output_file(rel)
    if path:
        return path
    # Absolute / already-resolved path.
    if os.path.isfile(rel):
        return os.path.normpath(rel)
    return ""


def _load_motion_context_from_video(path: str, pin_frames: int):
    """Load last pin_frames (at H3 fps) + matching audio from a decoded mp4.

    Returns (frames_IMAGE, audio_or_None) or (None, None).
    """
    pin_frames = max(1, int(pin_frames or 0))
    if not path or not os.path.isfile(path):
        return None, None
    # Slightly more than the pin so resampling still has enough samples.
    tail_sec = max(0.5, pin_frames / float(H3_FPS) + 0.35)
    try:
        video = VideoFromFile(path, start_time=-tail_sec, duration=tail_sec)
        components = video.get_components()
    except Exception as exc:
        _LOG.warning("Cap MiniMaxH3: failed reading context video %s (%s)", path, exc)
        return None, None
    frames = components.images
    if frames is None or not isinstance(frames, torch.Tensor) or frames.ndim != 4 or frames.shape[0] < 1:
        return None, None
    src_fps = float(components.frame_rate) if components.frame_rate else float(H3_FPS)
    frames = _frames_at_fps(frames, src_fps, float(H3_FPS))
    if int(frames.shape[0]) < pin_frames:
        _LOG.warning(
            "Cap MiniMaxH3: context video has %d frames after resample, need %d; skipping.",
            int(frames.shape[0]), pin_frames,
        )
        return None, None
    frames = frames[-pin_frames:].clone()
    audio = components.audio
    if not isinstance(audio, dict) or audio.get("waveform") is None:
        audio = None
    elif int(audio["waveform"].shape[-1]) < 1:
        audio = None
    else:
        samples = max(1, round(pin_frames / float(H3_FPS) * audio["sample_rate"]))
        audio = dict(audio, waveform=audio["waveform"][..., -samples:].clone())
    return frames, audio


class CAP_MiniMaxH3ReferenceToVideo:
    """Parse a Timeline Editor clip from data_json or clip_json and run MiniMax H3 Reference to Video."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "audio_vae": ("VAE",),
                "width": ("INT", {"default": 1344, "min": 32, "max": nodes.MAX_RESOLUTION, "step": 32}),
                "height": ("INT", {"default": 768, "min": 32, "max": nodes.MAX_RESOLUTION, "step": 32}),
                "ref_image_size": (["match", "max"], {
                    "default": "match",
                    "tooltip": "Reference image sizing. 'match' scales each ref to the generation's pixel area; 'max' uses 2048px short edge.",
                }),
                "data_json": ("STRING", {"default": "", "multiline": True}),
                "index": ("INT", {"default": 0, "min": 0, "max": 9999, "step": 1}),
            },
            "optional": {
                "clip_json": ("STRING", {
                    "default": "",
                    "multiline": True,
                    "tooltip": "Self-contained clip JSON (e.g. from Data Json Clip Parser). When non-empty, data_json and index are ignored.",
                }),
                "context_latent": ("LATENT", {
                    "tooltip": (
                        "Previous clip's sampler output latent (preferred). "
                        "Used when the clip's h3_motion_context_length > 0. "
                        "If missing/unusable, falls back to the previous clip's "
                        "output_video tail frames + audio (needs clip-specified "
                        "filenames and that file already on disk). "
                        "Pin length snaps down to the H3 VAE grid (17k+5). "
                        "Wire Decode -> H3 Motion Context Trim with trim_frames."
                    ),
                }),
                "strict_keyframes": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "False: text / image / video / audio reference generation. True: native first/last-frame conditioning; use one image for the first frame or two ordered images for first and last. No video/audio references or Motion Context. Select a compatible FL model and LoRA yourself; keyframes are model constraints, not a pixel-exact guarantee.",
                }),
            },
        }

    RETURN_TYPES = ("CONDITIONING", "LATENT", "INT", "STRING", "IMAGE", "IMAGE", "AUDIO", "STRING", "INT", "BOOLEAN", "INT")
    RETURN_NAMES = (
        "positive", "latent", "total_frame_count", "prompt",
        "images", "videos", "audio", "output_video", "trim_frames", "save_latent",
        "seed",
    )
    FUNCTION = "execute"
    CATEGORY = "Capricorncd/MiniMaxH3"
    DESCRIPTION = (
        "MiniMax H3 Reference to Video using a Timeline Editor clip from data_json+index, "
        "or a self-contained clip_json (when set, data_json and index are ignored for the "
        "clip body; previous_output_video in clip_json or data_json+index locates the previous video). "
        "Clip images map to ref_image, videos to ref_video (+ soundtrack), "
        "and clip audios to ref_audio. Frame count and prompt come from the clip. "
        "Digital Human clips lock source audio in the output latent; keep its noise_mask through sampling. "
        "The audio output includes context-prefix silence and model-grid padding for synchronized saving. "
        "Also outputs clip stills, video frames, mixed clip audio, and output_video "
        "(CapTimelineEditor-specified save path when enabled). "
        "total_frame_count uses clip_json/data_json fps (Timeline Editor fps), "
        "aligned to the H3 17k+5 frame grid — e.g. 7s at 60fps → ~430 frames. "
        "When h3_motion_context_length > 0: prefer context_latent; else pin from the "
        "previous clip's output_video tail (frames+audio). Requires "
        "ComfyUI-H3-Motion-Context. trim_frames feeds H3 Motion Context Trim after decode. "
        "save_latent mirrors the clip flag for gating Save Latent. "
        "seed outputs the Clip seed for RandomNoise/noise_seed; -1 means unset."
    )

    @classmethod
    def IS_CHANGED(cls, clip, vae, audio_vae, width, height, ref_image_size,
                   data_json, index, clip_json="", context_latent=None, strict_keyframes=False):
        return (data_json, index, clip_json, width, height, ref_image_size, strict_keyframes)

    def _parse_clip(self, data_json: str, index: int):
        try:
            data = json.loads(data_json or "{}")
        except json.JSONDecodeError:
            data = {}
        if not isinstance(data, dict):
            data = {}
        clips = data.get("clips", [])
        if not isinstance(clips, list):
            clips = []
        clip = clips[index] if clips and 0 <= index < len(clips) else {}
        if not isinstance(clip, dict):
            clip = {}
        parser = CAP_DataJsonClipParser()
        materials = parser._materials_by_id(data)
        return data, clip, materials, parser

    def _parse_clip_json(self, clip_json: str):
        try:
            clip = json.loads(clip_json or "{}")
        except json.JSONDecodeError:
            clip = {}
        if not isinstance(clip, dict):
            clip = {}
        parser = CAP_DataJsonClipParser()
        materials = parser._materials_by_id({"materials": clip.get("materials")})
        for ref in (
            parser._ref_list(clip.get("images"))
            + parser._ref_list(clip.get("videos"))
            + (clip.get("audios") if isinstance(clip.get("audios"), list) else [])
        ):
            if not isinstance(ref, dict):
                continue
            mid = str(ref.get("id") or "").strip()
            path = str(ref.get("file") or "").strip()
            if not mid or not path or mid in materials:
                continue
            materials[mid] = ref
        data = {
            "fps": clip.get("fps", 24.0),
            "global_prompt": clip.get("global_prompt", ""),
            "style_prompt": clip.get("style_prompt", ""),
            "non_diegetic_music": clip.get("non_diegetic_music", ""),
            "negative_prompt": clip.get("negative_prompt", ""),
            "prompt_concat_order": clip.get("prompt_concat_order"),
        }
        if any(key in clip for key in ("prepend_prompt", "append_prompt", "prefix_prompt", "prompt_prefix", "suffix_prompt", "prompt_suffix")):
            data["prepend_prompt"] = clip.get("prepend_prompt") or clip.get("prefix_prompt") or clip.get("prompt_prefix") or ""
            data["append_prompt"] = clip.get("append_prompt") or clip.get("suffix_prompt") or clip.get("prompt_suffix") or ""
        return data, clip, materials, parser

    def _visual_refs(self, clip: dict, parser: CAP_DataJsonClipParser) -> list:
        images = parser._ref_list(clip.get("images"))
        videos = parser._ref_list(clip.get("videos"))
        if images or videos:
            return images + videos
        return parser._ref_list(clip.get("start_image")) + parser._ref_list(clip.get("end_image"))

    def _material_for_ref(self, ref, materials: dict, parser: CAP_DataJsonClipParser) -> tuple[str, dict]:
        mid = parser._ref_id(ref)
        row = materials.get(mid) if mid else None
        if not isinstance(row, dict):
            row = ref if isinstance(ref, dict) else {}
        path = ""
        if isinstance(ref, dict):
            path = str(ref.get("file") or "").strip()
        if not path:
            path = parser._ref_file(ref, materials)
        location = str(row.get("location") or "input")
        if path and not os.path.isfile(path):
            path = parser._resolve_file_path(path, location)
        return os.path.normpath(path) if path else "", row if isinstance(row, dict) else {}

    def _load_video_ref(self, path: str, trim=None, extra_frames=0, max_frames=None):
        start, rate, target = 0.0, 1.0, None
        if trim and trim.get("file"):
            path = trim["file"]
            start = max(0.0, float(trim["start"]))
            rate = float(trim["rate"])
            selected = min(REF_VIDEO_MAX_SEC, float(trim["duration"]) / rate)
            target = align_frame_count(max(5, round(selected * REF_VIDEO_FPS) + extra_frames))
            target = min(target, max_frames or target, align_frame_count(round(REF_VIDEO_MAX_SEC * REF_VIDEO_FPS)))
        duration = target / REF_VIDEO_FPS * rate if target else REF_VIDEO_MAX_SEC
        try:
            video = VideoFromFile(path, start_time=start, duration=duration)
            components = video.get_components()
        except Exception:
            return None, None
        frames = components.images
        if frames is None or not isinstance(frames, torch.Tensor) or frames.ndim != 4 or frames.shape[0] < 1:
            return None, None
        src_fps = float(components.frame_rate) if components.frame_rate else REF_VIDEO_FPS
        frames = _frames_at_fps(frames, src_fps * rate, max_duration=duration / rate)
        if target is None:
            target = align_frame_count(max(5, int(frames.shape[0])))
            target = min(target, max_frames or target)
        frames = _pad_video_frames(frames[:target], target)
        audio = components.audio
        if not isinstance(audio, dict) or audio.get("waveform") is None:
            audio = None
        elif int(audio["waveform"].shape[-1]) < 1:
            audio = None
        else:
            waveform = audio["waveform"]
            sample_rate = audio["sample_rate"]
            if rate != 1:
                waveform = torchaudio.functional.resample(waveform, round(sample_rate * rate), sample_rate)
            samples = round(target / REF_VIDEO_FPS * sample_rate)
            waveform = waveform[..., :samples].clone()
            waveform = torch.nn.functional.pad(waveform, (0, samples - waveform.shape[-1]))
            audio = {"waveform": waveform, "sample_rate": sample_rate}
        return frames, audio

    def _load_audio_ref(self, row: dict, materials: dict, parser: CAP_DataJsonClipParser):
        path = os.path.normpath(parser._audio_row_path(row, materials))
        if not path or not os.path.isfile(path):
            return None
        src_start = max(0, int(row.get("source_start_ms", 0) or 0))
        src_end = max(src_start + 1, int(row.get("source_end_ms", src_start) or src_start))
        try:
            waveform, sample_rate = parser._load_waveform(path)
        except Exception:
            return None
        audio = parser._trim(waveform, sample_rate, src_start, src_end)
        rate = playback_rate(row.get("playback_rate"))
        if rate != 1:
            audio["waveform"] = parser._resample_waveform(audio["waveform"], round(sample_rate * rate), sample_rate)
        samples = max(1, round((src_end - src_start) / rate / 1000 * sample_rate))
        waveform = audio["waveform"][..., :samples].clone()
        audio["waveform"] = torch.nn.functional.pad(waveform, (0, samples - waveform.shape[-1]))
        return audio

    def _letterbox_frames(self, image: torch.Tensor, height: int, width: int) -> torch.Tensor:
        src_h, src_w = int(image.shape[1]), int(image.shape[2])
        if src_h == height and src_w == width:
            return image
        scale = min(height / src_h, width / src_w)
        nh = min(height, max(1, int(round(src_h * scale))))
        nw = min(width, max(1, int(round(src_w * scale))))
        nchw = image.permute(0, 3, 1, 2)
        if nh != src_h or nw != src_w:
            nchw = torch.nn.functional.interpolate(
                nchw, size=(nh, nw), mode="bilinear", align_corners=False,
            )
        canvas = nchw.new_ones(image.shape[0], nchw.shape[1], height, width)
        top = (height - nh) // 2
        left = (width - nw) // 2
        canvas[:, :, top:top + nh, left:left + nw] = nchw
        return canvas.permute(0, 2, 3, 1)

    def _stack_frames(self, frames: list, blank: torch.Tensor) -> torch.Tensor:
        rows = []
        for frame in frames:
            if not isinstance(frame, torch.Tensor) or frame.ndim != 4 or frame.shape[0] < 1:
                continue
            rows.append(frame)
        if not rows:
            return blank
        height, width = int(rows[0].shape[1]), int(rows[0].shape[2])
        aligned = [self._letterbox_frames(frame, height, width) for frame in rows]
        return torch.cat(aligned, dim=0)

    def execute(self, clip, vae, audio_vae, width, height, ref_image_size,
                data_json, index, clip_json="", context_latent=None, strict_keyframes=False):
        if str(clip_json or "").strip():
            data, clip_row, materials, parser = self._parse_clip_json(clip_json)
        else:
            data, clip_row, materials, parser = self._parse_clip(data_json, index)
        start_ms = int(clip_row.get("start_ms", 0) or 0)
        end_ms = int(clip_row.get("end_ms", start_ms) or start_ms)
        clip_duration_ms = max(1, end_ms - start_ms)
        # Prefer Timeline fps from clip_json / data_json (e.g. 60). Fall back to H3's 24.
        try:
            fps = float(data.get("fps", clip_row.get("fps", H3_FPS)))
        except (TypeError, ValueError):
            fps = float(H3_FPS)
        fps = max(1.0, fps)
        clip_frames = align_frame_count(max(5, int(round(clip_duration_ms * fps / 1000))))

        try:
            req_ctx = max(0, int(round(float(clip_row.get("h3_motion_context_length", 0) or 0))))
        except (TypeError, ValueError):
            req_ctx = 0
        pin = _snap_h3_grid(req_ctx)
        timing = clip_row.get("h3_timing")
        if timing:
            if abs(float(timing["fps"]) - fps) > 0.01:
                raise ValueError("Cap MiniMaxH3: fps changed after the generation timing was planned. Run Timeline Editor again.")
            pin = int(timing["context_frames"])

        if strict_keyframes and pin:
            raise ValueError("Strict first/last frames cannot be combined with Motion Context. Disable strict_keyframes for a continuous chain.")
        if strict_keyframes and clip_row.get("audios"):
            raise ValueError("Strict first/last frames accepts only one or two images, not audio references.")

        use_context = False
        context_frames = None
        context_audio = None
        use_latent_ctx = False
        mc_cls = None
        if pin > 0:
            mc_cls = _motion_context_cls()
            if context_latent is not None and _context_latent_usable(context_latent, width, height):
                use_context = True
                use_latent_ctx = True
            else:
                prev_path = _prev_clip_output_video_path(data_json, int(index), clip_row.get("previous_output_video", ""))
                if prev_path:
                    context_frames, context_audio = _load_motion_context_from_video(prev_path, pin)
                    if context_frames is not None:
                        use_context = True
                        _LOG.info(
                            "Cap MiniMaxH3: no usable context_latent; pinning from "
                            "previous output_video %s (pin=%d).",
                            prev_path, pin,
                        )
                if not use_context and timing:
                    raise ValueError("Cap MiniMaxH3: planned continuation needs a same-resolution latent or the previous output video. Run the preceding clip with video output enabled; for clip_json workflows, run Data Json Clip Parser again to include the previous video path.")
                if not use_context:
                    _LOG.info(
                        "Cap MiniMaxH3: h3_motion_context_length=%d (pin=%d) but no usable "
                        "context_latent and no previous output_video tail; "
                        "generating without motion context.",
                        req_ctx, pin,
                    )
                    mc_cls = None

        length = align_frame_count(clip_frames + pin) if use_context else clip_frames
        if timing:
            length = int(timing["raw_frames"])
        audio_clip = _h3_audio_clip(clip_row, round((length - (pin if use_context else 0)) * 1000 / H3_FPS))

        ref_images = {}
        ref_videos = {}
        ref_video_audios = {}
        ref_audios = {}
        image_frames = []
        video_frames = []

        for ref in self._visual_refs(clip_row, parser):
            path, row = self._material_for_ref(ref, materials, parser)
            if not path or not os.path.isfile(path):
                if strict_keyframes:
                    raise ValueError("Strict first/last frame image is missing or unreadable.")
                continue
            kind = _kind_of(row, path)
            if strict_keyframes and (kind != "image" or len(image_frames) >= 2):
                raise ValueError("Strict first/last frames requires one or two ordered images only. Use reference mode for other materials.")
            if kind == "video":
                if len(ref_videos) >= MAX_REF_VIDEOS:
                    continue
                frames, soundtrack = self._load_video_ref(path, row.get("video_trim"),
                    max(0, length - round(clip_duration_ms * fps / 1000)), length)
                if frames is None:
                    continue
                n = len(ref_videos) + 1
                ref_videos[f"ref_video_{n}"] = frames
                video_frames.append(frames)
                if soundtrack is not None:
                    ref_video_audios[f"ref_video_audio_{n}"] = soundtrack
                continue
            if kind != "image" or len(ref_images) >= MAX_REF_IMAGES:
                continue
            img = parser._load_image(path)
            if img is None:
                if strict_keyframes:
                    raise ValueError("Strict first/last frame image could not be decoded.")
                continue
            n = len(ref_images) + 1
            ref_images[f"ref_image_{n}"] = img
            image_frames.append(img)

        for row in audio_clip.get("audios") if isinstance(audio_clip.get("audios"), list) else []:
            if len(ref_audios) >= MAX_REF_AUDIOS:
                break
            if not isinstance(row, dict):
                continue
            audio = self._load_audio_ref(row, materials, parser)
            if audio is None:
                continue
            n = len(ref_audios) + 1
            ref_audios[f"ref_audio_{n}"] = audio

        fixed_prompts = "prepend_prompt" in data or "append_prompt" in data
        prompt = parser._compose_prompt(
            clip_row, data.get("global_prompt", ""),
            materials=materials,
            style_prompt=data.get("style_prompt", ""),
            non_diegetic_music=data.get("non_diegetic_music", ""),
            negative_prompt=data.get("negative_prompt", ""),
            prompt_concat_order=data.get("prompt_concat_order"),
            prepend_prompt=data.get("prepend_prompt", "") if fixed_prompts else None,
            append_prompt=data.get("append_prompt", "") if fixed_prompts else None,
        )

        if parser._uses_master_audio(data, clip_row):
            if clip_row.get("clip_role") == "digital_human" and not os.path.isfile(str(data.get("audio_path") or "")):
                raise ValueError("Digital Human requires a readable source audio track.")
            audio_out = parser._clip_audio_from_master(data, audio_clip, 0)
        else:
            if clip_row.get("clip_role") == "digital_human" and not ref_audios:
                raise ValueError("Digital Human requires an audio clip on the corresponding timeline audio track.")
            audio_out = parser._clip_audio_from_audios(audio_clip, 0, materials=materials)
        if clip_row.get("clip_role") == "digital_human":
            prompt += ("\nPerformance instruction: Lip-sync only to the audible lead voice in the supplied audio, "
                       "matching its words, syllables and pauses. During instrumental passages and vocal pauses, "
                       "keep the lips gently closed with natural breathing and subtle head movement. "
                       "Do not mouth along to instruments, improvise words or add vocalizations. "
                       "Keep the face clearly visible.")
        blank = torch.zeros(1, 64, 64, 3)
        images_out = self._stack_frames(image_frames, blank)
        videos_out = self._stack_frames(video_frames, blank)

        if strict_keyframes:
            if not image_frames:
                raise ValueError("Strict first/last frames needs at least one image. Disable strict_keyframes for text-to-video.")
            out = MiniMaxH3ImageToVideo.execute(
                clip, vae, prompt, width, height, length,
                first_frame=image_frames[0],
                last_frame=image_frames[1] if len(image_frames) == 2 else None,
            )
        else:
            out = MiniMaxH3ReferenceToVideo.execute(
                clip=clip, prompt=prompt, width=width, height=height, length=length,
                ref_image_size=ref_image_size, vae=vae, audio_vae=audio_vae,
                ref_images=ref_images or None,
                ref_videos=ref_videos or None,
                ref_video_audios=ref_video_audios or None,
                ref_audios=ref_audios or None,
            )
        positive, latent = out.args
        trim_frames = 0

        if use_context and mc_cls is not None:
            try:
                apply_kw = {
                    "audio_context_length": 0,
                    "audio_vae": audio_vae,
                }
                if use_latent_ctx:
                    apply_kw["context_latent"] = context_latent
                else:
                    apply_kw["context_frames"] = context_frames
                    if context_audio is not None:
                        apply_kw["context_audio"] = context_audio
                positive, trim_frames = mc_cls().apply(
                    positive, vae, latent, pin, **apply_kw,
                )
                trim_frames = int(trim_frames or 0)
                if timing and trim_frames != pin:
                    raise ValueError(f"Motion Context returned {trim_frames} trim frames; this run planned {pin}. Check the previous latent length and context plugin settings.")
            except Exception as exc:
                if timing:
                    raise ValueError("Cap MiniMaxH3: planned motion context failed; refusing an unlinked video with misleading timing metadata.") from exc
                _LOG.warning(
                    "Cap MiniMaxH3: motion context failed (%s); regenerating without context.",
                    exc,
                )
                length = clip_frames
                out = MiniMaxH3ReferenceToVideo.execute(
                    clip=clip, prompt=prompt, width=width, height=height, length=length,
                    ref_image_size=ref_image_size, vae=vae, audio_vae=audio_vae,
                    ref_images=ref_images or None,
                    ref_videos=ref_videos or None,
                    ref_video_audios=ref_video_audios or None,
                    ref_audios=ref_audios or None,
                )
                positive, latent = out.args
                trim_frames = 0

        if clip_row.get("clip_role") == "digital_human":
            latent, audio_out, _ = _digital_human_audio(latent, audio_out, audio_vae, length, trim_frames)

        output_video = str(clip_row.get("output_video") or "").strip().replace("\\", "/")
        save_latent = bool(clip_row.get("save_latent", False))
        try:
            seed = max(-1, int(clip_row.get("seed", -1)))
        except (TypeError, ValueError):
            seed = -1
        return (
            positive, latent, length, prompt, images_out, videos_out,
            audio_out, output_video, trim_frames, save_latent, seed,
        )


_EMPTY_CONTEXT_LATENT = {"samples": None}


class CAP_H3MotionContextRefine:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "conditioning": ("CONDITIONING",),
                "vae": ("VAE",),
                "latent": ("LATENT",),
                "context_length": ("INT", {"default": 0, "min": 0}),
            },
            "optional": {"context_latent": ("LATENT",)},
        }

    RETURN_TYPES = ("CONDITIONING",)
    RETURN_NAMES = ("conditioning",)
    FUNCTION = "apply"
    CATEGORY = "Capricorncd/MiniMaxH3"
    DESCRIPTION = "Replace first-pass motion context with the previous clip's high-resolution AV latent. Wire the current upscaled AV latent and MiniMaxH3 trim_frames. Zero context bypasses; no frames are added or trimmed."

    def apply(self, conditioning, vae, latent, context_length, context_latent=None):
        if context_length == 0:
            return (conditioning,)
        if context_length < 5 or _snap_h3_grid(context_length) != context_length:
            raise ValueError("H3 refine context: use the effective trim_frames from MiniMaxH3 (17k+5).")
        if not isinstance(context_latent, dict) or context_latent.get("samples") is None:
            raise ValueError("H3 refine context: missing previous high-resolution AV latent. Run the preceding clip with high-resolution Save Latent enabled.")
        # H3 Motion Context marks pinned video anchors and timeline audio refs.
        # Keep user refs and end anchors; never mutate first-pass conditioning.
        clean = []
        for embedding, extra in conditioning:
            data = extra.copy()
            data["minimax_keyframes"] = [
                k for k in extra.get("minimax_keyframes", [])
                if not ("motion_context_index" in k and k["motion_context_index"] < context_length)
            ]
            data["minimax_refs"] = [
                ref for ref in extra.get("minimax_refs", [])
                if "motion_context_audio_end_frame" not in ref
            ]
            clean.append([embedding, data])
        result, trim = _motion_context_cls()().apply(
            clean, vae, latent, context_length, audio_context_length=0,
            context_latent=context_latent,
        )
        if trim != context_length:
            raise ValueError("H3 refine context: plugin trim differs from first-pass timing; refusing a shifted continuation.")
        return (result,)


class CAP_H3MotionContextLoadLatentOptional:
    """Load H3 Motion Context latent only when `load` is True.

    Wire Data Parser `load_context` into `load`. When False (or file missing)
    returns an empty LATENT — Cap MiniMaxH3 then falls back to previous
    output_video or skips pinning. No If false-branch needed.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "load": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "From Data Json Clip Parser load_context "
                               "(h3_motion_context_length > 0). False skips "
                               "disk load without error.",
                }),
                "latent_path": ("STRING", {
                    "default": "h3_context",
                    "tooltip": "Same as H3 Motion Context Load Latent: file "
                               "or folder under ComfyUI output/.",
                }),
                "clip_index": ("INT", {
                    "default": 0, "min": 0, "max": 9999,
                    "tooltip": "Clip slot to continue FROM (previous clip). "
                               "0 = newest file (not retry-safe).",
                }),
            },
        }

    RETURN_TYPES = ("LATENT",)
    RETURN_NAMES = ("context_latent",)
    FUNCTION = "load_latent"
    CATEGORY = "Capricorncd/MiniMaxH3"
    DESCRIPTION = (
        "Optional H3 Motion Context Load Latent. Loads only when load=True; "
        "otherwise (or if the file is missing) outputs an empty LATENT so Cap "
        "MiniMaxH3 can fall back to the previous clip's output_video."
    )

    @classmethod
    def IS_CHANGED(cls, load, latent_path, clip_index=0):
        if not load:
            return "skip"
        try:
            from nodes import NODE_CLASS_MAPPINGS as _ncm
            loader = _ncm.get("MiniMaxH3MotionContextLoadLatent")
            if loader is not None and hasattr(loader, "IS_CHANGED"):
                return loader.IS_CHANGED(latent_path, clip_index)
        except Exception:
            pass
        return f"{load}:{latent_path}:{clip_index}"

    def load_latent(self, load, latent_path, clip_index=0):
        if not load:
            _LOG.info("Cap H3 optional load: load=False; skipped.")
            return (_EMPTY_CONTEXT_LATENT,)
        try:
            from nodes import NODE_CLASS_MAPPINGS as _ncm
            loader_cls = _ncm.get("MiniMaxH3MotionContextLoadLatent")
            if loader_cls is None:
                _LOG.warning(
                    "Cap H3 optional load: MiniMaxH3MotionContextLoadLatent "
                    "not installed; skipping."
                )
                return (_EMPTY_CONTEXT_LATENT,)
            out = loader_cls().load(latent_path, clip_index)
            if isinstance(out, tuple):
                return out
            return (out,)
        except Exception as exc:
            _LOG.info(
                "Cap H3 optional load: skipped (%s); Cap MiniMaxH3 will try "
                "output_video fallback or generate without context.",
                exc,
            )
            return (_EMPTY_CONTEXT_LATENT,)


class CAP_H3MotionContextSaveLatentOptional:
    """Save H3 Motion Context latent only when `save` is True.

    Wire Cap MiniMaxH3 / Data Parser `save_latent` into `save`. When False the
    node is a no-op (returns empty path) so no If false-branch is needed.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "save": ("BOOLEAN", {
                    "default": False,
                    "tooltip": "From Cap MiniMaxH3 or Data Json Clip Parser "
                               "save_latent. False skips writing to disk.",
                }),
                "latent": ("LATENT", {
                    "tooltip": "Sampler output latent (same as stock H3 "
                               "Motion Context Save Latent).",
                }),
                "filename_prefix": ("STRING", {
                    "default": "h3_context/clip",
                    "tooltip": "Under ComfyUI output/. Same as stock Save Latent.",
                }),
                "clip_index": ("INT", {
                    "default": 0, "min": 0, "max": 9999,
                    "tooltip": "This clip's slot (overwrite on re-roll). "
                               "0 = auto-numbered run files.",
                }),
            },
        }

    RETURN_TYPES = ("STRING", "LATENT")
    RETURN_NAMES = ("latent_path", "latent")
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "Capricorncd/MiniMaxH3"
    DESCRIPTION = (
        "Optional H3 Motion Context Save Latent. Saves only when save=True; "
        "otherwise returns an empty path and passes the latent through. "
        "Requires ComfyUI-H3-Motion-Context."
    )

    @classmethod
    def IS_CHANGED(cls, save, latent, filename_prefix, clip_index=0):
        if not save:
            return "skip"
        return f"{save}:{filename_prefix}:{clip_index}"

    def save(self, save, latent, filename_prefix, clip_index=0):
        if not save:
            _LOG.info("Cap H3 optional save: save=False; skipped.")
            return ("", latent)
        try:
            from nodes import NODE_CLASS_MAPPINGS as _ncm
            saver_cls = _ncm.get("MiniMaxH3MotionContextSaveLatent")
            if saver_cls is None:
                raise RuntimeError(
                    "Cap H3 optional save: MiniMaxH3MotionContextSaveLatent "
                    "not installed (need ComfyUI-H3-Motion-Context)."
                )
            out = saver_cls().save(latent, filename_prefix, clip_index)
            path = out[0] if isinstance(out, tuple) else out
            return (str(path or ""), latent)
        except Exception as exc:
            _LOG.warning("Cap H3 optional save failed: %s", exc)
            raise


NODE_CLASS_MAPPINGS = {
    "CAP_H3MotionContextRefine": CAP_H3MotionContextRefine,
    "CAP_MiniMaxH3ReferenceToVideo": CAP_MiniMaxH3ReferenceToVideo,
    "CAP_H3MotionContextLoadLatentOptional": CAP_H3MotionContextLoadLatentOptional,
    "CAP_H3MotionContextSaveLatentOptional": CAP_H3MotionContextSaveLatentOptional,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "CAP_H3MotionContextRefine": "H3 Motion Context (Refine)",
    "CAP_MiniMaxH3ReferenceToVideo": "MiniMaxH3",
    "CAP_H3MotionContextLoadLatentOptional": "H3 Motion Context Load Latent (Optional)",
    "CAP_H3MotionContextSaveLatentOptional": "H3 Motion Context Save Latent (Optional)",
}
