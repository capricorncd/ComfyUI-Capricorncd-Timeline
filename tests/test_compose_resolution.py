import ast
from pathlib import Path
import unittest


source = Path(__file__).resolve().parents[1] / "cap_compose_timeline_export.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
scope = {}
exec(compile(ast.Module(body=[
    node for node in tree.body
    if isinstance(node, ast.FunctionDef) and node.name in ("_even_dim", "_compose_size")
], type_ignores=[]), str(source), "exec"), scope)
size = scope["_compose_size"]


class ComposeResolutionTests(unittest.TestCase):
    def test_project_default(self):
        self.assertEqual(size(864, 480, "project"), (864, 480))

    def test_landscape_portrait_square(self):
        for preset, short in (("720p", 720), ("1080p", 1080), ("2k", 1440)):
            self.assertEqual(size(864, 480, preset), (round(short * 1.8), short))
            self.assertEqual(size(480, 864, preset), (short, round(short * 1.8)))
            self.assertEqual(size(480, 480, preset), (short, short))

    def test_invalid_and_even(self):
        with self.assertRaises(ValueError):
            size(864, 480, "invalid")
        self.assertEqual(size(865, 481, "project"), (864, 480))


if __name__ == "__main__":
    unittest.main()
