import ast
import importlib.util
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
spec = importlib.util.spec_from_file_location("local_config", source.with_name("local_config.py"))
local_config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(local_config)


class LocalModelScanTest(unittest.TestCase):
    def test_only_explicit_scan_reads_model_directories(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            def new_scope():
                scope = {"Path": Path, "json": json, "CONFIG_PATH": root / "config.local.yml",
                         "read_config": local_config.read_config, "write_config": local_config.write_config}
                exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), scope)
                return scope
            scope = new_scope()
            local_config.write_config(scope["CONFIG_PATH"], "agent_prompt_directory", "templates")
            with patch.dict(sys.modules, {"folder_paths": types.SimpleNamespace(models_dir=temporary)}):
                for name, config in [("Qwen", {"model_type": "qwen3_vl"}),
                                     ("Florence", {"model_type": "florence2"})]:
                    folder = root / "prompt_generator" / name
                    folder.mkdir(parents=True)
                    (folder / "config.json").write_text(json.dumps(config), encoding="utf-8")
                with patch.object(Path, "iterdir", side_effect=AssertionError("automatic scan")):
                    self.assertEqual(scope["list_vl_models"](), [])
                self.assertEqual(scope["scan_vl_models"](), ["Qwen"])
                scope = new_scope()
                (root / "prompt_generator/Qwen/config.json").unlink()
                with patch.object(Path, "iterdir", side_effect=AssertionError("automatic rescan")):
                    names = scope["list_vl_models"]()
                    self.assertEqual(names, ["Qwen"])
                    names.clear()
                    self.assertEqual(scope["list_vl_models"](), ["Qwen"])
                self.assertEqual(scope["scan_vl_models"](), [])
                self.assertEqual(new_scope()["list_vl_models"](), [])
                self.assertEqual(local_config.read_config(scope["CONFIG_PATH"], "agent_prompt_directory", ""), "templates")


if __name__ == "__main__":
    unittest.main()
