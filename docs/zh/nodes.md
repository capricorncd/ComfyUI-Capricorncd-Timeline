# 全部节点与连接关系

[返回主页](../../README.zh.md) · [English](../nodes.md)

以下列出当前注册的全部 **39 个节点**，按添加节点菜单的实际层级排列。名称随语言设置变化，节点 ID 可用于准确搜索或核对工作流。

## 菜单层级

```text
Capricorncd
├── Timeline Editor
├── Timeline
├── MiniMaxH3
│   └── Internal
├── Video
├── Image
├── Prompt
└── Utils
```

首页主流程只需 **Timeline Editor.data_json → MiniMax H3 Video Generator.data_json**，并为生成器接好模型、CLIP 与两个 VAE。配置节点接生成器同名配置输入；Internal 是连续采样器自动展开使用的辅助层，不是额外必接节点。

## Capricorncd

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Timeline Editor**<br>`CAP_TimelineEditor` | 主编辑器，输出运行用 data_json。 | [→](timeline-editor.md) |

## Capricorncd/Timeline

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Data Json Clip Parser**<br>`CAP_DataJsonClipParser` | 提取单个 Clip，驱动自定义模型流程。 | [→](data-json-clip-parser.md) |
| **Generate Timeline Preview**<br>`CAP_TimelinePreview` | 生成内存中的 H3 Clip 预览。 | [→](timeline-editor.md#ai-优化提示词) |

## Capricorncd/MiniMaxH3

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **H3 Audio Refine Config**<br>`CAP_H3AudioRefineConfig` | 配置 → audio_refine_config。 | [→](h3-audio-refine.md#h3-audio-refine-config) |
| **H3 Face Refine Config**<br>`CAP_H3FaceRefineConfig` | 配置 → face_refine_config。 | [→](h3-face-refine.md) |
| **H3 加速音频修复**<br>`CAP_H3FastAudioRefineSampler` | 可配置采样器的音频 latent 修复。 | [→](h3-audio-refine.md#h3-加速音频修复) |
| **音频修复（加速）**<br>`CAP_H3FastAudioRepair` | 包含注意力、shift 与缓存配置的音频修复。 | [→](h3-audio-refine.md#音频修复加速) |
| **H3 Interpolation Config**<br>`CAP_H3InterpolationConfig` | RIFE 配置 → interpolation_config。 | [→](h3-video-generator.md#rife-插帧) |
| **H3 Auto Prompt Config**<br>`CAP_H3AutoPromptConfig` | 配置 → auto_prompt_config。 | [→](h3-shared-prompt.md) |
| **H3 SelfLift Config**<br>`CAP_H3SelfLiftConfig` | 渐进采样配置 → selflift_config。 | [→](h3-video-generator.md#selflift-渐进采样实验) |
| **Timeline Sequence Sampler**<br>`CAP_H3TimelineSequenceSampler` | 自定义连续采样 → 图像帧和音频。 | [→](h3-sequence.md#timeline-sequence-sampler) |
| **MiniMax H3 Video Generator**<br>`CAP_H3VideoGenerator` | 时间轴 → 采样、保存及可选拼接视频。 | [→](h3-video-generator.md) |
| **H3 Motion Context (Refine)**<br>`CAP_H3MotionContextRefine` | 高清续接条件。 | [→](h3-motion-context.md#h3-motion-context-refine) |
| **MiniMaxH3**<br>`CAP_MiniMaxH3ReferenceToVideo` | 单个 Clip → 条件与音视频 latent。 | [→](minimax-h3.md) |
| **H3 Motion Context Load Latent (Optional)**<br>`CAP_H3MotionContextLoadLatentOptional` | 按开关加载前段 Context。 | [→](h3-motion-context.md#h3-motion-context-load-latent-optional) |
| **H3 Motion Context Save Latent (Optional)**<br>`CAP_H3MotionContextSaveLatentOptional` | 按开关保存采样 Context。 | [→](h3-motion-context.md#h3-motion-context-save-latent-optional) |

## Capricorncd/MiniMaxH3/Internal

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **H3 Sequence Continuation**<br>`CAP_H3SequenceContinuation` | 前段音视频 latent → 后段采样 Context。 | [→](h3-sequence.md#h3-sequence-continuation) |
| **H3 Sequence Trim Video**<br>`CAP_H3SequenceTrimVideo` | 裁剪解码帧的 Context 前缀。 | [→](h3-sequence.md#h3-sequence-trim-video) |
| **H3 Sequence Audio Join**<br>`CAP_H3SequenceAudioJoin` | 拼接音频，可对重叠区交叉淡化。 | [→](h3-sequence.md#h3-sequence-audio-join) |
| **CAP_H3SequenceTrimAudio**<br>`CAP_H3SequenceTrimAudio` | 按 H3 帧时序裁剪解码音频。 | [→](h3-sequence.md#h3-sequence-trim-audio) |

## Capricorncd/Video

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Compose Clip Videos**<br>`CAP_ComposeClipVideos` | data_json 中的 Clip 视频路径 → 拼接视频。 | [→](compose-clip-videos.md) |
| **Cap Model Preview Override**<br>`CAP_ModelPreviewOverride` | 自定义采样流程的 KJNodes 预览适配。 | [→](model-preview-override.md) |
| **Seq To Video**<br>`CAP_SeqToVideo` | 图像或帧目录 + 音频 → MP4。 | [→](seq-to-video.md) |

## Capricorncd/Image

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Image Batch Count**<br>`CAP_ImageBatchCount` | 统计图像批次数量。 | [→](image-batch.md) |
| **Image From Batch Index**<br>`CAP_ImageFromBatchIndex` | 按索引选取单张图像。 | [→](image-batch.md) |
| **加载图像（提示词 / 描述） · Cap**<br>`CAP_LoadImageMetadata` | 读取图片、遮罩、嵌入提示词与描述。 | [→](load_image_metadata.md) |
| **Load Images From Dir**<br>`CAP_LoadImagesFromDir` | 目录 → 图像批次。 | [→](load-images-from-dir.md) |
| **Save Images**<br>`CAP_SaveImages` | 保存图像批次及可选 JSON 记录。 | [→](save-images.md) |

## Capricorncd/Prompt

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Clip Prompt VL**<br>`CAP_ClipPromptVL` | 本地 VL 模型 + 图像/视频帧 → 提示词。 | [→](clip-prompt-vl.md) |
| **Prompt Group**<br>`CAP_PromptGroup` | 全局、场景和负面提示词。 | [→](prompt-group.md) |
| **Prompt From Batch**<br>`CAP_PromptFromBatch` | 提取场景提示词并合并全局文本。 | [→](prompt-from-batch.md) |
| **Rich Prompt Input**<br>`CAP_RichPromptInput` | 带历史与预设的提示词编辑。 | [→](prompt-input.md) |

## Capricorncd/Utils

| 节点 / 节点 ID | 用途与连接 | 文档 |
|---|---|---|
| **Clear Directory**<br>`CAP_ClearDirectory` | 清理目录中的指定类型媒体。 | [→](clear-directory.md) |
| **Format JSON**<br>`CAP_FormatJson` | 格式化并显示 JSON。 | [→](format-json.md) |
| **Size Settings**<br>`CAP_SizeSettings` | 宽高、数量和帧率设置。 | [→](size-settings.md) |
| **Size From Megapixels**<br>`CAP_SizeFromMegapixels` | 目标百万像素 → 对齐后的宽高。 | [→](size-settings.md#按百万像素计算尺寸) |
| **工作流完成后强制关机 (Windows)**<br>`CAP_WindowsShutdown` | 成功完成且队列为空后请求关机。 | [→](windows-shutdown.md) |
| **Show Anything**<br>`CAP_ShowAnything` | 查看任意值及生成提示词。 | [→](show-anything.md) |
| **Join Strings**<br>`CAP_JoinStrings` | 拼接可变数量的文本或数值。 | [→](join-strings.md) |

## 自定义工作流的连接

| 路径 | 连接顺序 |
|---|---|
| 自定义模型 | Timeline Editor → Data Json Clip Parser（选择 index）→ 模型条件/采样/解码 → Seq To Video |
| 自定义 H3 采样 | Timeline Editor.data_json → MiniMaxH3 → guider/采样器 → 音视频解码 → Seq To Video |
| 连续采样 | Timeline Editor.data_json → Timeline Sequence Sampler → images/audio → Seq To Video |
| 已生成视频拼接 | 含 output_video 的 data_json → Compose Clip Videos |
| 完整时间轴导出 | 编辑器 → 导出 → 合成视频，渲染背景音乐、字幕与媒体轨 |

上述自定义路径是可选替代流程，无需串在核心 H3 视频生成节点后。生成器的 `video_files` 是文件路径列表，不是 IMAGE 或 VIDEO，不能接 Seq To Video.images。
