# Clip Prompt VL

[全部节点](nodes.md) · [返回主页](../../README.zh.md)

节点 ID：`CAP_ClipPromptVL`。分类：`Capricorncd/Prompt`。

独立的本地视觉语言提示词节点。选择已配置的本地 VL `model`，填写 `user_prompt`、`system_prompt`、可选 `skill` 与 `output_language`。静态图片接 `images`，已解码视频帧接 `video`，两者都是 IMAGE 输入。视频最多使用八帧，不接视频路径，也不转写音频。

输出 STRING `prompt` 可接 Show Anything 检查，或接生成流程的文本输入。`max_new_tokens` 默认 2048；`keep_model_loaded` 默认 true，保留模型可减少重新加载，同时占用内存/显存。

模型列表来自本地语言模型配置。扫描识别 `models/prompt_generator`、`models/LLM`、`models/llm` 下带 config.json 的 Qwen3-VL / Qwen3-VL MoE 模型目录；通过编辑器本地语言模型设置配置。引擎使用 Transformers 与本地模型、processor 文件。

本节点加载自己的语言模型；需要共用 H3 视频生成器的 CLIP 时，使用 [H3 自动提示词配置](h3-shared-prompt.md)。
