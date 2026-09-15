# MiniMax H3 Video Generator

Category: `Capricorncd/MiniMaxH3`. A compact wrapper around existing nodes, not another model implementation.

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
- Connected Save Latent clips must run together, in timeline order. Low/high context files are matched by `previous_source_clip_id`, not the newest directory file, and saved under `output/h3_context/cap_generator/<run>/`. Missing predecessors fail rather than use an unrelated context. A partial run is not a resume mechanism.
- Raw videos retain context and padding. The returned scalar `data_json` preserves timing and updates filenames/playback spans; connect it to Compose Clip Videos. `video_files` is a ComfyUI STRING list of output-relative filenames, not a tensor or VIDEO object.

## MV and audio switches

- `generate_audio=true` (default) preserves existing audio output. Off produces silent Clip and composed videos, skipping audio repair sampling, audio VAE decoding and loudness normalization.
- `audio_refine=false` by default. It only takes effect when `generate_audio` is on; MV users can turn off audio generation without also resetting the repair/normalization switches.
- The current H3 core still jointly samples video/audio latents. This switch does not remove the audio latent, rewrite sound prompts or discard audio references; it cannot eliminate all audio-side sampling cost. AV latents remain intact for second sampling and Save Latent continuity. Keep the audio VAE connected for reference conditioning.
- Silent mode does not require audio-repair or normalization dependencies. Preview and composition still work; progress omits skipped audio repair stages.

## Strict first/last frames

`strict_keyframes=false` (default): existing multimodal reference generation, including text-only, images, video and audio. Supplying an FL model does **not** change references into endpoint constraints.

`true`: use native `MiniMaxH3ImageToVideo` keyframe conditioning. One enabled image supplies the first frame; two supply first and last in reference order. Rejects empty/more-than-two images, video/audio references and Motion Context. Select a compatible FL model and LoRA yourself. This is model conditioning, not a pixel-exact replacement of rendered endpoint frames. Two-pass strict mode re-encodes anchors at the final resolution.

The existing **Cap MiniMaxH3** conditioning node also exposes the same optional toggle, default off; old connections and outputs remain unchanged.

## Optional dependencies

- Second pass: `Comfyui_Minimax_h3_latent_Upscaler`, with its model in `models/latent_upscale_models` (current chunking-enabled interface).
- Save Latent / Motion Context: `ComfyUI-H3-Motion-Context`.
- Audio repair: `ComfyUI-H3-AudioRefine`, frozen-video int4 cache + audio-only pass (default 3 steps, denoise 0.5). This may increase RAM/VRAM usage; disable for lower-memory generation.
- -14 LUFS normalization: `ComfyUI-WanVideoWrapper` / `NormalizeAudioLoudness`.
- Sampling preview is built in and enabled by default (`sampling_preview`); requires KJNodes, without modifying it. It uses the incoming LoRA-patched sampling model; no external preview override or frame-count wire is needed. Each Clip uses its actual prepared frame count, including H3 context/padding, for both video passes. The bottom player switches from sampling animation to the saved video. Late preview frames cannot replace a completed video or a newer Clip. Audio-only repair does not run the internal video preview.
- `preview_tiny_vae`: choose an installed `taeh3.safetensors` in `models/vae_approx` for H3 RGB previews. `none` uses approximate latent colors. Sampling previews are approximate; the completed video uses the full video VAE. Turn off `sampling_preview` to run without KJNodes.

No dependencies are downloaded automatically. Restart ComfyUI and refresh its frontend after installation. CPU/mock contract tests do not replace a GPU generation test.
