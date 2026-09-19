import ast
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


source = Path(__file__).resolve().parents[1] / "backend/cap_clip_prompt_vl.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef)
             and node.name in {"list_vl_models", "scan_vl_models"}]


class LocalModelScanTest(unittest.TestCase):
    def test_only_explicit_scan_reads_model_directories(self):
        scope = {"Path": Path, "json": json, "_VL_MODEL_NAMES": []}
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), scope)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            with patch.dict(sys.modules, {"folder_paths": types.SimpleNamespace(models_dir=temporary)}):
                for name, config in [("Qwen", {"model_type": "qwen3_vl"}),
                                     ("Florence", {"model_type": "florence2"})]:
                    folder = root / "prompt_generator" / name
                    folder.mkdir(parents=True)
                    (folder / "config.json").write_text(json.dumps(config), encoding="utf-8")
                with patch.object(Path, "iterdir", side_effect=AssertionError("automatic scan")):
                    self.assertEqual(scope["list_vl_models"](), [])
                self.assertEqual(scope["scan_vl_models"](), ["Qwen"])
                (root / "prompt_generator/Qwen/config.json").unlink()
                with patch.object(Path, "iterdir", side_effect=AssertionError("automatic rescan")):
                    names = scope["list_vl_models"]()
                    self.assertEqual(names, ["Qwen"])
                    names.clear()
                    self.assertEqual(scope["list_vl_models"](), ["Qwen"])
                self.assertEqual(scope["scan_vl_models"](), [])


if __name__ == "__main__":
    unittest.main()
