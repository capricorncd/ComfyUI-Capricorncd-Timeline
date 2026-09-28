# H3 Motion Context helpers

[All nodes](nodes.md) · [README](../README.md)

Category: `Capricorncd/MiniMaxH3`. These nodes are for custom H3 sampling graphs. The compact H3 Video Generator already manages continuation. Install ComfyUI-H3-Motion-Context for active context operations.

## H3 Motion Context (Refine)

Node ID: `CAP_H3MotionContextRefine`.

Connect the first-pass `conditioning`, video `vae`, current upscaled AV `latent`, and the preceding Clip's high-resolution AV latent to `context_latent`. Connect MiniMaxH3 `trim_frames` to `context_length`. The `conditioning` output feeds the high-resolution sampler's guider.

This replaces first-pass context anchors with high-resolution context, retaining other references. Zero context passes conditioning through; positive context needs matching preceding latent and the effective H3 frame-grid length (`17k+5`). It does not add or trim frames itself.

## H3 Motion Context Load Latent (Optional)

Node ID: `CAP_H3MotionContextLoadLatentOptional`.

Connect Data Json Clip Parser `load_context → load`, set `latent_path` to the saved context file or directory under ComfyUI output, and select the previous `clip_index`. Connect `context_latent` to MiniMaxH3's matching input. Disabled or unavailable context returns an empty latent, allowing the conditioning node to use its previous-video fallback. Index 0 chooses the newest file; use an explicit slot for repeatable reruns.

## H3 Motion Context Save Latent (Optional)

Node ID: `CAP_H3MotionContextSaveLatentOptional`.

Connect sampled AV `latent` and MiniMaxH3 or Clip Parser `save_latent → save`. Set `filename_prefix` and the current `clip_index`. Outputs are `latent_path` and the unchanged `latent`. Disabled saving returns an empty path and performs no disk write. Save the final high-resolution latent separately when the next Clip will refine at that resolution.

See [MiniMaxH3](minimax-h3.md) for timing and context replacement; saved and loaded slots must refer to adjacent Clips in the intended chain.
