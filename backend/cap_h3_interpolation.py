"""RIFE settings shared with the H3 video generator."""

RIFE_MODELS = ("rife426.pth", "rife49.pth", "rife47.pth", "rife417.pth")


class CAP_H3InterpolationConfig:
    CATEGORY = "Capricorncd/MiniMaxH3"
    FUNCTION = "configure"
    RETURN_TYPES = ("CAP_H3_INTERPOLATION_CONFIG",)
    RETURN_NAMES = ("interpolation_config",)
    DOC_SLUG = "h3-video-generator"
    DESCRIPTION = "Connect to H3 Video Generator and enable frame interpolation. Requires ComfyUI-Frame-Interpolation; first use may download the selected RIFE model."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
                "rife_model": (list(RIFE_MODELS), {"default": "rife426.pth"}),
                "interpolation_multiplier": ("INT", {"default": 2, "min": 2, "max": 4}),
                "rife_scale_factor": ([0.5, 1.0, 2.0], {"default": 1.0}),
                "rife_ensemble": ("BOOLEAN", {"default": False, "tooltip": "Extra inference for supported models. Ignored by RIFE 4.26."}),
                "rife_clear_cache_after_n_frames": ("INT", {"default": 10, "min": 1, "max": 1000}),
            "enabled": ("BOOLEAN", {"default": True}),
        }}

    def configure(self, rife_model="rife426.pth", interpolation_multiplier=2, rife_scale_factor=1.0,
                  rife_ensemble=False, rife_clear_cache_after_n_frames=10, enabled=True):
        if not enabled:
            return (None,)
        config = dict(rife_model=rife_model, interpolation_multiplier=interpolation_multiplier,
                      rife_scale_factor=rife_scale_factor, rife_ensemble=rife_ensemble,
                      rife_clear_cache_after_n_frames=rife_clear_cache_after_n_frames)
        return (validate_interpolation_config(config),)


def validate_interpolation_config(config):
    if not isinstance(config, dict) or set(config) != (set(CAP_H3InterpolationConfig.INPUT_TYPES()["required"]) - {"enabled"}):
        raise ValueError("Frame interpolation requires a connected H3 Interpolation Config.")
    if config["rife_model"] not in RIFE_MODELS:
        raise ValueError("Select a supported RIFE model.")
    multiplier = config["interpolation_multiplier"]
    if type(multiplier) is not int or not 2 <= multiplier <= 4:
        raise ValueError("Interpolation multiplier must be an integer from 2 to 4.")
    if type(config["rife_scale_factor"]) not in (int, float) or config["rife_scale_factor"] not in (0.5, 1.0, 2.0):
        raise ValueError("RIFE scale factor must be 0.5, 1 or 2.")
    interval = config["rife_clear_cache_after_n_frames"]
    if type(interval) is not int or not 1 <= interval <= 1000:
        raise ValueError("RIFE cache interval must be from 1 to 1000.")
    if type(config["rife_ensemble"]) is not bool:
        raise ValueError("RIFE ensemble must be a boolean.")
    return dict(config)


NODE_CLASS_MAPPINGS = {"CAP_H3InterpolationConfig": CAP_H3InterpolationConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3InterpolationConfig": "H3 Interpolation Config"}
