import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch


package = types.ModuleType("config_test")
package.__path__ = [str(Path(__file__).resolve().parents[1] / "backend")]
sys.modules["config_test"] = package
spec = importlib.util.spec_from_file_location("config_test.bgm_settings_test", (Path(__file__).resolve().parents[1] / "backend") / "cap_bgm_settings.py")
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
        self.assertNotIn("workflow", result)

    def test_local_service_endpoint_normalization_and_blank_key(self):
        payload = {"connection": "standalone", "url": "http://127.0.0.1:19876", "api_key": "saved"}
        bgm.save_bgm_settings(payload)
        payload.update(url="http://127.0.0.1:19876/v1/music/generate", api_key="")
        result = bgm.save_bgm_settings(payload)
        self.assertEqual(result["url"], "http://127.0.0.1:19876")
        self.assertTrue(result["has_key"])
        self.assertEqual(bgm._read()["api_key"], "saved")
        payload["url"] = "file:///invalid"
        with self.assertRaises(ValueError):
            bgm.save_bgm_settings(payload)

    def test_invalid_url(self):
        for url in ("file:///C:/private", "http://user:secret@localhost", "http://localhost?key=secret"):
            payload = self.payload()
            payload["url"] = url
            with self.assertRaises(ValueError):
                bgm.save_bgm_settings(payload)
        self.assertFalse(self.path.exists())

    def test_audio_service_parameters(self):
        services = {'sfx': {'num_inference_steps': 20, 'cfg_scale': 3.5}, 'separation': {'segment_seconds': 4}}
        result = bgm.save_bgm_settings(self.payload(services=services))
        self.assertEqual(result['services']['sfx']['num_inference_steps'], 20)
        self.assertEqual(bgm.save_bgm_settings(self.payload())['services']['separation']['segment_seconds'], 4)
        for key in ('model', 'workflow', 'sfx_steps', 'sfx_cfg', 'separation_segment'):
            self.assertNotIn(key, bgm._read())
        for service, key, value in [('sfx', 'num_inference_steps', 0), ('sfx', 'num_inference_steps', 1.5), ('sfx', 'cfg_scale', 21), ('separation', 'segment_seconds', 0)]:
            with self.assertRaises(ValueError):
                bgm.save_bgm_settings(self.payload(services={service: {key: value}}))

    def test_service_overrides_and_secret_redaction(self):
        payload = dict(connection='standalone', url='https://common.example/api', api_key='common-secret',
                       services={'tts': {'url': 'https://speech.example/v1/tts/generate', 'api_key': 'tts-secret'}})
        public = bgm.save_bgm_settings(payload)
        self.assertNotIn('secret', json.dumps(public))
        self.assertTrue(public['services']['tts']['has_key'])
        payload['services']['tts'].update(api_key='', keep_key=True)
        bgm.save_bgm_settings(payload)
        self.assertEqual(bgm._read()['services']['tts']['api_key'], 'tts-secret')
        payload['services']['tts']['keep_key'] = False
        bgm.save_bgm_settings(payload)
        self.assertEqual(bgm._read()['services']['tts']['api_key'], '')


if __name__ == "__main__":
    unittest.main()
