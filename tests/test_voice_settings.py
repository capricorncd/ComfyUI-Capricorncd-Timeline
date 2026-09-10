import ast
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

ROOT = (Path(__file__).resolve().parents[1] / "backend")
spec = importlib.util.spec_from_file_location("voice_settings_test", ROOT / "cap_voice_settings.py")
voice = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"folder_paths": types.SimpleNamespace()}):
    spec.loader.exec_module(voice)


class VoiceSettingsTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.path = Path(temp.name) / "voice.json"
        location = patch.object(voice, "_path", return_value=self.path)
        location.start()
        self.addCleanup(location.stop)

    def test_config_and_secret(self):
        payload = dict(url="http://127.0.0.1:8000/convert", api_key="secret", timeout_seconds=300)
        result = voice.save_voice_settings(payload)
        self.assertTrue(result["has_key"])
        self.assertFalse(result["execution_available"])
        self.assertNotIn("secret", json.dumps(result))
        payload["api_key"] = ""
        voice.save_voice_settings(payload)
        self.assertEqual(voice._read()["api_key"], "secret")
        payload["url"] = "http://127.0.0.1:9000/convert"
        self.assertFalse(voice.save_voice_settings(payload)["has_key"])
        self.assertEqual(voice.public_voice_settings()["contract"]["success"]["content_type"], "audio/wav")

    def test_invalid_config_does_not_write(self):
        for payload in ([], {"url": "file:///x"}, {"url": "http://user:secret@localhost"},
                        {"url": "http://localhost?key=secret"}, {"url": "http://localhost:bad"},
                        {"timeout_seconds": 0}, {"timeout_seconds": 1.5}, {"timeout_seconds": True}):
            with self.assertRaises(ValueError):
                voice.save_voice_settings(payload)
        self.assertFalse(self.path.exists())

    def test_media_binding_survives_normalization(self):
        tree = ast.parse((ROOT / "cap_timeline_project_io.py").read_text(encoding="utf-8-sig"))
        fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "_normalize_media_catalog")
        env = {"os": os, "_norm_kind": lambda x: x, "_norm_file": lambda x: x, "_media_id_for": lambda k, f: k + f}
        exec(compile(ast.Module(body=[fn], type_ignores=[]), "normalize", "exec"), env)
        project = {"media": [
            {"id": "girl", "kind": "image", "file": "girl.png", "voice_audio_id": "voice"},
            {"id": "beast", "kind": "image", "file": "beast.png", "voice_audio_id": "voice"},
            {"id": "voice", "kind": "audio", "file": "voice.wav"},
        ]}
        env["_normalize_media_catalog"](project)
        env["_normalize_media_catalog"](project)
        self.assertEqual([r.get("voice_audio_id") for r in project["media"]], ["voice", "voice", None])


if __name__ == "__main__":
    unittest.main()
