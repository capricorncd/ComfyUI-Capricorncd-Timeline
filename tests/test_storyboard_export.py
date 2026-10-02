import ast
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import unittest
import zipfile
from datetime import datetime


SOURCE = Path(__file__).resolve().parents[1] / "backend" / "cap_timeline_project_io.py"
tree = ast.parse(SOURCE.read_text(encoding="utf-8-sig"))
names = {"parse_storyboard_document", "read_storyboard_from_zip", "build_export_zip_bytes", "save_project_export", "_safe_name", "import_project_from_zip_bytes"}
scope = {"io": io, "json": json, "os": os, "re": re, "shutil": shutil, "zipfile": zipfile, "datetime": datetime,
         "PACKAGE_MEDIA_ROOT": "media", "PACKAGE_GENERATED_SUBDIR": "generated",
         "iter_project_media": lambda project: [], "_iter_clips": lambda project: [],
         "_remap_project_files": lambda project, *args: project,
         "PACKAGE_PROJECT_NAME": "project.json", "PACKAGE_STORYBOARD_NAME": "storyboard.json", "STORYBOARD_SCHEMA_VERSION": 1,
         "build_export_entries": lambda project, **kwargs: ({k: v for k, v in project.items() if k not in {"storyboards", "prompt_history"}}, [], [])}
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in names], type_ignores=[]), str(SOURCE), "exec"), scope)


class StoryboardExportTests(unittest.TestCase):
    def test_prompt_history_roundtrip_and_absent_file(self):
        history = {"schema_version": 1, "items": [{"id": "h1", "text": "你好", "created_at": "2026-10-02T00:00:00Z"}]}
        project = {"name": "test", "tracks": [], "media": [], "prompt_history": history}
        data, _, _ = scope["build_export_zip_bytes"](project)
        restored, _ = scope["import_project_from_zip_bytes"](data)
        self.assertEqual(restored["prompt_history"], history)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertNotIn("prompt_history", json.loads(archive.read("project.json")))
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("project.json", json.dumps({"tracks": []}))
        restored, _ = scope["import_project_from_zip_bytes"](buffer.getvalue())
        self.assertEqual(restored["prompt_history"], {"schema_version": 1, "items": []})
        with tempfile.TemporaryDirectory() as root:
            path, _ = scope["save_project_export"](project, root, "directory")
            self.assertEqual(json.loads((Path(path) / "prompt_history.json").read_text(encoding="utf-8")), history)

    def setUp(self):
        self.document = {"schema_version": 1, "shots": [{"id": "s1", "title": "尝汤", "duration": 15.5, "image_id": "image-1", "source_clip_id": "clip-1"}]}
        self.project = {"name": "工程", "media": [], "tracks": []}

    def test_zip_roundtrip_without_workflow(self):
        data, _, _ = scope["build_export_zip_bytes"](self.project, storyboard=self.document)
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertEqual(set(archive.namelist()), {"project.json", "storyboard.json", "prompt_history.json"})
            self.assertEqual(json.loads(archive.read("prompt_history.json")), {"schema_version": 1, "items": []})
            self.assertEqual(json.loads(archive.read("project.json")), self.project)
            self.assertEqual(json.loads(archive.read("storyboard.json")), self.document)
        self.assertEqual(scope["read_storyboard_from_zip"](data), self.document)

    def test_disk_directory_and_zip(self):
        with tempfile.TemporaryDirectory() as root:
            for kind in ("directory", "zip"):
                path, _ = scope["save_project_export"](self.project, root, kind, storyboard=self.document)
                if kind == "directory":
                    self.assertEqual(json.loads((Path(path) / "storyboard.json").read_text(encoding="utf-8")), self.document)
                else:
                    self.assertEqual(scope["read_storyboard_from_zip"](Path(path).read_bytes()), self.document)

    def test_legacy_and_nested_packages(self):
        for prefix in ("", "folder/"):
            buffer = io.BytesIO()
            with zipfile.ZipFile(buffer, "w") as archive:
                archive.writestr(prefix + "project.json", json.dumps({**self.project, "storyboards": self.document["shots"]}))
            self.assertEqual(scope["read_storyboard_from_zip"](buffer.getvalue()), self.document)
        data, _, _ = scope["build_export_zip_bytes"]({**self.project, "storyboards": self.document["shots"]})
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            self.assertNotIn("storyboards", json.loads(archive.read("project.json")))
        self.assertEqual(scope["read_storyboard_from_zip"](data), self.document)

    def test_unknown_version_is_not_written_or_imported(self):
        invalid = {"schema_version": 2, "shots": []}
        with tempfile.TemporaryDirectory() as root:
            with self.assertRaisesRegex(ValueError, "schema_version"):
                scope["save_project_export"](self.project, root, "directory", storyboard=invalid)
            self.assertEqual(list(Path(root).iterdir()), [])
        with self.assertRaises(ValueError):
            scope["build_export_zip_bytes"](self.project, storyboard=invalid)
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, "w") as archive:
            archive.writestr("project.json", json.dumps(self.project))
            archive.writestr("storyboard.json", json.dumps(invalid))
        with self.assertRaises(ValueError):
            scope["read_storyboard_from_zip"](buffer.getvalue())
        for invalid in ({}, {"schema_version": True, "shots": []}, {"schema_version": 1, "shots": [None]}):
            with self.assertRaises(ValueError):
                scope["parse_storyboard_document"](invalid)


if __name__ == "__main__":
    unittest.main()
