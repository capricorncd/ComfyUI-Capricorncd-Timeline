# H3 Auto Prompt Config

[README](../README.md) · [All nodes](nodes.md) · [简体中文](zh/h3-shared-prompt.md)

Connect `Timeline Editor.data_json → MiniMax H3 Video Generator.data_json` and `H3 Auto Prompt Config.auto_prompt_config → MiniMax H3 Video Generator.auto_prompt_config`. The config does not take CLIP or data_json: prompt generation runs inside the video generator, using its connected CLIP before video sampling.

Install ComfyUI-H3-Qwen3VL-TextGen and a compatible generation tail in `models/text_encoders`, then select `tail_name`, a Skill preset or custom Skill, output language, token limit and seed in the config. No separate tail-loader connection, diffusion LoRA or VAE is needed for writing text. Video generation still needs its normal model and VAEs.

Enable **Generate prompt automatically** on the intended Clips (`auto_prompt`, default false). There is no node-level enable switch. Disabled Clips keep their existing prompts. Valid preview refinement reuses the saved prompt; keyframe intervals and long video-reference runs retain their interval prompts rather than rewriting them.

The generator combines enabled prompt sections, Skills, image descriptions and visual references. `video_frame_count` defaults to `0` (automatic: up to eight frames per reference video). Set a positive number to sample that many frames evenly within each video's trim range, limited by available frames. This is uniform sampling, not scene detection; it only affects prompt inspection, not H3 video conditioning. More frames increase processing time and memory use. Audio is not transcribed; supply dialogue or lyrics explicitly. Original Clip text remains in `prompt`; generated text is held in runtime `h3_generated_prompt`. Connect the video generator's `generated_prompts` output to Show Anything to inspect the actual sampling text.

Older workflows using H3 Shared Model Prompt Generator must replace it with this config and restore the direct Timeline Editor → Video Generator connection. The bundled `MiniMaxH3_Shared_AutoPrompt.json` still contains the removed node; migrate it using the connections above.

## Clip Prompt Skills

Prompt Manager now binds a `prompt_skills` list to the current Clip: each entry has `id`, `name`, `text`, and boolean `enabled`. Presets keep their `official__…` / `community__…` IDs; custom entries receive a UUID. The saved text is a snapshot, so a library update does not silently change projects. Selecting the same preset again replaces its snapshot and enables it.

Add custom entries or import `.md`, `.txt`, and `.json` files. Export writes `{ "schema_version": 1, "prompt_skills": [...] }` including disabled entries. Import appends entries; identical IDs and content are skipped, while conflicting content receives a new ID to preserve existing edits. Delete removes only the Clip binding. Names/content, toggles and deletion participate in project save and undo.

Manual H3 prompt generation uses enabled entries in list order. Shared-model automatic generation prepends the node-level `skill`, then the enabled Clip entries. Skill binding does not enable `auto_prompt`. Old browser-global Skill text is no longer implicitly applied to every Clip; explicitly import or add it to the intended Clip.

## Final video composition

`compose_final` defaults to true. A single output is reused directly. Enable `concat_full_videos` (default false) to concatenate every complete generated video in generation order, preserving extra frames instead of applying Clip durations, H3 head/tail trims or context replacement. This also permits composition of keyframe interval outputs. The switch requires `compose_final`; draft/refine stages still skip composition. With it off, normal multi-Clip runs retain timeline trimming and interval runs remain separate. Full concatenation uses the existing video/audio normalization and may re-encode; it is not a lossless stream-copy guarantee.

## Storyboard image assets

In image asset settings, choose **宫格图（故事板图）** and panel count **Auto / 4 / 6 / 9**. Projects store `media_type: "grid_storyboard"` and `grid_panels: 0|4|6|9` on the asset. Explicit counts take precedence over `_G4/_G6/_G9` suffixes; Auto uses the suffix when present, otherwise asks the model to inspect the image. This is model interpretation, not deterministic grid detection. Character, scene and prop assets remain setting references even in a storyboard Clip. Manual and shared-model prompt generation both receive these fields; each grid remains a single image reference. No image file metadata or pixels are modified by this setting.

## Clip continuation

Clip settings now expose **衔接上一片段 / Continue previous clip** (`reference_previous`, default false). Enabling it prefers 22 context frames and automatically saves the adjacent preceding H3 clip’s latent, even when only that preceding clip is queued. At generation time use the new preceding output, its existing generated video, then its enabled video reference if latent is unavailable. The clips must be adjacent on the same track. Disabling explicitly breaks continuation. Legacy projects without the flag retain their runtime timing behavior. The unused Clip second-sampling checkbox is removed; the generator node’s separate two-stage sampling option is unchanged.

## Video frame selection

`video_frame_mode` defaults to `uniform`, preserving the frame-count setting. `manual` reads `video_frame_numbers`, e.g. `1, 25, 73`: 1-based decoded source frames relative to each reference video’s trim start, independent of project FPS. Duplicates are removed and frames are ordered chronologically; frame count is ignored. Invalid or out-of-range numbers stop with an error. The same selection applies to every reference video.

`scene` scans the trimmed video using small RGB histograms and selects the first frame plus the strongest visual changes (threshold 0.35, at least 0.5 seconds between candidates). Frame count is an upper limit, with 0 meaning 8. Static shots may produce only one frame. This is a lightweight heuristic, not semantic keyframe detection or PySceneDetect; flashes can trigger it and similar-looking cuts can be missed. It adds decoding time, with bounded candidate image storage. Manual and scene selections include frame numbers and timestamps in the model’s inspection mapping.
