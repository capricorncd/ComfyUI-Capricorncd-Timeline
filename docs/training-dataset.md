# Training Dataset Timeline / 训练素材时间轴

Add **Capricorncd → Training Dataset Timeline** (`CAP_TrainingDataset`). The node has one button opening a fullscreen dataset workspace. Restart ComfyUI after installing the Python node, then refresh the browser.

## Workflow

1. Add one or more videos by uploading, or enter an absolute path on the ComfyUI server. Local paths avoid copying large source videos. Sources remain unchanged.
2. Run **Detect scene cuts** (uses the existing PySceneDetect detector), or press **M** / use the mark button at the playhead. Cut removal merges adjacent scenes; Undo restores the previous cuts, captions and selection. Automatically detected cuts are shot boundaries, not codec I-frames.
3. Click a scene card or timeline interval to loop its export window. Use the checkbox to include it. Short scenes can be enabled, but are excluded from export and valid counts. The eligible-only filter and Select eligible apply to the current video.
4. Adjust export start within a longer scene using seconds or the frame slider. The window is clamped inside that scene on the 24fps grid. Default: 124 frames (5.1667 seconds), 512×256. Valid H3 lengths are 124…345 in steps of 17; dimensions are multiples of 32. Choose center crop or fit with padding. Preview shows the source; the export and Agent input use the chosen resize.
5. Enter a training caption. Optionally select an existing local vision model or configured Agent and caption the current window, or fill empty captions for selected windows. Remote Agents receive sampled frames through the existing Agent provider; no call occurs until requested. Review generated text before export. Local models may use GPU memory; scene detection and encoding do not load a training model.
6. Export selected clips across all loaded videos. Each clip is verified with ffprobe for exact frame count and dimensions. Output: `ComfyUI/output/training-datasets/<timestamp-id>/clip_0001.mp4`, matching UTF-8 `.txt`, and `manifest.json` recording source paths and time windows. Audio is omitted. Blank captions are allowed and counted in the footer.

Clip selection, boundaries, captions and settings are stored in the node's workflow properties. Save the ComfyUI workflow to preserve them. Reopening re-registers source paths; unavailable files retain their saved state but are excluded from export. Uploaded originals are retained under `input/capricorncd-timeline/training-sources`.

Cancel terminates an active encoding process. Scene detection / provider inference cancellation takes effect when the current call returns. Completed clips in an interrupted export remain with a `partial` manifest; only a successful full batch is marked `complete`. Each export uses a new directory, so previous datasets are not overwritten.

## Requirements and validation

Existing ComfyUI Python dependencies, ffmpeg/ffprobe on PATH, and PySceneDetect. Agent configuration uses the existing Timeline settings. No new package dependency is added.

Run `python tests/test_training_dataset.py` in the ComfyUI environment and `node tests/test_training_dataset.mjs`. Tests include real 30fps → 24fps/124-frame exports, dimensions, labels, missing/short ranges, cancellation, scene detection and a stub Agent verifying that it receives only the chosen export window. They do not call a provider or load a vision model.

For isolated UI checks, run `python tests/serve_training_fixture.py <15-second-video>` and open `http://127.0.0.1:8745/tests/training_dataset.browser.html`. The fixture uses separate `.test-output` directories and no real Agent configuration.


## 打点 JSON 导入导出

顶部“导出打点 JSON”下载版本化工程（format: capricorncd-training-dataset，version: 1）。包含视频路径、打点区间、导出起点、选择状态、标签、裁剪位置、输出尺寸和预览高度；不包含视频本体或临时会话 token。

“导入打点 JSON”校验成功后替换当前编辑内容，导入前可先导出当前工程。取消或格式校验失败不更改当前内容。导入的视频路径失效时保留打点以便用“重新关联当前视频”恢复，不自动丢弃导入的数据。最大 JSON 文件为 20 MB。

## 轨道编辑

