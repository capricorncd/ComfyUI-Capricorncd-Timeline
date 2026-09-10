import ast
import importlib.util
from pathlib import Path
import sys
import types
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]


class BackendLayoutTests(unittest.TestCase):
    def test_entry_point_exports_without_changing_web_root(self):
        name = "timeline_layout_test"
        backend = types.ModuleType(name + ".backend")
        backend.NODE_CLASS_MAPPINGS = {"test": object()}
        backend.NODE_DISPLAY_NAME_MAPPINGS = {"test": "Test"}
        spec = importlib.util.spec_from_file_location(name, ROOT / "__init__.py", submodule_search_locations=[str(ROOT)])
        package = importlib.util.module_from_spec(spec)
        with patch.dict(sys.modules, {name: package, name + ".backend": backend}):
            spec.loader.exec_module(package)
        self.assertIs(package.NODE_CLASS_MAPPINGS, backend.NODE_CLASS_MAPPINGS)
        self.assertIs(package.NODE_DISPLAY_NAME_MAPPINGS, backend.NODE_DISPLAY_NAME_MAPPINGS)
        self.assertEqual((ROOT / package.WEB_DIRECTORY).resolve(), ROOT / "js")

    def test_relative_imports_resolve_in_backend(self):
        self.assertEqual([p.name for p in ROOT.glob("*.py")], ["__init__.py"])
        for path in (ROOT / "backend").glob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            for node in ast.walk(tree):
                if isinstance(node, ast.ImportFrom) and node.level == 1 and node.module:
                    target = path.parent / (node.module.replace(".", "/") + ".py")
                    self.assertTrue(target.is_file(), f"{path.name}: {node.module}")


if __name__ == "__main__":
    unittest.main()
