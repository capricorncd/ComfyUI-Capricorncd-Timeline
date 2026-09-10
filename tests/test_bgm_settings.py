import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location("bgm_settings_test", (Path(__file__).resolve().parents[1] / "backend") / "cap_bgm_settings.py")
bgm = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"folder_paths": types.SimpleNamespace()}):
    spec.loader.exec_module(bgm)


class BgmSettingsTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "timeline_bgm.json"
        self.location = patch.object(bgm, "_path", return_value=self.path)
        self.location.start()
        self.addCleanup(self.location.stop)

    def payload(self, **changes):
        return dict(connection="comfyui", url="http://127.0.0.1:8188", model="MiniMaxH3 Music",
                    workflow={"1": {"class_type": "Test", "inputs": {}}}, **changes)

    def test_persistence_and_secret_redaction(self):
        result = bgm.save_bgm_settings(self.payload(api_key="test-secret"))
        self.assertTrue(result["has_key"])
        self.assertNotIn("api_key", result)
        self.assertNotIn("test-secret", json.dumps(result))
        self.assertEqual(bgm.public_bgm_settings(), result)
        bgm.save_bgm_settings(self.payload(api_key=""))
        self.assertEqual(bgm._read()["api_key"], "test-secret")
        bgm.save_bgm_settings(self.payload(clear_key=True))
        self.assertFalse(bgm.public_bgm_settings()["has_key"])

    def test_changing_service_does_not_reuse_key(self):
        bgm.save_bgm_settings(self.payload(api_key="test-secret"))
        payload = self.payload()
        payload.update(url="http://127.0.0.1:9000", connection="standalone")
        result = bgm.save_bgm_settings(payload)
        self.assertFalse(result["has_key"])
        self.assertIsNone(result["workflow"])

    def test_invalid_url_and_ui_workflow(self):
        for url in ("file:///C:/private", "http://user:secret@localhost", "http://localhost?key=secret", ""):
            payload = self.payload()
            payload["url"] = url
            with self.assertRaises(ValueError):
                bgm.save_bgm_settings(payload)
        payload = self.payload()
        payload["workflow"] = {"nodes": []}
        with self.assertRaises(ValueError):
            bgm.save_bgm_settings(payload)
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
