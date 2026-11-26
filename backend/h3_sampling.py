"""Sampling schedules for the shared H3 clip generation pipeline."""
import math

from comfy_api.latest import io


class H3Sampling:
    nodes = ("BasicScheduler",)
    refine_nodes = ("ManualSigmas",)
    audio_refine_requires_base = False

    def __init__(self, steps, refine_sigmas):
        if str(steps) not in ("4", "8"):
            raise ValueError("H3 steps must be 4 or 8.")
        self.steps = int(steps)
        self.refine_schedule = refine_sigmas
        self.settings = dict(kind="h3", steps=self.steps, refine_sigmas=refine_sigmas)

    def validate_refine(self):
        sigmas = [float(v.strip()) for v in self.refine_schedule.split(",")]
        if len(sigmas) < 2 or sigmas[-1] != 0 or any(not math.isfinite(v) or v < 0 for v in sigmas) or any(a <= b for a, b in zip(sigmas, sigmas[1:])):
            raise ValueError("Refine sigmas must strictly decrease and end at 0.")

    def primary_sigmas(self, call, records, model, base_model):
        sigmas, = call("BasicScheduler", records, model=base_model, scheduler="simple", steps=self.steps, denoise=1.0)
        return sigmas

    def refine_sigmas(self, call, records, model):
        sigmas, = call("ManualSigmas", records, sigmas=self.refine_schedule)
        return sigmas

    def face_sigmas(self, call, records, model, denoise):
        sigmas, = call("BasicScheduler", records, model=model, scheduler="simple", steps=self.steps, denoise=denoise)
        return sigmas


class HyperFlowSampling(H3Sampling):
    nodes = ("HyperFlowSigmas",)
    refine_nodes = ()
    audio_refine_requires_base = True

    def __init__(self, steps=6, refine_start_step=2):
        if type(steps) is not int or steps not in (4, 6, 8):
            raise ValueError("HyperFlow steps must be 4, 6 or 8.")
        if type(refine_start_step) is not int or not 0 <= refine_start_step < steps:
            raise ValueError("HyperFlow refine_start_step must be smaller than steps.")
        self.steps = steps
        self.refine_start_step = refine_start_step
        self.settings = dict(kind="hyperflow", steps=steps, refine_start_step=refine_start_step)

    def validate_refine(self):
        # The second pass uses a tail of the upstream schedule, never manual H3 sigmas.
        pass

    def primary_sigmas(self, call, records, model, base_model=None):
        sigmas, = call("HyperFlowSigmas", records, model=model, steps=self.steps)
        return sigmas

    def refine_sigmas(self, call, records, model):
        return self.primary_sigmas(call, records, model)[self.refine_start_step:]

    def face_sigmas(self, call, records, model, denoise):
        count = max(1, math.ceil(self.steps * denoise))
        return self.primary_sigmas(call, records, model)[-count - 1:]


def sampling_strategy(config, steps, refine_sigmas):
    if config is None:
        return H3Sampling(steps, refine_sigmas)
    if not isinstance(config, dict) or set(config) != {"kind", "steps", "refine_start_step"} or config["kind"] != "hyperflow":
        raise ValueError("Connect H3 HyperFlow Config to sampling_config.")
    return HyperFlowSampling(config["steps"], config["refine_start_step"])


class CAP_H3HyperFlowConfig(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(
            node_id="CAP_H3HyperFlowConfig",
            display_name="H3 HyperFlow Config",
            category="Capricorncd/MiniMaxH3",
            description="Connect to H3 Video Generator sampling_config and load the model with HyperFlow Loader. Overrides the generator's steps and refine_sigmas. Requires ComfyUI-HyperFlow-Flash.",
            inputs=[
                io.Combo.Input("steps", options=["4", "6", "8"], default="6"),
                io.Int.Input("refine_start_step", default=2, min=0, max=7,
                             tooltip="Second sampling starts at this zero-based step of the selected HyperFlow schedule. Must be smaller than steps. Higher skips more noise and changes less."),
                io.Boolean.Input("enabled", default=True),
            ],
            outputs=[io.Custom("CAP_H3_SAMPLING_CONFIG").Output(display_name="sampling_config")],
        )

    @classmethod
    def execute(cls, steps="6", refine_start_step=2, enabled=True):
        config = HyperFlowSampling(int(steps), refine_start_step).settings if enabled else None
        return io.NodeOutput(config)


NODE_CLASS_MAPPINGS = {"CAP_H3HyperFlowConfig": CAP_H3HyperFlowConfig}
NODE_DISPLAY_NAME_MAPPINGS = {"CAP_H3HyperFlowConfig": "H3 HyperFlow Config"}
