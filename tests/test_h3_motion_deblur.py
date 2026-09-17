"""CPU integration with installed MatlowAI MAINodes; model/VAE inference is simulated."""
import importlib.util
import json
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

import torch

sys.path.insert(0, str(Path(__file__).resolve().parent))
from test_h3_video_generator import load_definitions


ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
import comfy.cli_args

comfy.cli_args.args.cpu = True
UPSTREAM = ROOT / "custom_nodes/ComfyUI-MAINodes/motion.py"


class Model:
    def clone(self):
        return Model()

    def remove_wrappers_with_key(self, *args):
        pass

    def get_model_object(self, name):
        return SimpleNamespace(sigmas=torch.linspace(0, 1, 1000))


@unittest.skipUnless(UPSTREAM.is_file(), "Install optional ComfyUI-MAINodes for its CPU integration tests")
class MotionDeblurTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("cap_test_mainodes_motion", UPSTREAM)
        cls.upstream = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.upstream)

    def setUp(self):
        self.calls = []
        self.model = Model()
        self.preview = Mock()
        self.preview.patch.side_effect = lambda model, *a, **kw: (model,)
        self.scope = load_definitions("cap_h3_video_generator.py", {
            "json": json, "torch": torch,
            "WrappersMP": SimpleNamespace(OUTER_SAMPLE="outer"),
            "CAP_ModelPreviewOverride": lambda: self.preview,
        })
        self.scope["_call"] = self.call
        self.node = self.scope["CAP_H3VideoGenerator"]()
        self.images = torch.arange(39, dtype=torch.float32)[:, None, None, None].expand(39, 2, 2, 3).clone()
        self.positive = [["embedding", {"minimax_frame_count": 39,
            "minimax_keyframes": [{"resolved_frame_index": 0, "latent": "first"},
                                  {"resolved_frame_index": 38, "latent": "last"}],
            "minimax_refs": [{"kind": "audio", "latent": "reference"}]}]]
        self.samples = {"samples": torch.rand(1, 24, 12, 2, 2, generator=torch.Generator().manual_seed(5))}

    def call(self, name, records, **kw):
        self.calls.append((name, kw))
        if name in ("H3JerkOracle", "H3TimeSmear", "H3ExactRecover", "H3AudioSmear", "H3V2VInit", "H3InjectSchedule"):
            cls = getattr(self.upstream, name)
            return getattr(cls(), cls.FUNCTION)(**kw)
        if name == "VAEEncode":
            self.smeared = kw["pixels"].clone()
            length = self.smeared.shape[0]
            return ({"samples": torch.zeros(1, 24, (length - 5) // 17 * 5 + 2, 2, 2)},)
        if name == "VAEEncodeAudio":
            audio = kw["audio"]
            ticks = round(audio["waveform"].shape[-1] / audio["sample_rate"] * 40)
            return ({"samples": torch.zeros(1, 32, 2, ticks)},)
        if name in ("MiniMaxH3SigmaShift", "ModelAttentionBackend"):
            return (self.model,)
        if name == "BasicGuider":
            return (kw,)
        if name == "KSamplerSelect":
            return ("sampler",)
        if name == "SamplerCustomAdvanced":
            return "repaired", "denoised"
        if name == "VAEDecode":
            return (self.smeared + 100,)
        raise AssertionError(name)

    def repair(self, **overrides):
        args = dict(base_model=self.model, positive=self.positive, samples=self.samples,
                    images=self.images, audio=None, vae="vae", audio_vae="audio_vae", noise="noise",
                    trim_frames=0, strict_keyframes=False, attention="keep", records={},
                    preview_id=None, preview_tiny_vae="none", fps=24)
        args.update(overrides)
        return self.node._deblur_clip(**args)

    def test_real_oracle_smear_init_schedule_and_recovery(self):
        result = self.repair(preview_id="1::h3:clip", attention="pytorch attention")
        torch.testing.assert_close(result, self.images + 100)
        smear = next(kw for name, kw in self.calls if name == "H3TimeSmear")
        self.assertFalse(smear["expand_to_end"])
        sample = next(kw for name, kw in self.calls if name == "SamplerCustomAdvanced")
        self.assertEqual(len(sample["sigmas"]), 13)
        self.assertEqual(sample["noise"], "noise")
        latent = sample["latent_image"]["samples"]
        self.assertEqual(len(latent.tensors), 2)
        self.assertEqual(self.preview.patch.call_args.args[4], self.smeared.shape[0])
        cond = sample["guider"]["conditioning"][0][1]
        self.assertEqual(cond["minimax_frame_count"], self.smeared.shape[0])
        self.assertEqual(cond["minimax_keyframes"][1]["resolved_frame_index"], self.smeared.shape[0] - 1)
        self.assertEqual(self.positive[0][1]["minimax_frame_count"], 39)
        self.assertEqual(self.positive[0][1]["minimax_keyframes"][1]["resolved_frame_index"], 38)
        self.assertEqual(cond["minimax_refs"], self.positive[0][1]["minimax_refs"])

    def test_strict_endpoints_keep_original_pixels(self):
        result = self.repair(strict_keyframes=True)
        torch.testing.assert_close(result[[0, -1]], self.images[[0, -1]])
        torch.testing.assert_close(result[1:-1], self.images[1:-1] + 100)

    def test_context_prefix_is_not_stretched_and_keeps_original_pixels(self):
        self.positive[0][1]["minimax_keyframes"] = [
            {"resolved_frame_index": 0, "motion_context_index": 18, "latent": "context"}]
        result = self.repair(trim_frames=22)
        torch.testing.assert_close(result[:22], self.images[:22])
        torch.testing.assert_close(result[22:], self.images[22:] + 100)
        smear = next(kw for name, kw in self.calls if name == "H3TimeSmear")
        self.assertEqual(json.loads(smear["hold_map"])["holds"][:22], [1] * 22)
        guider = next(kw for name, kw in self.calls if name == "BasicGuider")
        self.assertEqual(guider["conditioning"][0][1]["minimax_keyframes"][0]["motion_context_index"], 18)

    def test_audio_seed_uses_h3_clock_and_preserves_baseline_audio(self):
        audio = {"sample_rate": 32000, "waveform": torch.sin(torch.arange(52000) * 0.1)[None, None]}
        before = audio["waveform"].clone()
        self.repair(audio=audio, fps=30)
        smear = next(kw for name, kw in self.calls if name == "H3AudioSmear")
        self.assertEqual(smear["fps"], 24)
        init = next(kw for name, kw in self.calls if name == "H3V2VInit")
        self.assertEqual(init["audio_strength"], 0.5)
        self.assertIsNotNone(init["audio_latent"])
        torch.testing.assert_close(audio["waveform"], before)

    def test_bad_recovery_length_fails_instead_of_shifting_timeline(self):
        call = self.call
        self.scope["_call"] = lambda name, records, **kw: (self.images[:-1],) if name == "H3ExactRecover" else call(name, records, **kw)
        with self.assertRaisesRegex(RuntimeError, "frame count"):
            self.repair()

if __name__ == "__main__":
    unittest.main()
