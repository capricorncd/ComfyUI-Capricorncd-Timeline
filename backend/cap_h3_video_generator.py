"""MiniMax H3 timeline generation, with one clip's tensors alive at a time."""
from __future__ import annotations

import hashlib
import json
import math
import secrets

import folder_paths
import nodes
import comfy.model_management
from comfy.patcher_extension import WrappersMP
from comfy_api.latest import io

from .cap_minimax_h3 import CAP_MiniMaxH3ReferenceToVideo, CAP_H3MotionContextRefine
from .cap_seq_to_video import CAP_SeqToVideo
from .cap_compose_clip_videos import CAP_ComposeClipVideos
from .cap_model_preview import CAP_ModelPreviewOverride
from .cap_size_settings import CAP_SizeFromMegapixels
from .cap_te_notify import EVENT_CLIP_RUNNING, notify_timeline
from .cap_video_metadata import execution_graph
from .h3_timing import timing_filename


REFINE_SIGMAS = "0.9035, 0.8000, 0.6316, 0.3158, 0.0000"


def _node_class(name):
    cls = nodes.NODE_CLASS_MAPPINGS.get(name)
    if cls is None:
        raise RuntimeError(f"H3 Video Generator requires the installed node: {name}.")
    return cls


def _call(name, records, **inputs):
    cls = _node_class(name)
    if issubclass(cls, io.ComfyNode):
        result = cls.execute(**inputs)
        values = result.args
    else:
        result = getattr(cls(), cls.FUNCTION)(**inputs)
        values = result["result"] if isinstance(result, dict) else result
    # Only scalar execution parameters belong in the saved provenance, never tensors.
    records[f"h3_internal_{len(records)}"] = {
        "class_type": name,
        "inputs": {k: v for k, v in inputs.items() if isinstance(v, (str, int, float, bool))},
    }
    return values


def _clip_id(row):
    return str(row.get("source_clip_id") or row.get("id") or "")


def _context_source(row, earlier):
    timing = row.get("h3_timing") or {}
    if timing:
        return str(timing.get("previous_source_clip_id") or "") if timing.get("context_frames") else ""
    if not row.get("h3_motion_context_length"):
        return ""
    for previous in reversed(earlier):
        if previous.get("z_index", 0) == row.get("z_index", 0):
            end = previous.get("preview_end_ms", previous["end_ms"])
            start = row.get("preview_start_ms", row["start_ms"])
            return _clip_id(previous) if previous.get("save_latent") and abs(end - start) <= 1 else ""
    return ""


def _validate(data, strict_keyframes):
    if not isinstance(data, dict) or not isinstance(data.get("clips"), list) or not data["clips"]:
        raise ValueError("Connect Timeline Editor runtime data_json with at least one director Clip.")
    width, height = int(data["width"]), int(data["height"])
    fps = float(data["fps"])
    if width < 32 or height < 32 or width % 32 or height % 32:
        raise ValueError("H3 output width and height must be positive multiples of 32. Update the project dimensions.")
    if not math.isfinite(fps) or fps <= 0:
        raise ValueError("Project fps must be positive and finite.")
    seen = set()
    for row in data["clips"]:
        if not isinstance(row, dict) or not _clip_id(row) or _clip_id(row) in seen:
            raise ValueError("Runtime clips must have unique source Clip IDs.")
        seen.add(_clip_id(row))
        if not isinstance(row.get("output_video"), str) or not row["output_video"].strip():
            raise ValueError(f"Clip {_clip_id(row)} is missing output_video. Supply its video path in data_json before running.")
        if row.get("clip_type") in ("video", "audio", "subtitle", "text"):
            raise ValueError("Only director Clips may be sent to H3 Video Generator.")
        if float(row["end_ms"]) <= float(row["start_ms"]):
            raise ValueError(f"Clip {_clip_id(row)} has an empty time range.")
        timing = row.get("h3_timing") or {}
        if strict_keyframes and int(timing.get("context_frames", row.get("h3_motion_context_length", 0)) or 0):
            raise ValueError("Strict first/last frames cannot be combined with Motion Context.")
    return width, height, fps


