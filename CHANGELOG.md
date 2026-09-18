# Release notes / 更新记录

## 0.17.20 — 2026-09-19

### English

- Add digital human Clips and preserve source audio in MiniMax H3 lip-sync generation.
- Fix text-only Clip queueing and restore H3 progress and previews after switching workflows.
- Add audio playback in Clip resource previews and make preview labels less prominent.
- Use shared menus with icons, shortcut labels and grouped actions.
- Highlight tracks when hovering their headers and add undoable removal of gaps between Clips.

### 简体中文

- 新增数字人 Clip，MiniMax H3 对口型生成保留原始音频。
- 修复纯文本 Clip 无法进入队列，以及切换工作流后 H3 进度和预览丢失的问题。
- Clip 素材预览支持音频播放，降低预览标签的视觉干扰。
- 使用共享菜单组件，统一图标、快捷键标注和操作分组。
- 悬停轨道头时高亮轨道，新增可撤销的 Clip 间隙移除操作。

## 0.17.19 — 2026-09-18

### English

- Add individual audio/video Clip export and video scale and position controls in Trim Video.
- Add reference-audio preview and trimming for text-to-audio; remember voice, language and reference selection.
- Improve audio waveforms, volume controls, splitting and clipboard placement on available tracks.
- Separate director Clip audio as a complete mix; fix mute-state and renamed audio-title persistence.
- Wrap long filenames in delete dialogs and add a GitHub link to the timeline menu.

### 简体中文

- 新增音频、视频 Clip 单独导出，以及视频修剪中的缩放和位置偏移控制。
- 文本转音频支持参考音频试听和裁剪，并记住音色、语言及参考音频选择。
- 改善音频波形、音量控制、分割及空闲轨道上的复制粘贴。
- 导演 Clip 分离音频时导出完整混音；修复静音状态和音频重命名标题的保存与恢复。
- 删除弹窗中的长文件名自动换行，时间轴更多菜单新增 GitHub 链接。

## 0.17.18 — 2026-09-17

### English

- Add music and sound-effect generation, audio denoising, speaker separation, voice conversion and text-to-audio with voice previews.
- Group audio service settings into tabs with shared connection defaults, per-service overrides and automatic saving to local YAML configuration.
- Process director Clip audio as a timeline mix; improve trim audio splitting, volume controls and waveforms.
- Support Ctrl+B to mute or unmute audio Clips with undo and immediate playback updates.

### 简体中文

- 新增音乐、音效生成、音频降噪、人声分离、音色转换和文本转音频，支持预设音色试听。
- 音频服务设置采用 Tab 分类，支持通用连接配置、各服务独立覆盖，并自动保存到本机 YAML 配置。
- 导演 Clip 的音频先按时间线混合再处理；完善修剪音频分割、音量控制及波形显示。
- 音频 Clip 支持 Ctrl+B 静音与解除静音，可撤销并即时更新播放。

## 0.17.17 — 2026-09-16

### English

- Add compact MiniMax H3 video generation with per-Clip saving, built-in previews, optional second-pass sampling and audio processing, and final batch composition.
- Connect H3 sampling previews to Prompt Manager and automatically associate completed Clip videos.
- Add boundary snapping and alignment guides when moving multiple selected Clips.
- Auto-scroll horizontally while dragging the playhead or scrubbing the ruler near viewport edges; stop on release, window blur or timeline teardown.

### 简体中文

- 新增精简 MiniMax H3 视频生成节点，支持逐 Clip 保存、内置预览、可选二采与音频处理，以及整批最终合成。
- H3 采样预览接入提示词管理，片段完成后自动关联生成视频。
- 多选 Clip 整体移动支持边界吸附与对齐虚线。
- 拖动播放头或刻度尺到可视边缘时自动横向滚动；松开、窗口失焦或销毁时间轴时停止。

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
