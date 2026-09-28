# H3 自动提示词配置

[返回主页](../../README.zh.md) · [全部节点](nodes.md) · [English](../h3-shared-prompt.md)

连接 `Timeline Editor.data_json → MiniMax H3 Video Generator.data_json`，再连接 `H3 Auto Prompt Config.auto_prompt_config → MiniMax H3 Video Generator.auto_prompt_config`。配置节点不接 CLIP 或 data_json；生成器使用自身连接的 CLIP，先生成提示词，再采样视频。

安装 ComfyUI-H3-Qwen3VL-TextGen，将兼容的 generation tail 放入 `models/text_encoders`，在配置中选择 `tail_name`、Skill 预设或自定义 Skill、输出语言、文本长度和种子。无需单独连接 tail 加载节点；写提示词不需要扩散 LoRA 或 VAE，视频生成仍需正常连接模型与两个 VAE。

在目标 Clip 设置中开启“自动生成提示词”（`auto_prompt` 默认 false）。配置节点没有总启用开关；未开启的 Clip 沿用原提示词。有效预览精修复用保存的提示词；关键帧区间和长视频参考分段保留区间提示词，不重新改写。

素材图片及嵌入的设定描述、已启用的提示词片段和 Skill 一起参与编写。视频最多抽取八帧，音频不做转写，需要的对白或歌词请写入提示词。原 Clip 文本保留在 `prompt`，新文本放在运行数据的 `h3_generated_prompt`；生成器的 `generated_prompts` 可连接 Show Anything 查看实际采样提示词。

## Prompt Skill 与 Clip 绑定

提示词管理中的 Skill 列表属于当前 Clip，支持启用、禁用、删除、导入和导出；选择预设会保存文本快照。节点级 Skill 与 Clip 中启用的 Skill 一起使用，绑定 Skill 不会自动开启提示词生成。公共选择器还支持添加本地自定义 Skill 及可选预览，供 Clip 和配置节点选择；删除 Clip 绑定不会删除库文件。

## 旧工作流迁移

旧的 H3 Shared Model Prompt Generator 已替换为 H3 Auto Prompt Config。移除旧节点，恢复时间轴到视频生成器的直接 data_json 连线，再连接配置输出。现有 `MiniMaxH3_Shared_AutoPrompt.json` 示例仍含旧节点，应按上述接线迁移。