class CAP_H3VideoGenerator:
    CATEGORY = "Capricorncd/MiniMaxH3"
    FUNCTION = "generate"
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("video_files", "data_json", "composed_video")
    OUTPUT_IS_LIST = (True, False, False)
    OUTPUT_NODE = True
    DOC_SLUG = "h3-video-generator"
    DESCRIPTION = (
        "Generate each runtime director Clip and immediately save its video. Replaces the outer loop, "
        "conditioning, sampling, optional upscale/refine and video saving nodes. Connect the sampling MODEL "
        "after external LoRA loading, CLIP, video VAE and audio VAE. Audio repair uses optional base_model "
        "when connected, otherwise the incoming LoRA model. Select a matching 4/8-step LoRA externally. Project dimensions "
        "must be multiples of 32. Clip seed -1 is resolved once for all passes. "
        "Strict frames: one image = first; two = first/last; no AV references or Motion Context. "
        "Reference mode also permits FL models but does not force endpoints. "
        "First sampling always runs the full selected 4/8-step schedule. Refine uses its own explicit sigmas. "
        "Run connected Save Latent clips together; high/low contexts are matched by source Clip ID, not newest file. "
        "Each saved Clip immediately updates the node player. compose_final defaults to true and trims/joins "
        "the generated clips with their original audio, using the existing H3 timing rules. "
        "sampling_preview defaults to true and requires KJNodes; previews use each Clip's actual frame count "
        "in this node without an external preview override. Select an installed H3 Tiny VAE for RGB previews. "
        "video_files is a STRING list; data_json is a single updated object; composed_video is empty when composition is off."
    )

    @classmethod
    def INPUT_TYPES(cls):
        upscale_models = folder_paths.get_filename_list("latent_upscale_models") if "latent_upscale_models" in folder_paths.folder_names_and_paths else []
        return {
            "required": {
                "model": ("MODEL", {"tooltip": "Sampling model after external acceleration/style LoRA loading. Used for both video passes and their previews; this node does not load LoRAs."}),
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "audio_vae": ("VAE",),
                "data_json": ("STRING", {"default": "", "multiline": True, "forceInput": True}),
                "steps": (["4", "8"], {"default": "8"}),
                "strict_keyframes": ("BOOLEAN", {"default": False, "tooltip": CAP_MiniMaxH3ReferenceToVideo.INPUT_TYPES()["optional"]["strict_keyframes"][1]["tooltip"]}),
                "second_sampling": ("BOOLEAN", {"default": False}),
                "first_pass_megapixels": ("FLOAT", {"default": 0.2, "min": 0.01, "max": 8.0, "step": 0.01, "tooltip": "Only used with second sampling: sets first-pass resolution before upscale to data_json dimensions. Without second sampling, generate directly at data_json width/height and ignore this value."}),
                "upscaler_model": (["none"] + upscale_models,),
                "refine_sigmas": ("STRING", {"default": REFINE_SIGMAS}),
                "audio_refine": ("BOOLEAN", {"default": False, "tooltip": "Run the extra audio-only repair pass. Ignored when generate_audio is off."}),
                "audio_refine_steps": ("INT", {"default": 3, "min": 1, "max": 12}),
                "normalize_audio": ("BOOLEAN", {"default": False, "tooltip": "Normalize to -14 LUFS; requires WanVideoWrapper NormalizeAudioLoudness."}),
                "attention": (["keep", "pytorch attention", "comfy kitchen attention"], {"default": "keep"}),
            },
            "optional": {
                "base_model": ("MODEL", {"tooltip": "Optional model override for audio repair and the base sampling schedule. If unconnected, both use the incoming sampling model with its LoRAs preserved."}),
                "compose_final": ("BOOLEAN", {"default": True, "tooltip": "After all requested Clips finish, trim and join their generated videos with original audio. Uses data_json H3 context replacement. Does not render subtitle/media tracks from the editor."}),
                "sampling_preview": ("BOOLEAN", {"default": True, "tooltip": "Show sampling animation in this node, then the completed Clip video. Requires KJNodes; no external preview node or frame-count connection needed."}),
                "preview_tiny_vae": (["none"] + folder_paths.get_filename_list("vae_approx"), {"default": "none", "tooltip": "Select taeh3.safetensors for H3 RGB previews if installed in models/vae_approx. none uses approximate latent colors; completed videos always use the full VAE."}),
                "generate_audio": ("BOOLEAN", {"default": True, "tooltip": "Include generated audio in Clip and final videos. Off skips audio repair, decoding, normalization and audio encoding for silent MV footage. H3 still jointly samples the audio latent; reference audio is preserved."}),
            },
            "hidden": {"prompt": "PROMPT", "extra_pnginfo": "EXTRA_PNGINFO", "unique_id": "UNIQUE_ID", "dynprompt": "DYNPROMPT"},
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def generate(self, model, clip, vae, audio_vae, data_json,
                 steps="8", strict_keyframes=False, second_sampling=False, first_pass_megapixels=0.2,
                 upscaler_model="none", refine_sigmas=REFINE_SIGMAS,
                 audio_refine=False, audio_refine_steps=3, normalize_audio=False, attention="keep",
                 prompt=None, extra_pnginfo=None,
                 unique_id=None, dynprompt=None, compose_final=True, sampling_preview=True, preview_tiny_vae="none", generate_audio=True, base_model=None):
        data = json.loads(data_json)
        width, height, fps = _validate(data, strict_keyframes)
        audio_refine = bool(generate_audio and audio_refine)
        normalize_audio = bool(generate_audio and normalize_audio)
        if str(steps) not in ("4", "8"):
            raise ValueError("H3 steps must be 4 or 8.")
        steps = int(steps)
        required = ["MiniMaxH3SigmaShift", "RandomNoise", "BasicGuider", "KSamplerSelect",
                    "BasicScheduler", "SamplerCustomAdvanced", "VAEDecode"]
        if generate_audio:
            required.append("VAEDecodeAudio")
        if sampling_preview:
            required.append("ModelPreviewOverrideKJ")
            if preview_tiny_vae != "none":
                folder_paths.get_full_path_or_raise("vae_approx", preview_tiny_vae)
        if attention != "keep":
            required.append("ModelAttentionBackend")
        if second_sampling:
            if upscaler_model == "none":
                raise ValueError("Select a latent upscaler model for second sampling.")
            folder_paths.get_full_path_or_raise("latent_upscale_models", upscaler_model)
            sigmas = [float(v.strip()) for v in refine_sigmas.split(",")]
            if len(sigmas) < 2 or sigmas[-1] != 0 or any(not math.isfinite(v) or v < 0 for v in sigmas) or any(a <= b for a, b in zip(sigmas, sigmas[1:])):
                raise ValueError("Refine sigmas must strictly decrease and end at 0.")
            required += ["MinimaxH3LatentUpscaler3D", "LTXVSeparateAVLatent", "LTXVConcatAVLatent", "ManualSigmas"]
        if any(row.get("save_latent") for row in data["clips"]):
            required += ["MiniMaxH3MotionContextSaveLatent", "MiniMaxH3MotionContextLoadLatent"]
        if audio_refine:
            required += ["H3FrozenVideoCache", "H3AudioRefineSampler"]
        if normalize_audio:
            required.append("NormalizeAudioLoudness")
        for name in required:
            _node_class(name)
        earlier = []
        for row in data["clips"]:
            previous = _context_source(row, earlier)
            if previous and not any(_clip_id(p) == previous and p.get("save_latent") for p in earlier):
                raise ValueError(f"Clip {_clip_id(row)} needs preceding Clip {previous}. Run the connected Save Latent chain together.")
            earlier.append(row)

        records = execution_graph(prompt, dynprompt, unique_id)
        if base_model is None:
            base_model = model
        model, = _call("MiniMaxH3SigmaShift", records, model=model, shift_video=12.0, shift_audio=3.0)
        if attention != "keep":
            model, = _call("ModelAttentionBackend", records, model=model, attention=attention)
        low_width, low_height = width, height
        if second_sampling:
            low_width, low_height, _, _ = CAP_SizeFromMegapixels().execute(
                width, height, min(first_pass_megapixels, width * height / 1048576), 32)

        paths, videos, context_paths = [], [], {}
        run_token = secrets.token_hex(8)
        display_id = dynprompt.get_display_node_id(unique_id) if dynprompt is not None else unique_id
        phases = ["prepare", "sample"]
        if second_sampling:
            phases += ["upscale", "refine"]
        if audio_refine:
            phases.append("audio")
        phases += ["decode", "save"]
        clip_total = len(data["clips"])
        total_units = clip_total * len(phases) + int(compose_final)

        def progress(phase):
            if phase == "done":
                units = total_units
            elif phase == "compose":
                units = clip_total * len(phases)
            else:
                units = index * len(phases) + phases.index(phase)
            info = dict(node_id=display_id, clip_index=index + 1,
                        clip_total=clip_total, phase=phase, percent=math.floor(100 * units / total_units))
            notify_timeline("cat_h3_progress", **info)
            return info

        for index, row in enumerate(data["clips"]):
            comfy.model_management.throw_exception_if_processing_interrupted()
            cid = _clip_id(row)
            seed = int(row.get("seed", -1))
            if seed < 0:
                seed = secrets.randbits(53)
            row["seed"] = seed
            previous = _context_source(row, data["clips"][:index])
            prior_paths = context_paths.get(previous)
            if previous and not prior_paths:
                raise ValueError(f"Clip {cid} needs preceding Clip {previous}. Run the connected Save Latent chain together.")
            notify_timeline(EVENT_CLIP_RUNNING, clip_id=cid, index=index)
            saved, contexts = self._generate_clip(
                model, base_model, clip, vae, audio_vae, data, index, width, height, low_width, low_height,
                fps, steps, strict_keyframes, second_sampling, upscaler_model, refine_sigmas,
                audio_refine, audio_refine_steps, normalize_audio, attention, prior_paths,
                run_token, dict(records), extra_pnginfo,
                f"{display_id}::h3:{run_token}_{index}" if sampling_preview else None, preview_tiny_vae, progress, generate_audio)
            filename = saved["result"][0]
            row["output_video"] = filename
            for owner in data["clips"]:
                for span in owner.get("playback_spans", []):
                    if span.get("source_clip_id") == cid:
                        span["output_video"] = filename
            paths.append(filename)
            info = {**saved["ui"]["video"][0], "preview_key": f"{run_token}_{index}", "clip_id": cid}
            videos.append(info)
            notify_timeline("cat_h3_video_ready", node_id=display_id, video=info)
            if contexts:
                context_paths[cid] = contexts
        preview = videos[-1]
        composed_video = ""
        if compose_final:
            comfy.model_management.throw_exception_if_processing_interrupted()
            progress("compose")
            # This list is the explicit run scope, including individually requested disabled clips.
            compose_data = {**data, "clips": [{**row, "enabled": True} for row in data["clips"]]}
            composed = CAP_ComposeClipVideos().execute(
                json.dumps(compose_data, ensure_ascii=False),
                filename_prefix=f"capricorncd-timeline/compose/{run_token}",
                trim_extends=True, use_original_audio=generate_audio, save_sidecar=True,
                prompt=records, extra_pnginfo=extra_pnginfo,
            )
            composed_video = composed["result"][0]
            preview = {**composed["ui"]["video"][0], "preview_key": f"{run_token}_final"}
            notify_timeline("cat_h3_video_ready", node_id=display_id, video=preview)
        return {"ui": {"video": [preview], "clip_videos": videos, "h3_progress": [progress("done")]},
                "result": (paths, json.dumps(data, ensure_ascii=False), composed_video)}

    def _generate_clip(self, model, base_model, clip, vae, audio_vae, data, index, width, height, low_width, low_height,
                       fps, steps, strict_keyframes, second_sampling, upscaler_model, refine_sigmas,
                       audio_refine, audio_refine_steps, normalize_audio, attention, prior_paths,
                       run_token, records, extra_pnginfo, preview_id=None, preview_tiny_vae="none", progress=None, generate_audio=True):
        if progress:
            progress("prepare")
        row = data["clips"][index]
        cid, seed = _clip_id(row), row["seed"]
        low_context = high_context = None
        if prior_paths:
            low_context, = _call("MiniMaxH3MotionContextLoadLatent", records, latent_path=prior_paths[0], clip_index=0)
            if second_sampling:
                high_context, = _call("MiniMaxH3MotionContextLoadLatent", records, latent_path=prior_paths[1], clip_index=0)
        prepared = CAP_MiniMaxH3ReferenceToVideo().execute(
            clip, vae, audio_vae, low_width, low_height, "match",
            json.dumps(data, ensure_ascii=False), index, context_latent=low_context, strict_keyframes=strict_keyframes)
        positive, latent = prepared[:2]
        frame_count, composed_prompt, trim_frames, save_latent = prepared[2], prepared[3], prepared[8], prepared[9]
        del prepared, low_context
        if preview_id is not None:
            # Replace any external KJ preview only on this Clip's sampling clone.
            model = model.clone()
            model.remove_wrappers_with_key(WrappersMP.OUTER_SAMPLE, "kj_preview_override")
            model, = CAP_ModelPreviewOverride().patch(
                model, 1024, 80, True, frame_count, max(1, min(60, round(fps))),
                tiny_vae=preview_tiny_vae, unique_id=preview_id)
            notify_timeline("cat_h3_preview_started", node_id=preview_id.split("::h3:")[0], preview_id=preview_id, clip_id=cid)
        records["h3_clip_prompt"] = {"class_type": "MiniMaxH3ImageToVideo" if strict_keyframes else "MiniMaxH3ReferenceToVideo",
                                   "inputs": {"prompt": composed_prompt, "width": low_width, "height": low_height, "length": frame_count}}
        noise, = _call("RandomNoise", records, noise_seed=seed)
        sampler, = _call("KSamplerSelect", records, sampler_name="euler")
        sigmas, = _call("BasicScheduler", records, model=base_model, scheduler="simple", steps=steps, denoise=1.0)
        guider, = _call("BasicGuider", records, model=model, conditioning=positive)
        if progress:
            progress("sample")
        sampled, denoised = _call("SamplerCustomAdvanced", records, noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=latent)
        del latent, guider
        low_result = denoised if second_sampling else sampled
        del sampled, denoised
        context_prefix = f"h3_context/cap_generator/{run_token}/{hashlib.sha256(cid.encode()).hexdigest()[:16]}"
        low_path = high_path = ""
        if save_latent:
            low_path, = _call("MiniMaxH3MotionContextSaveLatent", records, latent=low_result, filename_prefix=context_prefix + "/low", clip_index=1)
        result = low_result
        if second_sampling:
            if progress:
                progress("upscale")
            video, audio = _call("LTXVSeparateAVLatent", records, av_latent=low_result)
            del low_result, result
            video, = _call("MinimaxH3LatentUpscaler3D", records, latent=video, model_name=upscaler_model,
                          mode={"mode": "target dimensions", "width": width, "height": height},
                          align=32, enable_chunking=True, device="cuda", precision="fp16")
            latent, = _call("LTXVConcatAVLatent", records, video_latent=video, audio_latent=audio)
            del video, audio
            if strict_keyframes:
                high_prepared = CAP_MiniMaxH3ReferenceToVideo().execute(
                    clip, vae, audio_vae, width, height, "match", json.dumps(data, ensure_ascii=False), index,
                    strict_keyframes=True)
                positive = high_prepared[0]
                del high_prepared
            else:
                positive, = CAP_H3MotionContextRefine().apply(positive, vae, latent, trim_frames, high_context)
            del high_context
            guider, = _call("BasicGuider", records, model=model, conditioning=positive)
            sigmas, = _call("ManualSigmas", records, sigmas=refine_sigmas)
            if progress:
                progress("refine")
            result, denoised = _call("SamplerCustomAdvanced", records, noise=noise, guider=guider, sampler=sampler, sigmas=sigmas, latent_image=latent)
            del denoised, latent, guider
            if save_latent:
                high_path, = _call("MiniMaxH3MotionContextSaveLatent", records, latent=result, filename_prefix=context_prefix + "/high", clip_index=1)
        audio = None
        if generate_audio and audio_refine:
            if progress:
                progress("audio")
            repair_model, = _call("MiniMaxH3SigmaShift", records, model=base_model, shift_video=12.0, shift_audio=3.0)
            if attention != "keep":
                repair_model, = _call("ModelAttentionBackend", records, model=repair_model, attention=attention)
            repair_model, = _call("H3FrozenVideoCache", records, model=repair_model, enabled=True,
                                 cache_contents="hidden", backend="auto", precision="int4", refresh_interval=0,
                                 verbose=False, allow_disk=False, vram_margin_gb=1.0)
            audio_result, = _call("H3AudioRefineSampler", records, model=repair_model, positive=positive, negative=positive,
                                 latent=result, seed=seed, steps=audio_refine_steps, cfg=1.0, sampler_name="euler",
                                 scheduler="simple", audio_denoise=0.5, video_denoise=0.0)
            del repair_model
        else:
            audio_result = result
        if progress:
            progress("decode")
        if generate_audio:
            audio, = _call("VAEDecodeAudio", records, samples=audio_result, vae=audio_vae)
        del audio_result
        if generate_audio and normalize_audio:
            audio, = _call("NormalizeAudioLoudness", records, audio=audio, lufs=-14.0)
        images, = _call("VAEDecode", records, samples=result, vae=vae)
        del result
        output = row["output_video"].strip()
        if row.get("h3_timing"):
            output = timing_filename(output, row["h3_timing"])
        if progress:
            progress("save")
        saved = CAP_SeqToVideo().execute("", fps, output, images=images, audio=audio,
                                        metadata=json.dumps({"clip_id": cid, "strict_keyframes": strict_keyframes,
                                                             "generate_audio": generate_audio, "audio_refine": bool(generate_audio and audio_refine),
                                                             "normalize_audio": bool(generate_audio and normalize_audio),
                                                             "second_sampling": second_sampling, "width": width, "height": height,
                                                             "first_pass_width": low_width, "first_pass_height": low_height,
                                                             "h3_timing": row.get("h3_timing")}),
                                        save_sidecar=True, prompt=records, extra_pnginfo=extra_pnginfo, seed=seed, clip_id=cid)
        return saved, (low_path, high_path) if save_latent else None


NODE_CLASS_MAPPINGS = {"CAP_H3VideoGenerator": CAP_H3VideoGenerator}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3VideoGenerator": "MiniMax H3 Video Generator"}
