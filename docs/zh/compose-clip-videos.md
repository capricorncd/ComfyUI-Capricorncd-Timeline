# Compose Clip Videos（多段视频合成）

按运行数据 `data_json.clips` 的列表顺序合成，读取每段的 `output_video`（相对 ComfyUI output）。跳过禁用片段，文件缺失时报错，不替换为其他生成版本。需要 FFmpeg 和 FFprobe。

## 输入

- `data_json`：Timeline Editor 输出，包含 fps、片段时间和 output_video。
- `filename_prefix`：默认 `capricorncd-timeline/compose`。
- `trim_extends`：去除重复上下文和显式首尾延长；保留 H3 对齐产生的有效尾帧用于连续衔接，因此总时长可能略长于时间轴；关闭则保留完整文件。
- `save_sidecar`：在 MP4 旁保存来源路径、提示词及工作流信息。
- `audio`（可选 AUDIO 输入）：从最终视频开头播放。保留原声时与其混音；关闭原声时仅使用接入音频。音频过长则裁剪，过短则补静音，不改变视频时长。
- `use_original_audio`（使用原视频的音频）：默认 true。保留各片段原声，无声片段补静音；关闭后不合入片段原声，此时未接入 `audio` 就输出无声视频。

合入外部音频时直接复制已合成的视频流，不进行额外的视频编码。合成元数据记录是否使用原声及 AUDIO 输入。旧工作流默认保留原声，新输入不会改变现有控件顺序。

只有上一段参与合成的 Clip 的 Save Latent 为 true，且当前段启用了 Motion Context，才对当前段使用 H3 续接裁剪规则。第一段没有前段上下文。当前段的 Save Latent 用于准备下一段，不代表当前段需要裁上下文头帧。通过实际帧数区分完整视频和已经裁过头的视频，防止重复裁剪。长度无法确定或 H3 视频帧率与工程不符时会报错，避免误裁。请使用同一轮生成的视频与 data_json。

已移除片段目录和文件名匹配选项。旧数据没有 output_video 时仍支持 run_timestamp/run_prefix 目录及 FROM 文件名回退；旧工作流使用自定义目录时，请在 data_json 中提供 output_video。旧工作流保留已有输出前缀和裁剪、保存选项。

输出 filename 是相对 ComfyUI output 的路径。本节点顺序拼接片段；叠加媒体、字幕和时间轴音频请使用时间轴导出合成。
