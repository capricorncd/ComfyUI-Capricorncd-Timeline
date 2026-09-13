import ast
import json
import math
from pathlib import Path
import runpy
import unittest


ROOT = Path(__file__).resolve().parents[1]
module = runpy.run_path(str(ROOT / "backend" / "cap_size_settings.py"))
Node = module["CAP_SizeFromMegapixels"]


class SizeMegapixelsTests(unittest.TestCase):
    def test_dimensions_and_alignment(self):
        node = Node()
        self.assertEqual(node.execute(1920, 1080, 1.0)[:2], (1376, 768))
        self.assertEqual(node.execute(1080, 1920, 1.0)[:2], (768, 1376))
        self.assertEqual(node.execute(1920, 1080, 0.2)[:2], (608, 352))
        self.assertEqual(Node.INPUT_TYPES()["required"]["multiple"][1]["default"], 32)
        for width, height in [(1920,1080), (1080,1920), (865,481), (1000,1000)]:
            for mp in [0.01, 0.2, 1.0, 4.0]:
                self.assertTrue(all(dimension % 32 == 0 for dimension in node.execute(width, height, mp)[:2]))
        self.assertEqual(node.execute(1920, 1080, 0.2, 16)[:2], (608, 336))
        self.assertEqual(node.execute(864, 480, 0.2, 16)[:2], (608, 336))
        self.assertEqual(node.execute(480, 480, 1.0, 32)[:2], (1024, 1024))
        self.assertEqual(node.execute(512, 512, 4.0)[:2], (2048, 2048))
        self.assertEqual(node.execute(864, 480, 864 * 480 / (1024 * 1024))[:2], (864, 480))
        width, height = node.execute(1, 16384, 0.01, 128)[:2]
        self.assertGreaterEqual(width, 128)
        self.assertGreaterEqual(height, 128)

    def test_matches_local_resolution_selector(self):
        # Run the installed reference calculation without importing GPU modules.
        reference = ROOT.parents[1] / "comfy_extras" / "nodes_resolution.py"
        tree = ast.parse(reference.read_text(encoding="utf-8-sig"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "ResolutionSelector")
        execute = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        execute.decorator_list = []
        scope = {"math": math}
        exec(compile("from __future__ import annotations", "<annotations>", "exec"), scope)
        class IO:
            NodeOutput = staticmethod(lambda *args: args)
        scope["io"] = IO
        for width, height in [(1920,1080), (1080,1920), (1024,1024), (800,600), (864,480)]:
            scope["ASPECT_RATIOS"] = {"input": (width, height)}
            exec(compile(ast.Module(body=[execute], type_ignores=[]), str(reference), "exec"), scope)
            for mp in [0.01, 0.2, 1.0, 4.0, 16.0]:
                for multiple in [8, 16, 32, 64, 128]:
                    expected = scope["execute"](None, "input", mp, multiple)
                    expected = tuple(max(multiple, value) for value in expected)
                    self.assertEqual(Node().execute(width, height, mp, multiple)[:2], expected)

    def test_invalid_inputs(self):
        for args in [(0,1080,1,8), (1920,-1,1,8), (1920,1080,0,8),
                     (1920,1080,float("nan"),8), (1920,1080,float("inf"),8), (1920,1080,1,0)]:
            with self.assertRaises(ValueError):
                Node().execute(*args)

    def test_parameter_outputs(self):
        for mp, multiple in [(0.2,32), (1.0,16), (4,64)]:
            width, height, target_mp, alignment = Node().execute(1920, 1080, mp, multiple)
            self.assertEqual((target_mp, alignment), (mp, multiple))
            self.assertIsInstance(target_mp, float)
            self.assertIsInstance(alignment, int)
            self.assertEqual(width % alignment, 0)
            self.assertEqual(height % alignment, 0)

    def test_registration_and_translations(self):
        self.assertIs(module["NODE_CLASS_MAPPINGS"]["CAP_SizeFromMegapixels"], Node)
        self.assertEqual(Node.RETURN_TYPES, ("INT", "INT", "FLOAT", "INT"))
        self.assertEqual(Node.RETURN_NAMES, ("width", "height", "megapixels", "multiple"))
        self.assertEqual(set(Node.INPUT_TYPES()["required"]), {"width", "height", "megapixels", "multiple"})
        for name in ("width", "height"):
            input_type, options = Node.INPUT_TYPES()["required"][name]
            self.assertEqual(input_type, "INT")
            self.assertTrue(options["forceInput"])
        self.assertNotIn("forceInput", Node.INPUT_TYPES()["required"]["megapixels"][1])
        for lang in ["en", "zh", "ja"]:
            data = json.loads((ROOT / "locales" / lang / "nodeDefs.json").read_text(encoding="utf-8-sig"))
            self.assertEqual(set(data["CAP_SizeFromMegapixels"]["inputs"]), set(Node.INPUT_TYPES()["required"]))
            self.assertEqual(set(data["CAP_SizeFromMegapixels"]["outputs"]), set(Node.RETURN_NAMES))
        self.assertEqual(module["CAP_SizeSettings"]().execute("", 1, True, "", 720, 1280, 24, 1),
                         (720, 1280, 1, 24.0, 24))


if __name__ == "__main__":
    unittest.main()
