# 节点文档索引

[返回主页](../../README.zh.md) · [时间轴编辑器指南](timeline-editor.md)

## 添加节点菜单分类

所有节点统一位于 `Capricorncd` 下。分类仅改变菜单位置，不改变节点 ID、名称、输入输出，已有工作流无需重新连线。更新后重启 ComfyUI 并刷新页面。

| 分类 | 内容 |
|------|------|
| `Capricorncd`（一级菜单） | 时间轴编辑器，作为主要入口直接显示 |
| `Timeline`（时间轴） | 片段数据解析、生成时间轴预览 |
| `MiniMaxH3` | H3 参考条件、Motion Context 二采、可选 Latent 保存/加载、连续片段采样、音频修复 |
| `Video`（视频） | 序列帧合成视频、多段视频合成、Cap 模型预览覆盖 |
| `Image`（图像） | 图像加载、元数据、保存与批次操作 |
| `Prompt`（提示词） | 富文本提示词、提示词组、批次提示词提取、Clip Prompt VL |
| `Utils`（工具） | 尺寸设置、百万像素尺寸计算、JSON 格式化、Show Anything、字符串拼接、清理目录、Windows 关机 |

连续采样自动展开使用的续接、视频/音频裁剪、音频拼接辅助节点放在 `MiniMaxH3/Internal`，一般直接使用上层连续采样节点即可。

## 节点说明

| 节点 | 说明 | 文档 |
|------|------|------|
| **Cap Model Preview Override** | 支持循环与子图的采样预览封装，依赖原版 KJNodes | [→](model-preview-override.md) |
| **Timeline Editor** | 全屏多轨编辑器；生成视频预览/禁音；导出 → 合成视频；`swap_wh`；输出 `data_json` 与 `frame_seq_dir` | [→](timeline-editor.md) |
| **Rich Prompt Input** | 带实时语法高亮、`#` 注释与历史/预设的提示词编辑器 | [→](prompt-input.md) |
| **Prompt Group** | 全局 / 场景 / 负面提示词输入；统计场景提示词有效条数 | [→](prompt-group.md) |
| **Prompt From Batch** | 按索引/长度截取场景提示词；可选合并全局提示词 | [→](prompt-from-batch.md) |
| **Data Json Clip Parser** | 从 Timeline Editor 的 `data_json` 中提取单个片段 | [→](data-json-clip-parser.md) |
| **Generate Timeline Preview** | 工程与 Clip ID → 内存中的 MiniMax H3 预览，内置采样及音视频解码 | [→](timeline-editor.md#ai-优化提示词) |
| **MiniMaxH3** | 时间轴 `data_json` 片段 → MiniMax H3 Reference to Video（参考 + 提示词 + latent） | [→](minimax-h3.md) |
| **Save Images** | 将一批图像保存到指定目录；可选写入 `{prefix}.json` 记录提示词与模型 | [→](save-images.md) |
| **Load Images From Dir** | 从目录加载图像为 `IMAGE` 批次 | [→](load-images-from-dir.md) |
| **Image Batch Count** | 返回批次中的图像数量 | [→](image-batch.md) |
| **Image From Batch Index** | 按索引从批次中提取单张图像 | [→](image-batch.md) |
| **Seq To Video** | 通过 ffmpeg 将图像序列和音频合成为 MP4；默认写入同名 JSON 记录提示词与模型 | [→](seq-to-video.md) |
| **Compose Clip Videos** | 将各片段 MP4 合成为一条时间轴视频；可选同名 JSON | [→](compose-clip-videos.md) |
| **Join Strings** | 拼接可变数量的字符串/数值；换行、逗号、`_`、`-`、`/`、空拼接或自定义分隔符 | [→](join-strings.md) |
| **Clear Directory** | 删除目录中选定类型的媒体文件；Windows 支持回收站 | [→](clear-directory.md) |
| **Size Settings** | 尺寸预设 / 倍数 / 锁定比例 / 方向 → `width`、`height`、`count`、`fps` | [→](size-settings.md) |
| **Size From Megapixels** | 输入宽、高和目标百万像素 → 对齐后的输出宽、高 | [→](size-settings.md#按百万像素计算尺寸) |
| **Format JSON** | 在画布上格式化显示 JSON 字符串 | [→](format-json.md) |
| **Show Anything** | 展示任意值；刷新后保留；可选格式化 JSON | [→](show-anything.md) |