片段卡片列表已移除。单击轨道片段只选中，右侧显示原视频中的开始、结束和时长；Ctrl/Shift+点击多选。Ctrl+B 启用或禁用所选片段的导出，不足目标帧数的片段也能启停，但导出时忽略。Delete 删除片段，Ctrl+Z 撤销。删除不会移动后续片段或删除源视频。

悬停片段右上角的视频图标循环预览该片段，移开停止。选中片段不再自动播放。左侧轨道图标悬停菜单提供“移除间隙”，保留首段原有起点，压紧后续片段排列；timelineStart 仅用于轨道显示、播放跳转，源视频 start/end/offset 不变。此操作可撤销，JSON 工程保存该排列。

## 裁剪与自动打点

视频固定完整显示。裁剪框锁定右侧输出比例，拖动框内移动，拖动四角等比缩放。左右面板分隔线可拖动，宽度自动保存。视频与时间轴之间不再显示操作区。

时间轴右上角提供自动打点。选中一个或多个片段时仅分析所选源视频区间，保留其他片段；没有选中片段时分析整段视频。运行中按钮变为取消打点，取消会终止检测子进程，并保留原有片段。选区拆分可 Ctrl+Z 撤销。

大量片段优化：单击选择只更新变化的高亮，不保存整份工程；屏幕外不创建视频预览按钮，滚入后自动补充；暂停时不重复刷新同一时间。裁剪、标签输入和面板拖动合并保存，关闭时立即补存。

## 片段裁剪、合并和缩放

拖动片段左右边缘调整区间，按 24fps 对齐；不越过相邻片段或源视频边界。播放头位于所选片段内部时，Q 裁掉左侧，W 裁掉右侧。缩短到不足目标帧数时保留启用状态，但不计入有效数量。Ctrl+G 合并选中的连续片段，要求源视频和轨道都无间隙；合并保留首段裁剪框，标签去重后合并，任一原片段启用则合并后启用（实际导出仍须满足帧数）。这些操作均支持 Ctrl+Z。

滚轮缩放按动画帧合并，保持鼠标下的时间位置；训练时间轴只挂载可见区及两侧 200px 缓冲内的片段，数据、选择和导出仍覆盖所有片段。

## 全局裁剪与导出启停

时间轴右上角“裁剪应用到全部片段”使用 cap-switch。开启时以当前片段裁剪（无选中则取当前视频首段）初始化共享裁剪，之后所有视频中的片段预览、自动标签、导出统一使用它，无需选中片段也可调整。关闭后恢复每个片段原有裁剪。工程及打点 JSON 保存 cropAll/sharedCrop，后续新增或拆分片段同样使用共享裁剪。

Ctrl+B 批量切换选中片段的导出状态，右侧提供“启用导出（Ctrl+B）”开关和状态文字。选中片段时焦点回到轨道，复选开关焦点也允许快捷键；文字输入框仍保留自己的编辑快捷键。短片段也可启停，红框提示导出时会忽略。

短片段用红色边框标识。帧数资格与启用状态独立：短片段也能用 Ctrl+B 或开关启停，调整长度或目标帧数不再清除启用状态。有效数量、空标签数量、批量标签及导出仅计算启用且满足目标帧数的片段。

## 节点编辑状态恢复

节点 training_dataset 保存 activeSourcePath，以及每个视频的 editorView（缩放、横向/纵向滚动、视频时间、当前片段和多选 ID）。打开时恢复当前视频、视频画面与播放线、片段选择；保持暂停。缩放、滚动、选择和定位合并保存，关闭时立即写回；窗口卸载后不再用已脱离页面的滚动值覆盖记录。保存 ComfyUI 工作流后这些状态随节点持久化。

节点保存完整 sources/segments 和 settings，删除后的列表（包括空列表）、裁剪/合并时间、标签、启停、裁剪参数、全局裁剪、尺寸帧数和 Agent 选择均在工作流 properties.training_dataset 内。工作流序列化前强制补存未完成的防抖更新；源文件失效也保留已有片段以便重新关联，避免重开时丢失编辑。
