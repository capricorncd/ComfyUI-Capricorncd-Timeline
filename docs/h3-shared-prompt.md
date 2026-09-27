# Shared H3 prompt generation

In Clip settings, **自动生成提示词 / Generate prompt automatically** saves the boolean `auto_prompt` (default `false`). Enabled Clips run the new prompt stage; disabled Clips retain their existing prompts.

Connect the same H3 CLIP loader to **H3 Shared Model Prompt Generator** and **H3 Video Generator**. Connect Timeline Editor `data_json` to the prompt generator, then its `data_json` to the video generator. This data connection makes prompt generation finish before video sampling starts.

The prompt generator also needs **H3 Qwen VL Generation Tail Loader** from [ComfyUI-H3-Qwen3VL-TextGen](https://github.com/ethanfel/ComfyUI-H3-Qwen3VL-TextGen). Select a compatible `generation_tail_50_63` file in `models/text_encoders`. The upstream implementation temporarily loads the missing language layers and output head, then unloads the tail while leaving the connected base CLIP available to ComfyUI. No diffusion LoRA or VAE is needed for writing text.

Enter the creative Skill in the prompt node's `skill` field. The node combines it with Clip type, enabled prompt sections, image metadata and visual references. Videos supply up to eight sampled frames from their trim range. Audio is not transcribed: supply lyrics/dialogue explicitly when needed. Grid filenames ending in `_G4`, `_G6`, or `_G9` specify the panel count.

Original Clip text stays in `prompt`. The generated final text is stored in `h3_generated_prompt` in runtime data and exposed through `generated_prompts`; it is not written over the editor draft. H3 consumes that complete prompt without appending the global sections again. Refining an existing preview skips prompt rewriting. If automatic prompting is enabled but this stage is not connected, video generation reports the missing step.

The optional node-level `enabled` switch bypasses the prompt stage. Turn off the Clip flag as well to intentionally use the original video path.

Open `workflows/MiniMaxH3_Shared_AutoPrompt.json` for a connected example. On an RTX 4090, `qwen3vl_32b_heretic_minimax_h3_nvfp4.safetensors` with `qwen3vl_32b_h3_instruct_generation_tail_50_63_int8_convrot.safetensors` passed text generation followed by finite H3 conditioning on the same CLIP. The NVFP4 AWQ generation tail produced non-finite values in this configuration; use the INT8 tail. Full video sampling and visual-reference generation have not been verified by this smoke test.

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
