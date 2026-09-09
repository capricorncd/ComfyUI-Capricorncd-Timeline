import ast
import io
import json
from pathlib import Path
import tempfile
import unittest
import zipfile


source = Path(__file__).resolve().parents[1] / "cap_timeline_project_io.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "build_export_zip_bytes")


class ExportWorkflowTests(unittest.TestCase):
    def test_workflow_and_legacy_package(self):
        project = {"name": "工程", "tracks": []}
        workflow = {"version": 0.4, "nodes": [{"id": 1, "widgets_values": ["中文"]}], "links": []}
        with tempfile.TemporaryDirectory() as directory:
            asset = Path(directory) / "asset.txt"
            asset.write_bytes(b"unchanged asset")
            scope = {
                "io": io, "json": json, "zipfile": zipfile, "PACKAGE_PROJECT_NAME": "project.json",
                "_safe_name": lambda name, default: name or default,
                "build_export_entries": lambda p: (p, [{"src_path": str(asset), "arcname": "media/asset.txt"}], []),
            }
            exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), scope)
            export = scope["build_export_zip_bytes"]
            for snapshot in (None, workflow):
                blob, filename, missing = export(project, workflow=snapshot)
                self.assertEqual(filename, "工程.zip")
                self.assertEqual(missing, [])
                with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                    self.assertEqual(json.loads(archive.read("project.json")), project)
                    self.assertEqual(archive.read("media/asset.txt"), b"unchanged asset")
                    self.assertEqual("workflow.json" in archive.namelist(), snapshot is not None)
                    if snapshot is not None:
                        self.assertEqual(json.loads(archive.read("workflow.json")), snapshot)


if __name__ == "__main__":
    unittest.main()
