# 节点文档索引

[返回主页](../../README.zh.md) · [时间轴编辑器指南](timeline-editor.md)

| 节点 | 说明 | 文档 |
|------|------|------|
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
| **Format JSON** | 在画布上格式化显示 JSON 字符串 | [→](format-json.md) |
| **Show Anything** | 展示任意值；刷新后保留；可选格式化 JSON | [→](show-anything.md) |
