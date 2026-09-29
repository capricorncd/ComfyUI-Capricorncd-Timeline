# Training Dataset Timeline / 训练素材时间轴

Add **Capricorncd → Training Dataset Timeline** (`CAP_TrainingDataset`). The node has one button opening a fullscreen dataset workspace. Restart ComfyUI after installing the Python node, then refresh the browser.

## Workflow

1. Add one or more videos by uploading, or enter an absolute path on the ComfyUI server. Local paths avoid copying large source videos. Sources remain unchanged.
2. Run **Detect scene cuts** (uses the existing PySceneDetect detector), or press **M** / use the mark button at the playhead. Cut removal merges adjacent scenes; Undo restores the previous cuts, captions and selection. Automatically detected cuts are shot boundaries, not codec I-frames.
3. Click a scene card or timeline interval to loop its export window. Use the checkbox to include it. Short scenes stay previewable but cannot be selected. The eligible-only filter and Select eligible apply to the current video.
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
