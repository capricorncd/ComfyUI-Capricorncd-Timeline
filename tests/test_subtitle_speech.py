import importlib.util
import io
import json
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import wave

spec = importlib.util.spec_from_file_location("subtitle_speech_test", (Path(__file__).resolve().parents[1] / "backend") / "cap_subtitle_speech.py")
speech = importlib.util.module_from_spec(spec)
with patch.dict(sys.modules, {"folder_paths": types.SimpleNamespace()}):
    spec.loader.exec_module(speech)


def wav(seconds=1, rate=48000):
    data = io.BytesIO()
    with wave.open(data, "wb") as out:
        out.setparams((1, 2, rate, 0, "NONE", "not compressed"))
        out.writeframes(b"\0\0" * int(seconds * rate))
    return data.getvalue()


class SpeechTests(unittest.TestCase):
    def test_wav_validation(self):
        self.assertEqual(speech.wav_duration(wav()), 1)
        for data in (wav(rate=24000), wav()[:-2], b"not audio", wav(.05)):
            with self.assertRaises(ValueError):
                speech.wav_duration(data)

    def test_timeline_and_reference_validation(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "voice.wav").write_bytes(wav())
            with patch.object(speech.folder_paths, "get_input_directory", return_value=temp, create=True):
                request = dict(subtitle_id="s1", character_media_id="girl", reference_file="voice.wav", text="Hello",
                               start_ms=10250, end_ms=13750, duration_ms=3500)
                self.assertEqual(speech.validate_request(request), root / "voice.wav")
                for changes in ({"end_ms": 14000}, {"end_ms": True}, {"start_ms": -1}, {"duration_ms": 0}, {"reference_file": "../voice.wav"}):
                    with self.assertRaises(ValueError):
                        speech.validate_request(request | changes)

    def test_config_key_not_exposed(self):
        with tempfile.TemporaryDirectory() as temp, patch.object(speech, "_config_path", return_value=Path(temp) / "speech.json"):
            config = speech.save_config(dict(url="http://127.0.0.1:9999/speech", api_key="secret"))
            self.assertTrue(config["has_key"])
            self.assertNotIn("api_key", config)
            config = speech.save_config(dict(url="http://127.0.0.1:9998/speech"))
            self.assertFalse(config["has_key"])


class GenerateTests(unittest.IsolatedAsyncioTestCase):
    async def test_metadata_and_saved_response(self):
        captured = {}

        class Response:
            status = 200
            content_type = "audio/wav"

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            @property
            def content(self):
                return self

            async def iter_chunked(self, size):
                yield wav(2)

        class Session:
            def __init__(self, **kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *args):
                pass

            def post(self, url, **kwargs):
                captured.update(kwargs)
                return Response()

        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            (root / "voice.wav").write_bytes(wav())
            payload = dict(subtitle_id="s1", character_media_id="girl", reference_file="voice.wav", text="Hello",
                           prompt="happy", start_ms=10250, end_ms=13750, duration_ms=3500)
            with patch.object(speech.folder_paths, "get_input_directory", return_value=temp, create=True), \
                 patch.object(speech, "_read_config", return_value={"url": "http://local/speech"}), \
                 patch.object(speech, "prepare_reference", return_value=wav()), \
                 patch.object(speech.aiohttp, "ClientSession", Session):
                result = await speech.generate(payload)
            metadata = json.loads(captured["data"]._fields[0][2])
            self.assertEqual((metadata["start_ms"], metadata["end_ms"], metadata["duration_ms"]), (10250, 13750, 3500))
            self.assertNotIn("reference_file", metadata)
            self.assertFalse(captured["allow_redirects"])
            self.assertEqual(result["duration_seconds"], 2)
            self.assertEqual(result["end_ms"], 13750)
            self.assertEqual((root / result["file"]).read_bytes(), wav(2))


if __name__ == "__main__":
    unittest.main()
