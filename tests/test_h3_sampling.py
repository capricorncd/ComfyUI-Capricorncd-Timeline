"""CPU contracts against the installed upstream HyperFlow schedule node."""
import importlib.util
from pathlib import Path
import sys
from types import SimpleNamespace
import unittest

import torch

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT))
import comfy.cli_args
comfy.cli_args.args.cpu = True


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


sampling = load_module("cap_sampling_test", Path(__file__).resolve().parents[1] / "backend/h3_sampling.py")
UPSTREAM = ROOT / "custom_nodes/ComfyUI-HyperFlow-Flash/__init__.py"


class ConfigTests(unittest.TestCase):
    def test_v3_config_socket_and_defaults(self):
        schema = sampling.CAP_H3HyperFlowConfig.define_schema()
        self.assertEqual(schema.node_id, "CAP_H3HyperFlowConfig")
        sampling.CAP_H3HyperFlowConfig.FINALIZE_SCHEMA()
        self.assertEqual(sampling.CAP_H3HyperFlowConfig.RETURN_TYPES, ["CAP_H3_SAMPLING_CONFIG"])
        self.assertEqual(sampling.CAP_H3HyperFlowConfig.INPUT_TYPES()["required"]["steps"][1]["options"], ["4", "6", "8"])
        result = sampling.CAP_H3HyperFlowConfig.execute()
        self.assertEqual(result.args, (dict(kind="hyperflow", steps=6, refine_start_step=2),))
        self.assertIsInstance(sampling.sampling_strategy(result.args[0], "8", "unused"), sampling.HyperFlowSampling)

    def test_disabled_config_ignores_unused_parameters(self):
        result = sampling.CAP_H3HyperFlowConfig.execute(steps="bad", refine_start_step=100, enabled=False)
        self.assertEqual(result.args, (None,))
        self.assertIsInstance(sampling.sampling_strategy(None, "8", "1,0"), sampling.H3Sampling)


@unittest.skipUnless(UPSTREAM.is_file(), "Install ComfyUI-HyperFlow-Flash for upstream schedule tests")
class UpstreamScheduleTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.upstream = load_module("cap_upstream_hyperflow_test", UPSTREAM)
        cls.loader = sys.modules["cap_upstream_hyperflow_test.loader_nodes"]

    def setUp(self):
        self.model = SimpleNamespace(model=SimpleNamespace(diffusion_model=SimpleNamespace()))
        self.calls = []

    def call(self, name, records, **inputs):
        self.calls.append((name, inputs))
        cls = self.upstream.NODE_CLASS_MAPPINGS[name]
        return getattr(cls(), cls.FUNCTION)(**inputs)

    def test_all_step_grids_match_upstream_and_end_at_zero(self):
        for steps in (4, 6, 8):
            with self.subTest(steps=steps):
                strategy = sampling.HyperFlowSampling(steps)
                actual = strategy.primary_sigmas(self.call, {}, self.model, object())
                torch.testing.assert_close(actual, self.loader.step_sigmas(steps), rtol=0, atol=0)
                self.assertEqual(len(actual), steps + 1)
                self.assertEqual(actual[-1].item(), 0)
                self.assertTrue(torch.all(actual[:-1] > actual[1:]))
                self.assertIs(self.calls[-1][1]["model"], self.model)

    def test_six_steps_preserves_checkpoint_schedule(self):
        saved = torch.tensor([1., .8, .4, 0.])
        self.model.model.diffusion_model.hyperflow_sigmas = saved
        actual = sampling.HyperFlowSampling().primary_sigmas(self.call, {}, self.model)
        torch.testing.assert_close(actual, saved)
        self.assertNotEqual(actual.data_ptr(), saved.data_ptr())

    def test_refine_and_face_passes_use_upstream_schedule_tails(self):
        for steps in (4, 6, 8):
            strategy = sampling.HyperFlowSampling(steps, refine_start_step=2)
            expected = self.loader.step_sigmas(steps)
            torch.testing.assert_close(strategy.refine_sigmas(self.call, {}, self.model), expected[2:])
            torch.testing.assert_close(strategy.face_sigmas(self.call, {}, self.model, .5), expected[-steps // 2 - 1:])


if __name__ == "__main__":
    unittest.main()
