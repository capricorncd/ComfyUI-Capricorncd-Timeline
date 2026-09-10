import array
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

import torch


spec = importlib.util.spec_from_file_location("audio_envelope", Path(__file__).resolve().parents[1] / "audio_envelope.py")
envelope = importlib.util.module_from_spec(spec)
spec.loader.exec_module(envelope)


class AudioEnvelopeTests(unittest.TestCase):
    points = [{"source_ms": 0, "gain": 0}, {"source_ms": 1000, "gain": 2}]

    def test_source_offset_and_linear_gain(self):
        wave = torch.ones(1, 2, 8000)
        full = envelope.apply_volume_points(wave, 8000, 0, self.points)
        right = envelope.apply_volume_points(wave[..., :4000], 8000, 500, self.points)
        self.assertTrue(torch.allclose(full[..., 4000:], right))
        self.assertAlmostEqual(full[0, 0, 4000].item(), 1)

    def test_normalize_and_empty(self):
        self.assertEqual(envelope.normalize_volume_points([
            {"source_ms": 20, "gain": 7}, {"source_ms": 0, "gain": -1},
            {"source_ms": 20, "gain": 1.5}, {"source_ms": float("nan"), "gain": 1},
        ]), [{"source_ms": 0, "gain": 0}, {"source_ms": 20, "gain": 1.5}])
        wave = torch.ones(1, 1, 10)
        self.assertIs(envelope.apply_volume_points(wave, 8000, 0, []), wave)

    def test_ffmpeg_matches_tensor_envelope(self):
        chain = "anull" + envelope.volume_points_filter(self.points, 0.25)
        out = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "aevalsrc=1:s=8000:d=1",
            "-af", chain, "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
        ], capture_output=True, check=True)
        actual = array.array("f", out.stdout)
        expected = envelope.apply_volume_points(torch.ones(8000), 8000, 250, self.points)
        self.assertEqual(len(actual), 8000)
        self.assertLess(max(abs(a-b) for a, b in zip(actual, expected.tolist())), 1e-5)

    def test_stereo_channels_are_preserved(self):
        chain = "anull" + envelope.volume_points_filter([{"source_ms": 0, "gain": 0.5}], 0)
        out = subprocess.run([
            "ffmpeg", "-v", "error", "-f", "lavfi", "-i", "aevalsrc=0.2|0.6:s=8000:d=0.1:c=stereo",
            "-af", chain, "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
        ], capture_output=True, check=True)
        samples = array.array("f", out.stdout)
        self.assertEqual(len(samples), 1600)
        self.assertTrue(all(abs(v - 0.1) < 1e-6 for v in samples[0::2]))
        self.assertTrue(all(abs(v - 0.3) < 1e-6 for v in samples[1::2]))

    def test_envelope_and_delay_encode_to_aac(self):
        for layout, channels, values in (("mono", 1, "0.2"), ("stereo", 2, "0.2|0.6")):
            with self.subTest(layout=layout), tempfile.TemporaryDirectory() as directory:
                path = str(Path(directory) / "audio.m4a")
                chain = "asetpts=PTS-STARTPTS" + envelope.volume_points_filter(self.points, 0)
                chain += ",volume=0.8,adelay=100|100"
                subprocess.run([
                    "ffmpeg", "-v", "error", "-f", "lavfi", "-i", f"aevalsrc={values}:s=48000:d=0.2:c={layout}",
                    "-af", chain, "-c:a", "aac", "-b:a", "192k", path,
                ], capture_output=True, check=True)
                probe = subprocess.run([
                    "ffprobe", "-v", "error", "-show_entries", "stream=channels,channel_layout,codec_name", "-of", "json", path,
                ], capture_output=True, text=True, check=True)
                audio = json.loads(probe.stdout)["streams"][0]
                self.assertEqual(audio["codec_name"], "aac")
                self.assertEqual(audio["channels"], channels)
                self.assertEqual(audio["channel_layout"], layout)


if __name__ == "__main__":
    unittest.main()
