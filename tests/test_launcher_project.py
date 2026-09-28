import importlib
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer


package = types.ModuleType("launcher_test_backend")
package.__path__ = [str(Path(__file__).resolve().parents[1] / "backend")]
sys.modules[package.__name__] = package
folders = types.ModuleType("folder_paths")
sys.modules["folder_paths"] = folders
io = importlib.import_module("launcher_test_backend.cap_launcher_project")


class LauncherProjectTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.directory = self.root / "project"
        self.directory.mkdir()
        self.input = self.root / "input"
        self.output = self.root / "output"
        self.input.mkdir()
        self.output.mkdir()
        folders.get_input_directory = lambda: str(self.input)
        folders.get_output_directory = lambda: str(self.output)
        folders.exists_annotated_filepath = lambda name: (self.input / name).is_file()
        folders.get_annotated_filepath = lambda name: str(self.input / name)
        self.project = {"schema_version": 4, "name": "Test", "media": [
            {"id": "i", "kind": "image", "file": "sample.png", "location": "input"},
        ], "tracks": [{"id": "t", "type": "director", "clips": [
            {"id": "c", "media_ids": ["i"], "generated_videos": [{"file": "clip.mp4"}]},
        ]}]}
        self.storyboard = {"schema_version": 1, "shots": [{"id": "shot", "image_id": "i"}]}
        (self.input / "sample.png").write_bytes(b"image-with-metadata")
        (self.output / "clip.mp4").write_bytes(b"video")
        (self.directory / "project.json").write_text('{"name":"original","tracks":[]}', encoding="utf-8")
        (self.directory / "storyboard.json").write_text('{"schema_version":1,"shots":[]}', encoding="utf-8")

    def save(self, backup, cache=None):
        return io.save_project_directory(str(self.directory), self.project, self.storyboard, backup, cache if cache is not None else {})

    def test_backup_manual_save_media_and_reopen(self):
        original = (self.directory / "project.json").read_bytes()
        original_storyboard = (self.directory / "storyboard.json").read_bytes()
        cache = {}
        self.assertEqual(self.save(True, cache), [])
        self.assertEqual((self.directory / "project.json").read_bytes(), original)
        self.assertEqual((self.directory / "storyboard.json").read_bytes(), original_storyboard)
        backup = json.loads((self.directory / "project.json.bak").read_text(encoding="utf-8"))
        self.assertEqual(backup["project_directory"], str(self.directory))
        self.assertNotIn("project_directory", self.project, "disk metadata must not mutate workflow project")
        image = self.directory / backup["media"][0]["file"]
        self.assertEqual(image.parent, self.directory / "media" / "images")
        self.assertEqual(image.name, "sample.png")
        self.assertTrue(backup["tracks"][0]["clips"][0]["generated_videos"][0]["file"].startswith("media/generated/"))
        self.assertNotIn("media/launcher", json.dumps(backup))
        self.assertEqual(image.read_bytes(), b"image-with-metadata")
        stamp = image.stat().st_mtime_ns
        self.save(False, cache)
        self.assertEqual(image.stat().st_mtime_ns, stamp, "unchanged media is not rewritten")
        self.assertEqual(json.loads((self.directory / "project.json").read_text(encoding="utf-8")), backup)
        _, reopened, storyboard, warnings = io.open_project_directory(str(self.directory))
        self.assertEqual(warnings, [])
        self.assertEqual(storyboard, self.storyboard)
        self.assertEqual((self.input / reopened["media"][0]["file"]).read_bytes(), b"image-with-metadata")
        video = reopened["tracks"][0]["clips"][0]["generated_videos"][0]["file"]
        self.assertEqual((self.output / video).read_bytes(), b"video")
        (self.input / "sample.png").write_bytes(b"changed-image")
        self.save(True, cache)
        self.assertEqual(image.read_bytes(), b"image-with-metadata", "backup cannot modify formal project's media")
        self.assertEqual(json.loads((self.directory / "project.json").read_text(encoding="utf-8")), backup)

    def test_atomic_failure_preserves_project_and_retry_succeeds(self):
        original = (self.directory / "project.json").read_bytes()
        with patch.object(io.os, "replace", side_effect=OSError("disk failure")):
            with self.assertRaises(OSError):
                self.save(False)
        self.assertEqual((self.directory / "project.json").read_bytes(), original)
        self.assertFalse(list(self.directory.rglob(".timeline-*")))
        self.assertFalse(list(self.directory.rglob(".media-*")))
        self.save(False)

    def test_workflow_is_written_only_by_formal_save(self):
        workflow = {"nodes": [{"id": 1}], "links": []}
        io.save_project_directory(str(self.directory), self.project, self.storyboard, False, {}, workflow)
        path = self.directory / "workflow.json"
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), workflow)
        io.save_project_directory(str(self.directory), self.project, self.storyboard, True, {}, {"nodes": []})
        self.assertEqual(json.loads(path.read_text(encoding="utf-8")), workflow)
        self.assertFalse((self.directory / "workflow.json.bak").exists())

    def test_import_then_save_reuses_original_paths_without_copying(self):
        self.save(False)
        saved = json.loads((self.directory / "project.json").read_text(encoding="utf-8"))
        before = {p.relative_to(self.directory).as_posix(): p.stat().st_mtime_ns
                  for p in (self.directory / "media").rglob("*") if p.is_file()}
        _, reopened, storyboard, warnings = io.open_project_directory(str(self.directory))
        self.assertEqual(warnings, [])
        self.assertNotEqual(reopened["media"][0]["file"], saved["media"][0]["file"])
        with patch.object(io.shutil, "copyfile", side_effect=AssertionError("Unchanged media must not be copied")):
            io.save_project_directory(str(self.directory), reopened, storyboard, False, {})
        again = json.loads((self.directory / "project.json").read_text(encoding="utf-8"))
        self.assertEqual(again["media"][0]["file"], saved["media"][0]["file"])
        self.assertEqual(again["tracks"][0]["clips"][0]["generated_videos"][0]["file"],
                         saved["tracks"][0]["clips"][0]["generated_videos"][0]["file"])
        after = {p.relative_to(self.directory).as_posix(): p.stat().st_mtime_ns
                 for p in (self.directory / "media").rglob("*") if p.is_file()}
        self.assertEqual(before, after)

    def test_duplicate_names_and_changed_destination(self):
        (self.input / "renamed.png").write_bytes((self.input / "sample.png").read_bytes())
        self.project["media"].append({"id": "duplicate", "kind": "image", "file": "renamed.png", "location": "input"})
        cache = {}
        self.save(False, cache)
        saved = json.loads((self.directory / "project.json").read_text(encoding="utf-8"))
        self.assertEqual(saved["media"][0]["file"], saved["media"][1]["file"])
        self.assertEqual(len(list((self.directory / "media/images").glob("*.png"))), 1)
        original = self.directory / saved["media"][0]["file"]
        original.write_bytes(b"externally edited")
        self.save(True, cache)
        backup = json.loads((self.directory / "project.json.bak").read_text(encoding="utf-8"))
        replacement = self.directory / backup["media"][0]["file"]
        self.assertNotEqual(replacement, original)
        self.assertEqual(replacement.read_bytes(), b"image-with-metadata")
        self.assertEqual(original.read_bytes(), b"externally edited")

    def test_paths_missing_files_and_invalid_storyboard(self):
        with self.assertRaises(ValueError):
            io.project_path(str(self.directory), "../outside.json")
        (self.input / "sample.png").unlink()
        self.assertIn("sample.png", self.save(True))
        self.storyboard["schema_version"] = 99
        original = (self.directory / "project.json").read_bytes()
        with self.assertRaises(ValueError):
            self.save(False)
        self.assertEqual((self.directory / "project.json").read_bytes(), original)


