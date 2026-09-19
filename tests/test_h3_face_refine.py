"""CPU integration with Carasibana's installed nodes; detector/model/VAE are simulated."""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import torch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import comfy.cli_args
comfy.cli_args.args.cpu = True
from comfy.nested_tensor import NestedTensor
import folder_paths
from test_h3_video_generator import load_definitions


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


config_module = load_module("cap_face_config_test", Path(__file__).resolve().parents[1] / "backend/cap_h3_face_refine.py")
UPSTREAM = ROOT / "custom_nodes/ComfyUI-H3-FaceRefine/nodes.py"


class ConfigTests(unittest.TestCase):
    def setUp(self):
        self.config = {key: opts["default"] for key, (_, opts) in config_module.CAP_H3FaceRefineConfig.INPUT_TYPES()["required"].items() if key != "enabled"}

    def test_standard_detector_directory_and_model(self):
        self.assertIn(str(ROOT / "models/ultralytics/bbox"), folder_paths.get_folder_paths("ultralytics_bbox"))
        self.assertNotIn(str(ROOT / "models/yolo"), folder_paths.get_folder_paths("ultralytics_bbox"))
        if (ROOT / "models/ultralytics/bbox/face_yolov8m.pt").is_file():
            self.assertEqual(self.config["detector"], "face_yolov8m.pt")
            self.assertEqual(config_module.validate_face_config(self.config), self.config)

    def test_rejects_forged_detector_paths_and_invalid_values(self):
        for key, value in (("detector", "../outside.pt"), ("detector", "C:/outside.pt"),
                           ("denoise", float("nan")), ("denoise", 1), ("canvas_size", 513),
                           ("select_index", True), ("select", "unsupported")):
            with self.subTest(key=key, value=value), self.assertRaises(ValueError):
                config_module.validate_face_config({**self.config, key: value})

    def test_configuration_does_not_load_or_require_a_detector(self):
        config = {**self.config, "detector": "none"}
        self.assertEqual(config_module.CAP_H3FaceRefineConfig().configure(**config), (config,))


class DisabledConfigTests(unittest.TestCase):
    def test_disabled_config_needs_no_detector(self):
        self.assertEqual(config_module.CAP_H3FaceRefineConfig().configure(enabled=False), (None,))


class Model:
    def __init__(self, patches=None):
        self.model = SimpleNamespace(scale_latent_inpaint=lambda **kw: kw["latent_image"])
        self.patches = dict(patches or {})

    def clone(self):
        return Model(self.patches)

    def add_object_patch(self, name, value):
        self.patches[name] = value

    def remove_wrappers_with_key(self, *args):
        pass


class Boxes:
    xyxy = torch.tensor([[20., 15., 42., 42.]])
    conf = torch.tensor([0.9])

    def __len__(self):
        return len(self.xyxy)


@unittest.skipUnless(UPSTREAM.is_file(), "Install optional H3-FaceRefine for CPU integration")
class FaceIntegrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = load_module("cap_face_upstream_test", UPSTREAM)

    def setUp(self):
        self.calls = []
        self.images = torch.rand(22, 64, 64, 3, generator=torch.Generator().manual_seed(5))
        self.audio = torch.ones(1, 32, 2, 36)
        self.samples = {"samples": NestedTensor((torch.zeros(1, 24, 7, 4, 4), self.audio))}
        self.config = {k: opts["default"] for k, (_, opts) in config_module.CAP_H3FaceRefineConfig.INPUT_TYPES()["required"].items() if k != "enabled"}
        self.config.update(canvas_size=512)
        self.scope = load_definitions("cap_h3_video_generator.py", {
            "WrappersMP": SimpleNamespace(OUTER_SAMPLE="outer"),
            "validate_face_config": lambda config: config,
        })
        self.scope["_call"] = self.call
        self.node = self.scope["CAP_H3VideoGenerator"]()
        self.positive = [["embedding", {"minimax_keyframes": ["fullframe"], "minimax_frame_count": 22,
            "minimax_refs": [{"motion_context_audio_end_frame": 22}, {"kind": "image"}]}]]
        self.bad_count = False

    def call(self, name, records, **kw):
        self.calls.append((name, kw))
        if name in config_module.FACE_NODES:
            cls = getattr(self.upstream, name)
            return getattr(cls(), cls.FUNCTION)(**kw)
        if name == "VAEEncode":
            self.crops = kw["pixels"]
            return ({"samples": torch.zeros(1, 24, 7, 32, 32)},)
        if name == "LTXVSeparateAVLatent":
            video, audio = kw["av_latent"]["samples"].unbind()
            return {"samples": video}, {"samples": audio}
        if name == "LTXVConcatAVLatent":
            return ({"samples": NestedTensor((kw["video_latent"]["samples"], kw["audio_latent"]["samples"]))},)
        if name in ("BasicScheduler", "BasicGuider", "KSamplerSelect"):
            return (kw,)
        if name == "SamplerCustomAdvanced":
            self.sampled = kw
            return kw["latent_image"], None
        if name == "VAEDecode":
            return (self.crops[:10] if self.bad_count else (self.crops + .1).clamp(0, 1),)
        raise AssertionError(name)

    def refine(self):
        detector = SimpleNamespace(predict=lambda *a, **kw: [SimpleNamespace(boxes=Boxes())])
        with patch.object(self.upstream, "_load_detector", return_value=detector):
            return self.node._refine_faces(Model(), self.positive, self.samples, self.images, "vae", "noise",
                4, self.config, 2, True, {}, None, "none", 24)

    def test_upstream_tracking_mask_stitch_and_protected_frames(self):
        result = self.refine()
        self.assertEqual(result.shape, self.images.shape)
        self.assertTrue(torch.equal(result[:2], self.images[:2]))
        self.assertTrue(torch.equal(result[-1], self.images[-1]))
        self.assertFalse(torch.equal(result[2:-1], self.images[2:-1]))
        latent = self.sampled["latent_image"]
        self.assertTrue(torch.equal(latent["samples"].unbind()[1], self.audio))
        self.assertEqual(torch.count_nonzero(latent["noise_mask"].unbind()[1]).item(), 0)
        guider = self.sampled["guider"]
        self.assertIn("scale_latent_inpaint", guider["model"].patches)
        self.assertIs(guider["model"], self.sampled["sigmas"]["model"])
        self.assertEqual(guider["conditioning"][0][1], {"minimax_refs": [{"kind": "image"}]})
        self.assertIn("minimax_keyframes", self.positive[0][1])

    def test_incorrect_decode_length_is_rejected_before_stitch(self):
        self.bad_count = True
        with self.assertRaisesRegex(RuntimeError, "frame count"):
            self.refine()
        self.assertFalse(any(name == "H3FaceStitch" for name, _ in self.calls))


if __name__ == "__main__":
    unittest.main()
