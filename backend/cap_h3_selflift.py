"""Configuration for facok/comfyui-SelfLift; sampling stays in the installed package."""
import math

import folder_paths


class CAP_H3SelfLiftConfig:
    CATEGORY = "Capricorncd/MiniMaxH3"
    FUNCTION = "configure"
    RETURN_TYPES = ("CAP_H3_SELFLIFT_CONFIG",)
    RETURN_NAMES = ("selflift_config",)
    DOC_SLUG = "h3-video-generator"
    DESCRIPTION = "Experimental SelfLift progressive sampling. Connect to MiniMax H3 Video Generator and select selflift. Uses the installed facok/comfyui-SelfLift node; no model downloads. Low-resolution steps must be less than the generator's total steps. For 4 total steps, set 3 (3 low-res + 1 high-res; valid range 1–3). For 8 total steps, set 6 (6 low-res + 2 high-res; valid range 1–7). When changing total steps, update this value and select the matching 4/8-step LoRA; neither changes automatically."

    @classmethod
    def INPUT_TYPES(cls):
        models = folder_paths.get_filename_list("latent_upscale_models") if "latent_upscale_models" in folder_paths.folder_names_and_paths else []
        default_model = next((name for name in models if "h3" in name.lower()), "none")
        return {"required": {
            "transition_step": ("INT", {"default": 6, "min": 1, "max": 7, "tooltip": "Low-resolution steps must be less than the generator's total steps. For 4 total steps, set 3 (3 low-res + 1 high-res; valid range 1–3). For 8 total steps, set 6 (6 low-res + 2 high-res; valid range 1–7). When changing total steps, update this value and select the matching 4/8-step LoRA; neither changes automatically."}),
            "lowres_scale": ("FLOAT", {"default": 0.5, "min": 0.25, "max": 1.0, "step": 0.05}),
            "scheduler": (["beta", "simple"], {"default": "beta"}),
            "upscaler_model": (["none"] + models, {"default": default_model}),
            "rho": ("FLOAT", {"default": 0.0, "min": 0.0, "max": 1.0, "step": 0.05, "tooltip": "0 uses the external upscaler only. Without an upscaler, use a positive value (upstream suggests 0.6 with weights 1/1 for H3)."}),
            "w_min": ("FLOAT", {"default": 0.5, "min": 0.0, "max": 1.0, "step": 0.05}),
            "w_max": ("FLOAT", {"default": 1.0, "min": 0.0, "max": 1.0, "step": 0.05}),
        }}

    def configure(self, **kwargs):
        return (validate_selflift_config(kwargs, resolve_model=False),)


def validate_selflift_config(config, steps=None, resolve_model=True):
    if not isinstance(config, dict) or set(config) != set(CAP_H3SelfLiftConfig.INPUT_TYPES()["required"]):
        raise ValueError("SelfLift mode requires a connected H3 SelfLift Config.")
    for name, (kind, options) in CAP_H3SelfLiftConfig.INPUT_TYPES()["required"].items():
        value = config[name]
        if kind in ("INT", "FLOAT"):
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                raise ValueError(f"SelfLift {name} must be a finite number.")
            if not options["min"] <= value <= options["max"] or (kind == "INT" and not isinstance(value, int)):
                raise ValueError(f"SelfLift {name} is outside its supported range.")
    if config["scheduler"] not in ("beta", "simple"):
        raise ValueError("SelfLift scheduler must be beta or simple.")
    if steps is not None and config["transition_step"] >= steps:
        raise ValueError(f"SelfLift transition_step must be less than {steps}; use 1–{steps - 1}.")
    if config["w_min"] > config["w_max"]:
        raise ValueError("SelfLift w_min must not exceed w_max.")
    name = config["upscaler_model"]
    if not isinstance(name, str):
        raise ValueError("SelfLift upscaler_model must be an installed filename or none.")
    if name == "none":
        if config["rho"] <= 0 or config["w_max"] <= 0:
            raise ValueError("Select a SelfLift upscaler or enable pixel correction with rho > 0 and w_max > 0.")
    elif resolve_model:
        if not isinstance(name, str) or name not in folder_paths.get_filename_list("latent_upscale_models"):
            raise ValueError("Select an installed SelfLift model from models/latent_upscale_models.")
        folder_paths.get_full_path_or_raise("latent_upscale_models", name)
    return dict(config)


NODE_CLASS_MAPPINGS = {"CAP_H3SelfLiftConfig": CAP_H3SelfLiftConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3SelfLiftConfig": "H3 SelfLift Config"}
