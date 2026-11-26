# MiniMax H3 Video Generator

Maximum segment duration defaults to 15 seconds and is editable on the node. Longer video-reference Clips and keyframe intervals use latent continuation, with each segment associated at its original position. This setting is independent of second sampling.

`ref_image_size` defaults to `match`, downsizing reference images to each sampling pass's pixel area. Select `max` to retain more reference detail, downscaling only when the short edge exceeds 2048 pixels, at higher memory/time cost. Small images are not upscaled. Applies to reference images in preview, normal and refinement runs; first/last frame anchors retain their canvas sizing.

[README](../README.md) · [All nodes](nodes.md)

Node ID: `CAP_H3VideoGenerator`. Category: `Capricorncd/MiniMaxH3`.

## Basic connections

Connect **Timeline Editor `data_json` → this node's `data_json`**, plus H3 `model`, `clip`, video `vae` and `audio_vae`. Run the requested Clips from the timeline. Project width and height must be positive multiples of 32; select model/LoRA weights compatible with the Clip type and 4/8-step setting.

The node prepares conditioning, samples, decodes and saves videos; no separate Clip Parser or Seq To Video is needed. See below for dependencies of two-pass sampling, preview and optional features; disable unused options to avoid those dependencies.

| Output | Use |
|---|---|
| `video_files` | List of saved Clip paths, not IMAGE/VIDEO objects. |
| `data_json` | Updated video paths and timing; can feed Compose Clip Videos. |
| `composed_video` | Final composition path when enabled; a single video is reused. |
| `generated_prompts` | Actual sampling prompts; connect to Show Anything. |

`compose_final` defaults to on and joins this run's generated videos. Use the editor's Export → Compose Video for the complete music, subtitle and media tracks. `concat_full_videos` keeps the full output lengths instead of trimming to Clip timing. There is no need to add another Compose Clip Videos when automatic composition is enabled.

Connect [H3 Auto Prompt Config](h3-shared-prompt.md) to `auto_prompt_config`. Other optional configs feed `audio_refine_config`, `face_refine_config`, and `interpolation_config`.

## HyperFlow H3 Flash

