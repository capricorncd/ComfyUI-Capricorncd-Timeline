"""Audio refinement settings for H3 Video Generator."""


class CAP_H3AudioRefineConfig:
    CATEGORY = "Capricorncd/MiniMaxH3"
    FUNCTION = "configure"
    RETURN_TYPES = ("CAP_H3_AUDIO_REFINE_CONFIG",)
    RETURN_NAMES = ("audio_refine_config",)
    DESCRIPTION = "Configure audio repair in H3 Video Generator. Cache off avoids the frozen-video cache build; audio repair still runs."

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "steps": ("INT", {"default": 3, "min": 1, "max": 12}),
            "audio_denoise": ("FLOAT", {"default": 0.5, "min": 0.01, "max": 1.0, "step": 0.01}),
            "cache_mode": (["off", "auto", "ram", "vram"], {"default": "off", "tooltip": "off skips frozen-video caching while keeping audio repair enabled."}),
            "enabled": ("BOOLEAN", {"default": True}),
        }}

    def configure(self, steps=3, audio_denoise=0.5, cache_mode="off", enabled=True):
        if not enabled:
            return (None,)
        return ({"steps": steps, "audio_denoise": audio_denoise, "cache_mode": cache_mode},)


NODE_CLASS_MAPPINGS = {"CAP_H3AudioRefineConfig": CAP_H3AudioRefineConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3AudioRefineConfig": "H3 Audio Refine Config"}
