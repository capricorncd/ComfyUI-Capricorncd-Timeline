# Node documentation

[Back to README](../README.md) · [Timeline Editor guide](timeline-editor.md)

## Add-node menu groups

All nodes are grouped under `Capricorncd`. Categories only affect menu placement; node IDs, names, inputs and outputs are unchanged, so existing workflows do not need rewiring. Restart ComfyUI and refresh the frontend after updating.

| Category | Contents |
|----------|----------|
| `Capricorncd` (root) | Timeline Editor — the main entry point |
| `Timeline` | Data Json Clip Parser, Generate Timeline Preview |
| `MiniMaxH3` | H3 reference conditioning, motion-context refinement, optional latent save/load, sequence sampler and audio repair |
| `Video` | Seq To Video, Compose Clip Videos, Cap Model Preview Override |
| `Image` | Image loading, metadata, saving and batch operations |
| `Prompt` | Rich Prompt Input, Prompt Group, Prompt From Batch, Clip Prompt VL |
| `Utils` | Size settings, megapixel sizing, JSON formatting, Show Anything, Join Strings, directory cleanup and Windows shutdown |

`MiniMaxH3/Internal` contains the continuation, video/audio trimming and audio-joining helpers used by the expanded sequence sampler; ordinary workflows normally use the parent sampler instead.

## Node reference

| Node | Description | Doc |
|------|-------------|-----|
| **MiniMax H3 Video Generator** | Runtime Clips → saved video list; 4/8 steps, optional upscale/refine, strict endpoints or multimodal references | [→](h3-video-generator.md) · [中文](zh/h3-video-generator.md) |
| **Cap Model Preview Override** | Loop-safe sampling preview adapter; requires unmodified KJNodes | [→](model-preview-override.md) · [中文](zh/model-preview-override.md) |
| **Timeline Editor** | Fullscreen multi-track editor; generated-video preview/mute; Export → Compose Video; `swap_wh`; outputs `data_json` and `frame_seq_dir` | [→](timeline-editor.md) · [中文](zh/timeline-editor.md) |
| **Rich Prompt Input** | Prompt editor with live syntax highlighting, `#` comments, and history/presets | [→](prompt-input.md) · [中文](zh/prompt-input.md) |
| **Prompt Group** | Global / scene / negative prompts; counts non-empty scene prompt lines | [→](prompt-group.md) · [中文](zh/prompt-group.md) |
| **Prompt From Batch** | Slice scene prompts by index/length; optionally merge global prompt | [→](prompt-from-batch.md) · [中文](zh/prompt-from-batch.md) |
| **Generate Timeline Preview** | Current project + Clip ID → complete in-memory MiniMax H3 preview; sampling and AV decode are built in | [→](timeline-editor.md#ai-optimize-prompt) · [中文](zh/timeline-editor.md#ai-优化提示词) |
| **Data Json Clip Parser** | Extracts a single clip from Timeline Editor `data_json` output | [→](data-json-clip-parser.md) · [中文](zh/data-json-clip-parser.md) |
| **MiniMaxH3** | Timeline `data_json` clip → MiniMax H3 Reference to Video (refs + prompt + latent) | [→](minimax-h3.md) · [中文](zh/minimax-h3.md) |
| **Save Images** | Saves an `IMAGE` batch to disk; optional `{prefix}.json` sidecar with prompts and models | [→](save-images.md) · [中文](zh/save-images.md) |
| **Load Images From Dir** | Loads images from a directory into an `IMAGE` batch | [→](load-images-from-dir.md) · [中文](zh/load-images-from-dir.md) |
| **Image Batch Count** | Returns the number of images in a batch | [→](image-batch.md) · [中文](zh/image-batch.md) |
| **Image From Batch Index** | Extracts one image from a batch by index | [→](image-batch.md) · [中文](zh/image-batch.md) |
| **Seq To Video** | Composes frames + optional audio into MP4 via ffmpeg; writes a same-name JSON with prompts and models | [→](seq-to-video.md) · [中文](zh/seq-to-video.md) |
| **Compose Clip Videos** | Concatenates per-clip MP4s into one timeline video; optional same-name JSON sidecar | [→](compose-clip-videos.md) · [中文](zh/compose-clip-videos.md) |
| **Join Strings** | Joins a variable number of string/int/float inputs; newline, comma, `_`, `-`, `/`, none, or custom separator | [→](join-strings.md) · [中文](zh/join-strings.md) |
| **Clear Directory** | Deletes selected media files in a directory; supports Recycle Bin on Windows | [→](clear-directory.md) · [中文](zh/clear-directory.md) |
| **工作流完成后强制关机 (Windows)** | Connected trigger with optional numeric/string matching; forced Windows shutdown after successful execution and an empty queue | [中文](zh/windows-shutdown.md) |
| **Size Settings** | Size preset / scale / lock aspect / orientation → `width`, `height`, `count`, `fps` | [→](size-settings.md) · [中文](zh/size-settings.md) |
| **Size From Megapixels** | Input width + height + target megapixels → aligned output width and height | [→](size-settings.md#size-from-megapixels) · [中文](zh/size-settings.md#按百万像素计算尺寸) |
| **Format JSON** | Pretty-print a JSON string in the graph UI | [→](format-json.md) · [中文](zh/format-json.md) |
| **Show Anything** | Show any value on the node; persists across refresh; optional Format JSON | [→](show-anything.md) · [中文](zh/show-anything.md) |
