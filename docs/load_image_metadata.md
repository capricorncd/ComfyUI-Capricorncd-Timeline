# Load Image Metadata

[All nodes](nodes.md) · [简体中文](zh/load_image_metadata.md)

Node ID: `CAP_LoadImageMetadata`. Category: `Capricorncd/Image`.

Select or upload an image using the standard ComfyUI image controls. The node displays prompt and description text when selecting, reopening or running the image. Outputs: `image` (IMAGE), `mask` (MASK), `prompt`, `description` and `raw` (STRING). Connect pixels to image workflows and text outputs to Show Anything or prompt inputs.

Prompt prefers `ImageAssetMetadata.generation_prompt`, then GenerationPrompt, generation_prompt, parameters and prompt. A ComfyUI prompt may be the complete workflow JSON; the node does not guess a positive-prompt node. Description prefers `ImageAssetMetadata.setting_description`, then Description, description, ImageDescription and EXIF ImageDescription. Missing or explicitly null original prompts remain empty; no AI reconstruction runs.

`raw` is formatted JSON with image dimensions/mode, Pillow info and decoded EXIF; binary values use Base64. PNG text after IDAT is supported. Reading does not alter source pixels or metadata and never executes embedded content.
