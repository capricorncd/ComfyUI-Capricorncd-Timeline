"""Configuration for Carasibana's H3-FaceRefine; no detection or model loading here.

Upstream: https://github.com/Carasibana/ComfyUI-H3-FaceRefine
Reviewed revision: d8521d14fe0d721d80cd9417fff5a559cbc21aba
Copyright (c) 2026 Carasibana, MIT. Algorithms remain in the installed upstream package.
"""
import math
import os

import folder_paths


FACE_NODES = ("H3FaceTrackCrop", "H3PerFrameDenoise", "H3FaceStitch")
FACE_SELECTIONS = ["largest_face", "smallest_face", "centre_most", "left_most", "right_most", "detector_score"]


def register_face_detectors():
    folder_paths.add_model_folder_path("ultralytics_bbox", os.path.join(folder_paths.models_dir, "ultralytics", "bbox"))
    paths, extensions = folder_paths.folder_names_and_paths["ultralytics_bbox"]
    folder_paths.folder_names_and_paths["ultralytics_bbox"] = (paths, extensions | {".pt"})


def validate_face_config(config, resolve_detector=True):
    if not isinstance(config, dict):
        raise ValueError("Enable face_refine only with an H3 Face Refine Config connected.")
    schema = CAP_H3FaceRefineConfig.INPUT_TYPES()["required"]
    if set(config) != set(schema):
        raise ValueError("Invalid face refinement configuration. Reconnect H3 Face Refine Config.")
    for name, (kind, options) in schema.items():
        value = config[name]
        if isinstance(kind, list):
            if name != "detector" and value not in kind:
                raise ValueError(f"Invalid face refinement {name}: {value}.")
        elif kind in ("INT", "FLOAT"):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"Face refinement {name} must be a finite number.")
            if not options["min"] <= value <= options["max"] or (kind == "INT" and not isinstance(value, int)):
                raise ValueError(f"Face refinement {name} is outside its supported range.")
    if config["canvas_size"] % 32:
        raise ValueError("Face refinement canvas_size must be a multiple of 32.")
    if resolve_detector:
        name = config["detector"]
        if not isinstance(name, str) or name not in folder_paths.get_filename_list("ultralytics_bbox"):
            raise ValueError("Select an installed face detector from models/ultralytics/bbox.")
        folder_paths.get_full_path_or_raise("ultralytics_bbox", name)
    return dict(config)


class CAP_H3FaceRefineConfig:
    CATEGORY = "Capricorncd/MiniMaxH3"
    FUNCTION = "configure"
    RETURN_TYPES = ("CAP_H3_FACE_REFINE_CONFIG",)
    RETURN_NAMES = ("face_refine_config",)
    DOC_SLUG = "h3-face-refine"
    DESCRIPTION = "Configure optional Carasibana H3-FaceRefine in H3 Video Generator. One tracked face per Clip; select_index is zero-based. No model downloads or identity-recognition models."

    @classmethod
    def INPUT_TYPES(cls):
        register_face_detectors()
        detectors = folder_paths.get_filename_list("ultralytics_bbox") or ["none"]
        return {"required": {
            "detector": (detectors, {"default": "face_yolov8m.pt" if "face_yolov8m.pt" in detectors else detectors[0]}),
            "select": (FACE_SELECTIONS, {"default": "largest_face"}),
            "select_index": ("INT", {"default": 0, "min": 0, "max": 99}),
            "confidence": ("FLOAT", {"default": 0.35, "min": 0.05, "max": 0.95, "step": 0.05}),
            "denoise": ("FLOAT", {"default": 0.4, "min": 0.01, "max": 0.6, "step": 0.01}),
            "large_face_strength": ("FLOAT", {"default": 0.35, "min": 0.0, "max": 1.0, "step": 0.05}),
            "canvas_size": ("INT", {"default": 768, "min": 512, "max": 1024, "step": 32}),
            "crop_factor": ("FLOAT", {"default": 2.5, "min": 1.2, "max": 8.0, "step": 0.1}),
            "smooth_window": ("INT", {"default": 21, "min": 1, "max": 201, "step": 2}),
            "feather": ("INT", {"default": 6, "min": 0, "max": 256}),
            "blend": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}),
        }}

    def configure(self, **kwargs):
        return (validate_face_config(kwargs, resolve_detector=False),)


NODE_CLASS_MAPPINGS = {"CAP_H3FaceRefineConfig": CAP_H3FaceRefineConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3FaceRefineConfig": "H3 Face Refine Config"}