Install [ComfyUI-HyperFlow-Flash](https://github.com/Video-Rebirth/ComfyUI-HyperFlow-Flash) (1.1.0+) and load its ComfyUI INT8 safetensors with **HyperFlow Loader**. GGUF additionally requires ComfyUI-GGUF. Connect its `MODEL` to this generator, reuse the H3 CLIP/video VAE/audio VAE, and connect **H3 HyperFlow Config → sampling_config**. Choose FL2VA for text/endpoint generation or Ref2VA for reference images. Do not use a stock UNET loader or assume existing H3 acceleration/style LoRAs are compatible.

The config selects 4/6/8 steps (default 6), overriding this generator's `steps` and `refine_sigmas`. Euler, CFG 1 and video/audio shifts 12/3 are retained. For the first trial, disable `second_sampling`, audio repair and face repair. Start with a 5.2-second Clip at 24 fps. ComfyUI reference generation in the upstream Flash integration currently supports images; video/audio reference behavior has not been validated here.

Second sampling and preview refinement use the selected upstream schedule starting at `refine_start_step` (zero-based, default 2, must be less than steps). Face repair uses a tail containing `ceil(steps * denoise)` steps. These refinement paths are experimental; CPU contracts do not establish visual quality. Audio repair uses its existing ordinary-H3 sampler and therefore requires an explicitly connected standard H3 `base_model`. Disconnect/disable the config to restore the original H3 behavior.

Sampling schedules live in `backend/h3_sampling.py`; the generator retains conditioning, continuation, saving and composition. Future H3-compatible sampling strategies implement that interface and supply a dedicated config through `CAP_H3_SAMPLING_CONFIG`. Video metadata records the resolved strategy. Model loading remains external. Changes to latent formats or conditioning still require their owning integration, not just another schedule.

Validation: ordinary generation regression tests and upstream CPU schedule checks. GPU output, memory use and short/long visual comparison remain pending model weights.

## RIFE frame interpolation

Connect **H3 Interpolation Config** to `interpolation_config`, then use the enable switch on the config node (disconnect or disable to skip interpolation) to run the installed ComfyUI-Frame-Interpolation RIFE node after face repair and context latent saving. Model, multiplier, scale, ensemble and cache interval live on the config node. Defaults: rife426.pth, 2x, scale 1.0, ensemble off, cache interval 10. Supports integer 2–4x; the plugin may download the selected model on first use. RIFE 4.26 ignores ensemble. Output fps and timing snapshots are multiplied, including composition and returned data_json. Hold the final frame to preserve exact duration and original audio. Sampling and latent contexts retain the original frame rate. Disabled interpolation ignores its parameters.


Category: `Capricorncd/MiniMaxH3`. A compact wrapper around existing nodes, not another model implementation.

Optional **face_refine** defaults to off. Connect [H3 Face Refine Config](h3-face-refine.md) to configure the detector and repair strength. It uses Carasibana's installed H3-FaceRefine nodes after video decoding, with existing detectors in `models/ultralytics/bbox`.

## Digital Human

Choose **Digital Human** as the Clip type, add a character reference, and place driving audio on the corresponding audio track. The generator uses the timeline offsets and trims, encodes the audio into the target latent, and locks it during both sampling passes. Output uses the source track instead of regenerated vocals. No additional audio-lock node is required.

A default performance instruction requests lip-sync only during audible vocals and closed lips during pauses or instrumental passages. Digital Human clips skip audio repair and face refinement to protect lip timing; other clip types still follow these switches. Turning off **Generate audio** silences the output but keeps audio-driven generation. Audio normalization still changes output loudness when enabled.

Missing readable driving audio raises an error. Short tracks are padded with silence, never looped or stretched. Context prefixes receive leading silence to keep the current clip aligned. For songs, use an isolated vocal stem with all original instrumental pauses preserved, then restore the full mix in the editor. This node does not separate vocals automatically or guarantee perfect lip synchronization.


## Generation

Connect the **sampling MODEL after external LoRA loading**, CLIP text encoder, video VAE, audio VAE and Timeline Editor's runtime `data_json`. LoRA name/strength controls have been removed from this node; select the matching acceleration LoRA in an external loader. Changing 4/8 steps does not change that LoRA. `base_model` is optional, including during audio repair: when connected it supplies audio repair and the base schedule; when omitted both reuse the incoming sampling model with its LoRAs preserved. Sigma shifts remain 12 (video) / 3 (audio), Euler, simple schedule and CFG 1. For old saved workflows, use the updated compact example or recreate/reconnect this node; do not reuse the old positional widget values.

- One pass: full selected 4/8-step schedule at the project's `data_json` width/height (multiples of 32). `first_pass_megapixels` is ignored.
- Clip output paths come exclusively from each runtime `data_json.clips[].output_video`; the fallback prefix control has been removed. Missing/blank paths fail validation before any Clip is sampled. H3 context filename markers are still applied. Final composition retains its separate `output/capricorncd-timeline/compose/` destination.
- Two passes: run the full selected 4/8-step first schedule at `first_pass_megapixels`, upscale the denoised latent to project dimensions, then run `refine_sigmas`. The partial first-pass control has been removed. Refine has its own schedule, independent of the 4/8 selector. Final dimensions still come from `data_json`.
- Clip seed -1 is resolved once; video passes and optional audio repair share the resolved seed. Video metadata records Clip ID, seed, models and sampling parameters.
- Each Clip is decoded and saved before the next is processed. Only file paths are accumulated, not a whole timeline's image tensors. This does not guarantee that one long/high-resolution Clip will fit VRAM.
- With this node downstream, the editor's Run All submits the full Clip batch in one task. Clips are generated and associated individually inside the node; final composition runs once, after all `data_json.clips` finish. Selected/left/right multi-Clip runs also submit one batch containing only the requested Clips. Legacy per-Clip workflows keep their existing queue behavior.
- Every saved Clip immediately replaces the node's bottom preview and plays in a loop. Click the video to pause/resume; hover enables sound, leaving mutes it. The next completed Clip starts automatically. Completing the node does not reset a paused preview of the same video.
- Above the preview, `Clip current / total · percent% · stage` reports overall stage progress, including preparation, sampling, optional upscale/refine/audio repair, decoding, saving and optional final composition. Percentages count completed stages, not elapsed time or sampler steps. Works with sampling preview disabled; 100% appears only after all requested output work succeeds.
- `compose_final` defaults to true: after generation, reuse Compose Clip Videos to apply context replacement and head/tail trimming, join the requested generated videos with their original audio, and play the result. Files are saved under `output/capricorncd-timeline/compose/`; the new scalar `composed_video` output contains the output-relative path. Off leaves this output empty and the last Clip visible. This joins generated clips only; use the editor's composition dialog to render subtitle/media/BGM tracks.
- Connected clips run together using low/high context matched by `previous_source_clip_id`, saved under `output/h3_context/cap_generator/<run>/`. A single continuation clip uses the predecessor's newest enabled linked video: the requested tail frames and matching audio become context, re-encoded at target resolution for a second pass. When neither preceding context nor video is available, generation continues independently with recalculated trims and a persistent node warning. Unrelated directory files are never selected.
- Raw videos retain context and padding. The returned scalar `data_json` preserves timing and updates filenames/playback spans; connect it to Compose Clip Videos. `video_files` is a ComfyUI STRING list of output-relative filenames, not a tensor or VIDEO object.

## MV and audio switches

- `generate_audio=true` (default) preserves existing audio output. Off produces silent Clip and composed videos, skipping audio repair sampling, audio VAE decoding and loudness normalization.
- Audio repair is controlled by `audio_refine_config`; disconnect or disable the config to skip it. Repair only runs when `generate_audio` is on.
- The current H3 core still jointly samples video/audio latents. This switch does not remove the audio latent, rewrite sound prompts or discard audio references; it cannot eliminate all audio-side sampling cost. AV latents remain intact for second sampling and Save Latent continuity. Keep the audio VAE connected for reference conditioning.
- Silent mode does not require audio-repair or normalization dependencies. Preview and composition still work; progress omits skipped audio repair stages.

## Strict first/last frames

The generator selects conditioning per Clip from `clip_role`; there is no node-level `strict_keyframes` switch. Roles other than `first_last` use multimodal reference generation, including text-only, images, video and audio. Supplying an FL model does **not** change references into endpoint constraints.

`clip_role=first_last`: native `MiniMaxH3ImageToVideo` handles pure endpoint inputs. One enabled image defaults to the first frame; two default to first/last in order. An explicitly designated last frame also supports last-frame-only generation.

### First/last frames with character and prop references

Put only the frame anchors in the Clip media list and designate the last frame. Keep character/prop images in the media library and select them via `@asset name` in the prompt. Describe their identity/appearance and the desired ending composition. For a last-frame-only shot, keep only the ending image as Clip media; additional prompt references do not become a first frame.

Mixed mode uses `MiniMaxH3ReferenceToVideo` with `MiniMaxH3AddGuide` at frame 0 and/or -1. All images receive `<Picture N>` labels in actual load order; only the anchors receive temporal constraints. Two-pass generation rebuilds these conditions at the final resolution. Pure endpoint mode retains its existing first/last-subject mention labels.

At most two anchors and nine images total are supported. Missing enabled anchors, video/audio references and Motion Context are rejected. Use a compatible model/LoRA; constraints do not guarantee pixel-identical endpoints or reference fidelity. Routing is covered by automated tests; mixed-mode GPU output quality has not been validated. Rerun Timeline Editor in old workflows to populate `anchor_image_ids` in runtime data. See the [Chinese usage example](zh/h3-video-generator.md).


The existing **Cap MiniMaxH3** conditioning node also exposes the same optional toggle, default off; old connections and outputs remain unchanged.

## Optional dependencies

- Second pass: `Comfyui_Minimax_h3_latent_Upscaler`, with its model in `models/latent_upscale_models` (current chunking-enabled interface).
- Save Latent / Motion Context: `ComfyUI-H3-Motion-Context`.
- Audio repair: `ComfyUI-H3-AudioRefine`, frozen-video int4 cache + audio-only pass (default 3 steps, denoise 0.5). This may increase RAM/VRAM usage; disable for lower-memory generation.
- Sampling preview is built in and enabled by default (`sampling_preview`); requires KJNodes, without modifying it. It uses the incoming LoRA-patched sampling model; no external preview override or frame-count wire is needed. Each Clip uses its actual prepared frame count, including H3 context/padding, for both video passes. The bottom player switches from sampling animation to the saved video. Late preview frames cannot replace a completed video or a newer Clip. Audio-only repair does not run the internal video preview.
- `preview_tiny_vae`: choose an installed `taeh3.safetensors` in `models/vae_approx` for H3 RGB previews. `none` uses approximate latent colors. Sampling previews are approximate; the completed video uses the full video VAE. Turn off `sampling_preview` to run without KJNodes.

No dependencies are downloaded automatically. Restart ComfyUI and refresh its frontend after installation. CPU/mock contract tests do not replace a GPU generation test.


## Audio repair configuration


This release targets **ComfyUI 0.37.0**. Update ComfyUI to **0.37.0 or newer** and install its matching `requirements.txt` dependencies before use. Also update this node pack and [ComfyUI-H3-AudioRefine](https://github.com/Adudeguyman/ComfyUI-H3-AudioRefine) (at least **1.0.4**, which includes the compiler compatibility fix). Restart ComfyUI and refresh the browser.

Connect `H3 Audio Refine Config` to the generator's `audio_refine_config`. It controls enabled, steps, audio denoise strength and cache mode (`off`/`auto`/`ram`/`vram`). Cache defaults to off while audio repair remains enabled. A disconnected or disabled configuration skips repair. Move the old audio repair settings to this node in existing workflows. Silent generation and Digital Human clips still skip repair; loudness normalization stays on the generator.

## Preview sampling management

Select a director Clip and open Preview sampling management, or choose Batch preview sampling from the run menu. The generator defaults to 0.2 megapixels and one candidate. Each candidate saves its video, AV latent, prompt and input snapshot; preview sampling skips upscale/refine, repair, interpolation and final composition.

Run reuses the latest enabled compatible preview for each Clip and refines its saved latent; Clips without a valid preview generate normally. Changing duration or project fps requires new candidates. Keyframe previews retain their interval metadata, and the manager follows the selected director Clip.

Deleting a version moves its video, latent and manifest to the Windows recycle bin and cannot be undone with Ctrl+Z. Restore all files manually, then use Associate existing folder. Other platforms reject recycling without permanently deleting files. Project packages do not bundle these latents; retain output/capricorncd-timeline/h3_drafts/ separately when moving machines.

## Chain all clips

`chain_all_clips` defaults to false. When enabled, all clips in this execution are chained in execution order, overriding per-Clip continuation switches across tracks and gaps. The first clip starts independently; preceding clips save latents for their successors. Project switches and timeline positions remain unchanged. Selected keyframe intervals are also chained in execution order.

When disabled, Clip settings apply. Normal generation with chaining does not reuse old previews; explicit refinement retains its saved preview context. First/last-frame Motion Context restrictions still apply.

This continues both picture and sound, without guaranteeing identical BGM. It is not audio-only continuation; use an independent audio track for unchanged music across cuts. Loudness normalization has been removed; generated volume is preserved. Old normalization settings never enable chaining.
