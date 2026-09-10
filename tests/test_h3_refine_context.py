import ast
from pathlib import Path
import unittest


SOURCE = (Path(__file__).resolve().parents[1] / "backend") / "cap_minimax_h3.py"
tree = ast.parse(SOURCE.read_text(encoding="utf-8"))
subset = ast.Module(body=[n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef))
                         and n.name in ("CAP_H3MotionContextRefine", "_snap_h3_grid")], type_ignores=[])


class H3RefineContextTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        class Context:
            def apply(self, conditioning, vae, latent, length, **kwargs):
                calls.append((conditioning, vae, latent, length, kwargs))
                return conditioning, length

        scope = {"_motion_context_cls": lambda: Context}
        exec(compile(subset, str(SOURCE), "exec"), scope)
        self.node = scope["CAP_H3MotionContextRefine"]()

    def test_first_clip_bypasses_without_loading_context(self):
        conditioning = [[None, {}]]
        self.assertIs(self.node.apply(conditioning, None, {}, 0)[0], conditioning)
        self.assertEqual(self.calls, [])

    def test_replaces_low_context_without_mutating_first_pass(self):
        head = {"motion_context_index": 0, "latent": "low-head"}
        end = {"motion_context_index": 157, "latent": "user-end-anchor"}
        ref = {"kind": "image", "latent": "user-reference"}
        audio = {"kind": "audio", "motion_context_audio_end_frame": 22, "audio_latent": "low-audio"}
        cond = [["embedding", {"minimax_keyframes": [head, end], "minimax_refs": [ref, audio], "minimax_frame_count": 158}]]
        current = {"samples": "current-upscaled-AV"}
        previous = {"samples": "previous-high-AV"}
        result, = self.node.apply(cond, "vae", current, 22, previous)
        self.assertEqual(result[0][1]["minimax_keyframes"], [end])
        self.assertEqual(result[0][1]["minimax_refs"], [ref])
        self.assertEqual(cond[0][1]["minimax_keyframes"], [head, end])
        self.assertEqual(cond[0][1]["minimax_refs"], [ref, audio])
        call = self.calls[0]
        self.assertIs(call[2], current)
        self.assertIs(call[4]["context_latent"], previous)
        self.assertEqual(call[4]["audio_context_length"], 0)
        self.assertEqual(result[0][1]["minimax_frame_count"], 158)

    def test_missing_or_invalid_context_fails(self):
        with self.assertRaisesRegex(ValueError, "missing previous high-resolution"):
            self.node.apply([], None, {}, 22, {"samples": None})
        with self.assertRaisesRegex(ValueError, "effective trim_frames"):
            self.node.apply([], None, {}, 23, {"samples": "AV"})
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
