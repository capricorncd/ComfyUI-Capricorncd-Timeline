# Release notes / 更新记录

## 0.16.0 — 2026-09-09

Project schema remains **4**. Existing projects migrate on load; new optional fields do not require a schema bump.

### English

- Add waveform volume points, snapping and deletion; migrate legacy fades into the volume curve.
- Mix all enabled, unmuted generated-video audio in timeline and trim previews, including detached audio.
- Add track-level unlink controls in Trim Video; keep video files on disk.
- Add System font as the first font choice.
- Add project-size / 720P / 1080P / 2K compose resolution settings and export-quality choices, defaulting to project dimensions and CRF 16.
- Add conservative direct joining with high-quality fallback when precise editing needs re-encoding.
- Move all audio exclusion controls to the timeline; remove the separate export switch.
- Add a global watermark checkbox and compact quality help; size the export dialog to 80vw × 80vh.
- Include the current workflow.json alongside project.json and media in directory and ZIP exports.
- Refocus both READMEs on Timeline Editor and move supporting nodes to documentation indexes.

### 简体中文

- 新增波形音量控制点、吸附和删除；旧淡入淡出转换为音量曲线。
- 主时间轴和修剪预览混合播放所有启用、未静音的生成视频原声及独立音频。
- 修剪视频增加轨道级解除关联操作，不删除磁盘视频。
- 字体列表新增首项“系统字体”。
- 合成新增项目尺寸 / 720P / 1080P / 2K 和导出画质，默认项目尺寸、CRF 16。
- 新增有条件的直接拼接；需要精确重编码时使用高画质回退。
- 移除导出窗口的音频排除开关，统一由时间轴控制。
- 新增水印总开关和画质悬停说明；导出窗口设为 80vw × 80vh。
- 导出目录和 ZIP 随工程、素材附带当前 workflow.json。
- 中英文 README 聚焦时间轴编辑器，配套节点移入独立文档索引。