class RouteTests(unittest.IsolatedAsyncioTestCase):
    async def test_snapshot_and_version_selection(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory, "project.json")
            original = '{"tracks":[],"name":"External"}'
            project.write_text(original, encoding="utf-8")
            routes = web.RouteTableDef()
            io.register_launcher_project_routes(routes)
            app = web.Application()
            app.add_routes(routes)
            async with TestClient(TestServer(app)) as client:
                prefix = "/audio_keyframe_timeline/launcher_project/"
                opened = await (await client.post(prefix + "open", json={"directory": directory})).json()
                body = {"token": opened["token"], "project": {"tracks": [], "name": "Unsaved"}, "storyboard": {"schema_version": 1, "shots": []}}
                saved = await (await client.post(prefix + "snapshot", json=body)).json()
                self.assertEqual(saved["missing"], [])
                self.assertEqual(project.read_text(), original)
                self.assertTrue(Path(directory, io.storyboard_filename(saved["filename"])).is_file())
                self.assertEqual(json.loads(Path(directory, saved["filename"]).read_text())["name"], "Unsaved")
                status = await (await client.post(prefix + "status", json={"token": opened["token"]})).json()
                self.assertFalse(status["changed"])
                listing = await (await client.post(prefix + "open", json={"directory": directory})).json()
                self.assertEqual({row["filename"] for row in listing["versions"]}, {"project.json", saved["filename"]})
                selected = await (await client.post(prefix + "open", json={"directory": directory, "filename": saved["filename"]})).json()
                self.assertEqual(selected["project"]["name"], "Unsaved")
                self.assertEqual(selected["storyboard"], body["storyboard"])
                Path(directory, saved["filename"]).write_text('{"tracks":[],"name":"Changed version"}', encoding="utf-8")
                status = await (await client.post(prefix + "status", json={"token": selected["token"]})).json()
                self.assertTrue(status["changed"])
                for filename in ("../project.json", "project/else.json", "workflow.json"):
                    response = await client.post(prefix + "open", json={"directory": directory, "filename": filename})
                    self.assertEqual(response.status, 400)

    async def test_external_updates_ignore_own_saves_and_backups(self):
        with tempfile.TemporaryDirectory() as directory:
            project = Path(directory, "project.json")
            project.write_text('{"tracks":[]}', encoding="utf-8")
            routes = web.RouteTableDef()
            io.register_launcher_project_routes(routes)
            app = web.Application()
            app.add_routes(routes)
            async with TestClient(TestServer(app)) as client:
                prefix = "/audio_keyframe_timeline/launcher_project/"
                opened = await (await client.post(prefix + "open", json={"directory": directory})).json()
                token = {"token": opened["token"]}

                async def status():
                    return await (await client.post(prefix + "status", json=token)).json()

                self.assertFalse((await status())["changed"])
                for backup in (True, False):
                    response = await client.post(prefix + "save", json={**token, "project": {"tracks": [], "name": "Local"}, "backup": backup})
                    self.assertEqual(response.status, 200)
                    self.assertFalse((await status())["changed"])
                project.write_text('{"tracks":[],"name":"External"}', encoding="utf-8")
                changed = await status()
                self.assertTrue(changed["changed"])
                self.assertTrue(changed["exists"])
                Path(directory, "storyboard.json").write_text('{"schema_version":1,"shots":[]}', encoding="utf-8")
                self.assertNotEqual((await status())["revision"], changed["revision"])
                project.unlink()
                self.assertFalse((await status())["exists"])
                self.assertEqual((await client.post(prefix + "status", json={"token": "unknown"})).status, 404)
                self.assertEqual((await client.post(prefix + "status", json=token, headers={"Origin": "https://other.example"})).status, 403)

    async def test_associate_without_import_or_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            routes = web.RouteTableDef()
            io.register_launcher_project_routes(routes)
            app = web.Application()
            app.add_routes(routes)
            async with TestClient(TestServer(app)) as client:
                prefix = "/audio_keyframe_timeline/launcher_project/"
                response = await client.post(prefix + "associate", json={"directory": directory})
                self.assertEqual(response.status, 200)
                linked = await response.json()
                self.assertFalse(linked["existing"])
                self.assertFalse(Path(directory, "project.json").exists())
                response = await client.post(prefix + "save", json={"token": linked["token"], "project": {"tracks": [], "name": "Current"}, "backup": False})
                self.assertEqual(response.status, 200)
                original = Path(directory, "project.json").read_bytes()
                response = await client.post(prefix + "associate", json={"directory": directory})
                self.assertTrue((await response.json())["existing"])
                self.assertEqual(Path(directory, "project.json").read_bytes(), original)
                self.assertEqual((await client.post(prefix + "associate", json={"directory": directory}, headers={"Origin": "https://other.example"})).status, 403)
                self.assertEqual((await client.post(prefix + "associate", json={"directory": str(Path(directory, "missing"))})).status, 400)

    async def test_origin_and_session_bound_save(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "project.json").write_text('{"tracks":[],"media":[]}', encoding="utf-8")
            routes = web.RouteTableDef()
            io.register_launcher_project_routes(routes)
            app = web.Application()
            app.add_routes(routes)
            async with TestClient(TestServer(app)) as client:
                prefix = "/audio_keyframe_timeline/launcher_project/"
                response = await client.post(prefix + "open", json={"directory": directory}, headers={"Origin": "https://untrusted.example"})
                self.assertEqual(response.status, 403)
                response = await client.post(prefix + "open", json={"directory": directory})
                self.assertEqual(response.status, 200)
                opened = await response.json()
                body = {"token": opened["token"], "project": {"tracks": [], "name": "Updated"}, "backup": True, "workflow": {"nodes": [{"id": 3}]}}
                response = await client.post(prefix + "save", json=body)
                self.assertEqual(response.status, 200)
                self.assertTrue(Path(directory, "project.json.bak").exists())
                self.assertFalse(Path(directory, "workflow.json").exists())
                self.assertNotIn("Updated", Path(directory, "project.json").read_text())
                response = await client.post(prefix + "save", json={**body, "backup": False})
                self.assertEqual(response.status, 200)
                self.assertIn("Updated", Path(directory, "project.json").read_text())
                self.assertEqual(json.loads(Path(directory, "workflow.json").read_text()), body["workflow"])
                response = await client.post(prefix + "save", json={**body, "token": "unknown"})
                self.assertEqual(response.status, 404)


if __name__ == "__main__":
    unittest.main()
