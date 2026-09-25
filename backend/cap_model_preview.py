"""Loop-safe adapter for KJNodes' sampling preview; no upstream patches."""
import folder_paths
import nodes
from comfy.cli_args import args
from comfy.patcher_extension import WrappersMP
from comfy_api.latest import io


def _sample_without_compiler(executor, *sample_args, **sample_kwargs):
    # Avoid malloc-graph teardown on the Tiny VAE preview interruption path.
    previous = args.disable_comfy_compiler
    args.disable_comfy_compiler = True
    try:
        return executor(*sample_args, **sample_kwargs)
    finally:
        args.disable_comfy_compiler = previous


class CAP_ModelPreviewOverride:
    CATEGORY = "Capricorncd/Video"
    FUNCTION = "patch"
    RETURN_TYPES = ("MODEL",)
    RETURN_NAMES = ("model",)
    DOC_SLUG = "model-preview-override"
    DESCRIPTION = (
        "Requires ComfyUI-KJNodes (ModelPreviewOverrideKJ). Reuses its preview engine, "
        "mapping loop execution IDs to the original display node so later iterations keep updating. "
        "Use this instead of the original Model Preview Override in for-loop workflows. "
        "Tiny VAE previews disable the Comfy model compiler during sampling to mitigate interrupt crashes."
    )

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model": ("MODEL",),
                "max_resolution": ("INT", {"default": 1024, "min": 0, "max": 8192, "step": 8,
                    "tooltip": "Maximum preview side; 0 keeps the sampling resolution."}),
                "jpeg_quality": ("INT", {"default": 80, "min": 30, "max": 100}),
                "suppress_default_preview": ("BOOLEAN", {"default": True}),
                "preview_frames": ("INT", {"default": 1, "min": 1, "max": 1024,
                    "tooltip": "Use more than 1 frame for animated video previews; decoder support is required."}),
                "preview_fps": ("INT", {"default": 12, "min": 1, "max": 60}),
            },
            "optional": {
                "vae": ("VAE",),
                "tiny_vae": (["none"] + folder_paths.get_filename_list("vae_approx"), {"default": "none"}),
            },
            "hidden": {"unique_id": "UNIQUE_ID", "dynprompt": "DYNPROMPT"},
        }

    def patch(self, model, max_resolution, jpeg_quality, suppress_default_preview,
              preview_frames, preview_fps, vae=None, tiny_vae="none", unique_id=None, dynprompt=None):
        upstream = nodes.NODE_CLASS_MAPPINGS.get("ModelPreviewOverrideKJ")
        if upstream is None:
            raise RuntimeError("Cap Model Preview Override requires ComfyUI-KJNodes with ModelPreviewOverrideKJ. Install/update KJNodes and restart ComfyUI.")
        display_id = dynprompt.get_display_node_id(unique_id) if dynprompt is not None else unique_id
        # ComfyUI's execution-local class clone avoids mutating the upstream class
        # or retaining the dynamic graph on the cached model wrapper.
        preview = upstream.PREPARE_CLASS_CLONE({"hidden_inputs": {io.Hidden.unique_id: display_id}})
        output = preview.execute(model, max_resolution, jpeg_quality, suppress_default_preview,
                                 preview_frames, preview_fps, vae, tiny_vae)
        patched_model, = output.args
        key = "cap_tiny_preview_no_compiler"
        patched_model.remove_wrappers_with_key(WrappersMP.OUTER_SAMPLE, key)
        if tiny_vae != "none":
            patched_model.add_wrapper_with_key(WrappersMP.OUTER_SAMPLE, key, _sample_without_compiler)
        return (patched_model,)


NODE_CLASS_MAPPINGS = {"CAP_ModelPreviewOverride": CAP_ModelPreviewOverride}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_ModelPreviewOverride": "Cap Model Preview Override"}
