import ast
import asyncio
import io
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import Mock
import uuid
import zipfile
from datetime import datetime
from urllib.parse import quote, unquote


source = (Path(__file__).resolve().parents[1] / "backend") / "cap_timeline_project_io.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "build_export_zip_bytes")


class ExportWorkflowTests(unittest.TestCase):
    def test_save_and_reveal_routes_only_accept_successful_local_exports(self):
        routes = ast.parse(source.with_name("__init__.py").read_text(encoding="utf-8-sig"))
        functions = [n for n in ast.walk(routes) if isinstance(n, ast.AsyncFunctionDef)
                     and n.name in {"api_export_save", "api_reveal_export"}]
        for function in functions:
            function.decorator_list = []
            function.body = [n for n in function.body if not isinstance(n, (ast.Import, ast.ImportFrom))]
        with tempfile.TemporaryDirectory() as directory:
            destination = Path(directory) / "package"
            destination.mkdir()
            (destination / "project.json").write_text("{}", encoding="utf-8")
            save = Mock(return_value=(str(destination), []))
            reveal = Mock()
            scope = {
                "web": SimpleNamespace(Request=object, Response=object,
                                       json_response=lambda body, status=200: (body, status)),
                "save_project_export": save, "asyncio": asyncio, "uuid": uuid,
                "os": SimpleNamespace(path=os.path), "subprocess": SimpleNamespace(Popen=reveal),
                "sys": SimpleNamespace(platform="win32"),
                "folder_paths": SimpleNamespace(get_output_directory=lambda: directory),
                "export_destinations": {}, "logging": SimpleNamespace(exception=Mock()),
            }
            exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), scope)
            class Request:
                remote = "127.0.0.1"
                content_type = "application/json"
                def __init__(self, payload):
                    self.payload = payload
                async def json(self):
                    return self.payload
            async def check():
                remote = Request({"project": {}})
                remote.remote = "192.168.1.4"
                self.assertEqual((await scope["api_export_save"](remote))[1], 403)
                self.assertEqual((await scope["api_reveal_export"](remote))[1], 403)
                text_request = Request({"project": {}})
                text_request.content_type = "text/plain"
                self.assertEqual((await scope["api_export_save"](text_request))[1], 403)
                save.assert_not_called()
                self.assertEqual((await scope["api_export_save"](Request({"project": []})))[1], 400)
                result, code = await scope["api_export_save"](Request({"project": {}, "directory": directory, "include_generated": False}))
                self.assertEqual(code, 200)
                save.assert_called_once_with({}, directory, "directory", None, include_generated=False)
                self.assertEqual((await scope["api_reveal_export"](Request({"path": directory})))[1], 404)
                reveal.assert_not_called()
                self.assertEqual((await scope["api_reveal_export"](Request({"reveal_token": result["reveal_token"]})))[1], 200)
                reveal.assert_called_once_with(["explorer", f"/select,{destination / 'project.json'}"])
                save.side_effect = OSError("Disk full")
                self.assertEqual((await scope["api_export_save"](Request({"project": {}})))[1], 500)
                self.assertEqual(len(scope["export_destinations"]), 1, "failed export must not enable folder reveal")
            asyncio.run(check())

    def disk_export(self, entries, missing=None):
        scope = {"os": os, "re": re, "shutil": shutil, "zipfile": zipfile, "json": json,
                 "datetime": datetime, "PACKAGE_PROJECT_NAME": "project.json"}
        scope["build_export_entries"] = lambda project, **options: (project, entries, missing or [])
        functions = [n for n in tree.body if isinstance(n, ast.FunctionDef)
                     and n.name in {"_safe_name", "save_project_export"}]
        exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), scope)
        return scope["save_project_export"]

    def test_disk_packages_and_repeated_exports(self):
        project = {"name": "仙宫有点忙·特别篇", "media": [{"file": "media/images/场景.png"}]}
        workflow = {"nodes": [{"id": 1}]}
        with tempfile.TemporaryDirectory() as directory:
            asset = Path(directory) / "source.png"
            asset.write_bytes(b"unchanged image bytes with metadata")
            root = Path(directory) / "export"
            root.mkdir()
            save = self.disk_export([{"src_path": str(asset), "arcname": "media/images/场景.png"}])
            for package_format in ("zip", "directory"):
                previous, _ = save(project, str(root), package_format, workflow)
                latest, missing = save(project, str(root), package_format, workflow)
                self.assertNotEqual(previous, latest, "exports must not overwrite earlier results")
                self.assertEqual(missing, [])
                for path in (previous, latest):
                    self.assertEqual(Path(path).parent, root)
                    if package_format == "zip":
                        with zipfile.ZipFile(path) as archive:
                            self.assertIsNone(archive.testzip())
                            read = archive.read
                            self.assertEqual(json.loads(read("project.json")), project)
                            self.assertEqual(json.loads(read("workflow.json")), workflow)
                            self.assertEqual(read("media/images/场景.png"), asset.read_bytes())
                    else:
                        self.assertEqual(json.loads((Path(path) / "project.json").read_text(encoding="utf-8")), project)
                        self.assertEqual(json.loads((Path(path) / "workflow.json").read_text(encoding="utf-8")), workflow)
                        self.assertEqual((Path(path) / "media/images/场景.png").read_bytes(), asset.read_bytes())

    def test_disk_validation_options_and_missing_assets(self):
        save = self.disk_export([], ["missing.png"])
        for invalid in ("relative/path", "//server/share", "\\\\server\\share", ""):
            with self.assertRaises(ValueError):
                save({}, invalid, "directory")
        with tempfile.TemporaryDirectory() as directory:
            absent = Path(directory) / "does-not-exist"
            with self.assertRaisesRegex(ValueError, "does not exist"):
                save({}, str(absent), "directory")
            self.assertFalse(absent.exists(), "missing destination must not be created")
            with self.assertRaises(ValueError):
                save({}, directory, "invalid-format")
            for arcname in ("../escape", "/absolute", "media/../../escape", "C:/escape", "media\\..\\escape"):
                with self.assertRaises(ValueError):
                    self.disk_export([{"arcname": arcname}])({}, directory, "directory")
            self.assertEqual(list(Path(directory).iterdir()), [], "invalid paths must not create export files")
            for package_format in ("directory", "zip"):
                path, missing = save({"name": "CON"}, directory, package_format, include_generated=False)
                self.assertEqual(missing, ["missing.png"])
                if package_format == "zip":
                    with zipfile.ZipFile(path) as archive:
                        self.assertEqual(archive.namelist(), ["project.json"])
                else:
                    self.assertEqual([p.name for p in Path(path).iterdir()], ["project.json"])

    def test_zip_filename_headers_are_ascii_and_roundtrip(self):
        routes = ast.parse(source.with_name("__init__.py").read_text(encoding="utf-8-sig"))
        route = next(n for n in ast.walk(routes) if isinstance(n, ast.AsyncFunctionDef) and n.name == "api_export_zip")
        headers = next(n.value for n in ast.walk(route) if isinstance(n, ast.Assign)
                       and any(isinstance(t, ast.Name) and t.id == "headers" for t in n.targets))
        for filename in ["仙宫有点忙·特别篇.zip", "100% 晴天.zip"]:
            values = eval(compile(ast.Expression(headers), str(source), "eval"),
                          {"quote": quote, "filename": filename, "missing": []})
            for value in values.values():
                value.encode("ascii")
            self.assertEqual(unquote(values["X-Export-Filename-UTF8"]), filename)
            self.assertIn("filename*=UTF-8''" + quote(filename, safe=""), values["Content-Disposition"])

    def test_workflow_and_legacy_package(self):
        project = {"name": "工程", "tracks": []}
        workflow = {"version": 0.4, "nodes": [{"id": 1, "widgets_values": ["中文"]}], "links": []}
        with tempfile.TemporaryDirectory() as directory:
            asset = Path(directory) / "asset.txt"
            asset.write_bytes(b"unchanged asset")
            scope = {
                "io": io, "json": json, "zipfile": zipfile, "PACKAGE_PROJECT_NAME": "project.json",
                "_safe_name": lambda name, default: name or default,
                "build_export_entries": lambda p, **options: (p, [{"src_path": str(asset), "arcname": "media/asset.txt"}], []),
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

    def test_generated_option_is_forwarded(self):
        calls = []
        def entries(project, *, include_generated=True):
            calls.append(include_generated)
            return project, [], []
        scope = {"io": io, "json": json, "zipfile": zipfile, "PACKAGE_PROJECT_NAME": "project.json",
                 "_safe_name": lambda name, default: name or default, "build_export_entries": entries}
        exec(compile(ast.Module(body=[function], type_ignores=[]), str(source), "exec"), scope)
        for enabled in (True, False):
            blob, _, _ = scope["build_export_zip_bytes"]({"name": "test"}, include_generated=enabled)
            with zipfile.ZipFile(io.BytesIO(blob)) as archive:
                self.assertEqual(archive.namelist(), ["project.json"])
        self.assertEqual(calls, [True, False])


if __name__ == "__main__":
    unittest.main()
