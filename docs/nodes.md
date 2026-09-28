# All nodes and connections

[README](../README.md) · [简体中文](zh/nodes.md)

All **39 registered nodes** are listed below in their actual add-node menu hierarchy. Display names may be localized; IDs identify the exact workflow node.

## Menu hierarchy

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

The main path is **Timeline Editor.data_json → MiniMax H3 Video Generator.data_json**, with model, CLIP and both VAEs connected to the generator. Config nodes feed matching generator inputs. Internal helpers are created by the sequence sampler; they are not extra required nodes.

## Capricorncd

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Timeline Editor**<br>`CAP_TimelineEditor` | Main editor; outputs runtime data_json. | [→](timeline-editor.md) |

## Capricorncd/Timeline

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Data Json Clip Parser**<br>`CAP_DataJsonClipParser` | Extract one Clip for a custom model workflow. | [→](data-json-clip-parser.md) |
| **Generate Timeline Preview**<br>`CAP_TimelinePreview` | Generate an in-memory H3 Clip preview. | [→](timeline-editor.md#ai-optimize-prompt) |

## Capricorncd/MiniMaxH3

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **H3 Audio Refine Config**<br>`CAP_H3AudioRefineConfig` | Settings → audio_refine_config. | [→](h3-audio-refine.md#h3-audio-refine-config) |
| **H3 Face Refine Config**<br>`CAP_H3FaceRefineConfig` | Settings → face_refine_config. | [→](h3-face-refine.md) |
| **H3 加速音频修复**<br>`CAP_H3FastAudioRefineSampler` | Audio-only latent refinement with sampler controls. | [→](h3-audio-refine.md#h3-加速音频修复) |
| **音频修复（加速）**<br>`CAP_H3FastAudioRepair` | Audio repair with attention/shift/cache setup. | [→](h3-audio-refine.md#音频修复加速) |
| **H3 Interpolation Config**<br>`CAP_H3InterpolationConfig` | RIFE settings → interpolation_config. | [→](h3-video-generator.md#rife-frame-interpolation) |
| **H3 Auto Prompt Config**<br>`CAP_H3AutoPromptConfig` | Settings → auto_prompt_config. | [→](h3-shared-prompt.md) |
| **H3 SelfLift Config**<br>`CAP_H3SelfLiftConfig` | Progressive sampling → selflift_config. | [→](h3-video-generator.md#selflift-progressive-sampling-experimental) |
| **Timeline Sequence Sampler**<br>`CAP_H3TimelineSequenceSampler` | Custom sequence graph → frames and audio. | [→](h3-sequence.md#timeline-sequence-sampler) |
| **MiniMax H3 Video Generator**<br>`CAP_H3VideoGenerator` | Timeline → sampled and saved videos. | [→](h3-video-generator.md) |
| **H3 Motion Context (Refine)**<br>`CAP_H3MotionContextRefine` | High-resolution continuation conditioning. | [→](h3-motion-context.md#h3-motion-context-refine) |
| **MiniMaxH3**<br>`CAP_MiniMaxH3ReferenceToVideo` | One Clip → conditioning and AV latent. | [→](minimax-h3.md) |
| **H3 Motion Context Load Latent (Optional)**<br>`CAP_H3MotionContextLoadLatentOptional` | Conditional load of prior context. | [→](h3-motion-context.md#h3-motion-context-load-latent-optional) |
| **H3 Motion Context Save Latent (Optional)**<br>`CAP_H3MotionContextSaveLatentOptional` | Conditional save of sampled context. | [→](h3-motion-context.md#h3-motion-context-save-latent-optional) |

## Capricorncd/MiniMaxH3/Internal

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **H3 Sequence Continuation**<br>`CAP_H3SequenceContinuation` | Prior AV latent → next sampling context. | [→](h3-sequence.md#h3-sequence-continuation) |
| **H3 Sequence Trim Video**<br>`CAP_H3SequenceTrimVideo` | Remove context prefix from decoded frames. | [→](h3-sequence.md#h3-sequence-trim-video) |
| **H3 Sequence Audio Join**<br>`CAP_H3SequenceAudioJoin` | Join audio with optional overlap crossfade. | [→](h3-sequence.md#h3-sequence-audio-join) |
| **CAP_H3SequenceTrimAudio**<br>`CAP_H3SequenceTrimAudio` | Trim decoded audio using H3 frame timing. | [→](h3-sequence.md#h3-sequence-trim-audio) |

## Capricorncd/Video

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Compose Clip Videos**<br>`CAP_ComposeClipVideos` | Saved Clip paths in data_json → composed video. | [→](compose-clip-videos.md) |
| **Cap Model Preview Override**<br>`CAP_ModelPreviewOverride` | KJNodes preview adapter for custom samplers. | [→](model-preview-override.md) |
| **Seq To Video**<br>`CAP_SeqToVideo` | Images or frame directory + audio → MP4. | [→](seq-to-video.md) |

## Capricorncd/Image

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Image Batch Count**<br>`CAP_ImageBatchCount` | Count images in a batch. | [→](image-batch.md) |
| **Image From Batch Index**<br>`CAP_ImageFromBatchIndex` | Select one image by index. | [→](image-batch.md) |
| **加载图像（提示词 / 描述） · Cap**<br>`CAP_LoadImageMetadata` | Load pixels, mask, embedded prompt and description. | [→](load_image_metadata.md) |
| **Load Images From Dir**<br>`CAP_LoadImagesFromDir` | Directory → image batch. | [→](load-images-from-dir.md) |
| **Save Images**<br>`CAP_SaveImages` | Save image batches with optional JSON sidecar. | [→](save-images.md) |

## Capricorncd/Prompt

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Clip Prompt VL**<br>`CAP_ClipPromptVL` | Local VL model + images/video frames → prompt. | [→](clip-prompt-vl.md) |
| **Prompt Group**<br>`CAP_PromptGroup` | Global, scene and negative prompt fields. | [→](prompt-group.md) |
| **Prompt From Batch**<br>`CAP_PromptFromBatch` | Select scene prompts and merge global text. | [→](prompt-from-batch.md) |
| **Rich Prompt Input**<br>`CAP_RichPromptInput` | Prompt editing with history and presets. | [→](prompt-input.md) |

## Capricorncd/Utils

| Node / node ID | Purpose and connection | Guide |
|---|---|---|
| **Clear Directory**<br>`CAP_ClearDirectory` | Clean selected media types from a directory. | [→](clear-directory.md) |
| **Format JSON**<br>`CAP_FormatJson` | Format and display JSON. | [→](format-json.md) |
| **Size Settings**<br>`CAP_SizeSettings` | Width, height, count and fps presets. | [→](size-settings.md) |
| **Size From Megapixels**<br>`CAP_SizeFromMegapixels` | Target megapixels → aligned dimensions. | [→](size-settings.md#size-from-megapixels) |
| **工作流完成后强制关机 (Windows)**<br>`CAP_WindowsShutdown` | Request shutdown after success and an empty queue. | [→](windows-shutdown.md) |
| **Show Anything**<br>`CAP_ShowAnything` | Inspect values, including generated prompts. | [→](show-anything.md) |
| **Join Strings**<br>`CAP_JoinStrings` | Join variable text/numeric inputs. | [→](join-strings.md) |

## Custom workflow connections

| Path | Connection order |
|---|---|
| Custom model | Timeline Editor → Data Json Clip Parser (select index) → model conditioning/sampling/decoding → Seq To Video |
| Custom H3 sampling | Timeline Editor.data_json → MiniMaxH3 → guider/sampler → AV decoding → Seq To Video |
| Sequence sampling | Timeline Editor.data_json → Timeline Sequence Sampler → images/audio → Seq To Video |
| Join generated videos | data_json containing output_video paths → Compose Clip Videos |
| Full timeline export | Editor → Export → Compose Video, including music, subtitles and media tracks |

These custom paths are alternatives, not additional stages after the compact H3 generator. Its `video_files` is a list of file paths, not IMAGE or VIDEO; do not connect it to Seq To Video.images.
