# H3 Face Refine Config

Connect this node to **H3 Video Generator → face_refine_config**, then use the enable switch on this config node (disconnect or disable to skip repair). Restart ComfyUI after installing the optional [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine) dependency.

Place `face_yolov8m.pt` in the upstream standard directory `models/ultralytics/bbox` (or an externally registered `ultralytics_bbox` directory); choose a face detector, not a hand/person detector. Nothing is downloaded automatically. Impact-Pack is not required for this integration.

Each Clip tracks one face. `select` ranks faces for the initial selection; `select_index` is zero-based. Subsequent frames use spatial continuity, without identity recognition or automatic scene splitting. Crossing people or cuts may need separate Clips. If no face is detected, upstream stops with an error; lower confidence or disable refinement for that run.

Defaults: confidence 0.35, denoise 0.4, large-face strength 0.35, square canvas 768, crop factor 2.5, smoothing window 21, feather 6, blend 1.0. Large faces receive gentler treatment. Higher denoise can change identity; larger canvases consume more memory.

Processing runs after motion deblur, using the connected sampling model and matching 4/8-step LoRA. It adds crop encoding, sampling and decoding, then stitches only the face region. Original audio, frame count, Context prefix and strict endpoint frames are retained. Full-frame keyframes and Context audio anchors are excluded from crop conditioning. Saved Context latents are encoded from the final repaired pixels, adding encoding work. Audio latents are held with a zero noise mask; this does not guarantee lip-sync or visual quality. CPU integration tests simulate model/VAE inference; GPU output quality still requires a real generation run.

## Attribution

Tracking/cropping, adaptive per-frame denoise and stitching are provided by **Carasibana**, [ComfyUI-H3-FaceRefine](https://github.com/Carasibana/ComfyUI-H3-FaceRefine), Copyright (c) 2026 Carasibana, MIT license. Reviewed source: [d8521d14fe0d721d80cd9417fff5a559cbc21aba](https://github.com/Carasibana/ComfyUI-H3-FaceRefine/tree/d8521d14fe0d721d80cd9417fff5a559cbc21aba). Cap calls the installed upstream nodes; their implementation and LICENSE remain in that package.

YOLO inference is supplied by [Ultralytics](https://github.com/ultralytics/ultralytics); detector weights such as [Bingsu/adetailer](https://huggingface.co/Bingsu/adetailer) have their own source and license terms. The upstream MIT license does not replace dependency or model licenses.
