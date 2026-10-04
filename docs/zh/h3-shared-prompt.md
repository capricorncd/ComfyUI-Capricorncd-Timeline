# H3 自动提示词配置

[返回主页](../../README.zh.md) · [全部节点](nodes.md) · [English](../h3-shared-prompt.md)

连接 `Timeline Editor.data_json → MiniMax H3 Video Generator.data_json`，再连接 `H3 Auto Prompt Config.auto_prompt_config → MiniMax H3 Video Generator.auto_prompt_config`。配置节点不接 CLIP 或 data_json；生成器使用自身连接的 CLIP，先生成提示词，再采样视频。

安装 ComfyUI-H3-Qwen3VL-TextGen，将兼容的 generation tail 放入 `models/text_encoders`，在配置中选择 `tail_name`、Skill 预设或自定义 Skill、输出语言、文本长度和种子。无需单独连接 tail 加载节点；写提示词不需要扩散 LoRA 或 VAE，视频生成仍需正常连接模型与两个 VAE。

在目标 Clip 设置中开启“自动生成提示词”（`auto_prompt` 默认 false）。配置节点没有总启用开关；未开启的 Clip 沿用原提示词。有效预览精修复用保存的提示词；关键帧区间和长视频参考分段保留区间提示词，不重新改写。

素材图片及嵌入的设定描述、已启用的提示词片段和 Skill 一起参与编写。“视频抽帧数（0 自动）”默认 `0`，每个参考视频最多抽取八帧；填正整数则在各素材裁剪区间内均匀抽取指定数量，不超过可用帧数。这是均匀采样，不是镜头识别；仅影响自动提示词看视频，不改变 H3 的视频参考输入。更多帧会增加耗时和显存占用。音频不做转写，需要的对白或歌词请写入提示词。原 Clip 文本保留在 `prompt`，新文本放在运行数据的 `h3_generated_prompt`；生成器的 `generated_prompts` 可连接 Show Anything 查看实际采样提示词。

## Prompt Skill 与 Clip 绑定

提示词管理中的 Skill 列表属于当前 Clip，支持启用、禁用、删除、导入和导出；选择预设会保存文本快照。节点级 Skill 与 Clip 中启用的 Skill 一起使用，绑定 Skill 不会自动开启提示词生成。公共选择器还支持添加本地自定义 Skill 及可选预览，供 Clip 和配置节点选择；删除 Clip 绑定不会删除库文件。

## 旧工作流迁移

旧的 H3 Shared Model Prompt Generator 已替换为 H3 Auto Prompt Config。移除旧节点，恢复时间轴到视频生成器的直接 data_json 连线，再连接配置输出。现有 `MiniMaxH3_Shared_AutoPrompt.json` 示例仍含旧节点，应按上述接线迁移。

## 视频选帧方式

`video_frame_mode` 默认 `uniform`，保留原来的均匀抽帧数量设置。选 `manual` 后，在“指定帧号”填写 `1, 25, 73`：以每个参考视频裁剪后的第一帧为 1，按源视频解码帧编号，与工程帧率无关。自动去重、按时间排序，忽略抽帧数量。格式错误或超出裁剪范围会报错。同一设置应用于各参考视频。

`scene` 扫描裁剪区间，用小尺寸 RGB 直方图选择首帧及画面变化最明显的帧（阈值 0.35，候选间隔至少 0.5 秒）。抽帧数量是上限，0 表示最多 8 帧；静态镜头可能只选 1 帧。这是轻量启发式检测，不是语义关键帧识别，也没有使用 PySceneDetect；闪光可能误触发，相似画面的切镜可能漏检。会增加解码时间，内存只保留有限数量的候选图。指定帧号和自动关键帧会把帧号、时间一起传给模型。
