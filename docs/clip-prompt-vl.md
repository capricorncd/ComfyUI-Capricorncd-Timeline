# Clip Prompt VL

[All nodes](nodes.md) · [README](../README.md)

Node ID: `CAP_ClipPromptVL`. Category: `Capricorncd/Prompt`.

A standalone local vision-language prompt writer. Select a configured local VL `model`, set `user_prompt`, `system_prompt`, optional `skill`, and `output_language`. Connect still images to `images` and decoded video frames to `video` (both IMAGE inputs). The video input uses up to eight frames; it does not accept a video filename or transcribe audio.

Connect the STRING `prompt` output to Show Anything for review or your generation workflow's text input. `max_new_tokens` defaults to 2048; `keep_model_loaded` defaults to true and trades memory retention for avoiding reloads.

The model list comes from the local language-model configuration. Scanning recognizes local Qwen3-VL / Qwen3-VL MoE model directories containing config.json under `models/prompt_generator`, `models/LLM`, or `models/llm`; configure the model through the editor's local language-model settings. The engine uses Transformers and local model/processor files.

This node loads its own local language model. To reuse the H3 video generator's CLIP instead, use [H3 Auto Prompt Config](h3-shared-prompt.md).
