import ast
import datetime
import json
import logging
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
import wave

import numpy as np
import torch

backend = Path(__file__).resolve().parents[1] / "backend"
tree = ast.parse((backend / "cap_compose_clip_videos.py").read_text(encoding="utf-8-sig"))
seq_tree = ast.parse((backend / "cap_seq_to_video.py").read_text(encoding="utf-8-sig"))
scope = dict(datetime=datetime, json=json, logging=logging, os=os, re=re, shutil=shutil,
             subprocess=subprocess, sys=sys, tempfile=tempfile, wave=wave,
             _t=lambda key, lang, **kwargs: key + str(kwargs), get_last_known_lang=lambda: "en",
             CAP_DataJsonClipParser=type("Parser", (), {}), _ffmpeg_path=lambda p: os.path.abspath(p).replace("\\", "/"),
             timing_from_filename=lambda path: None, read_video_generation=lambda path: None,
             embed_video_generation=Mock(), folder_paths=None)
exec(compile(ast.Module(body=[n for n in seq_tree.body if isinstance(n, ast.FunctionDef) and n.name == "_write_audio_tmp"],
                        type_ignores=[]), "<audio writer>", "exec"), scope)
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, (ast.FunctionDef, ast.ClassDef, ast.Assign))],
                        type_ignores=[]), "<compose node>", "exec"), scope)
Node = scope["CAP_ComposeClipVideos"]


def run(args):
    return subprocess.run(args, check=True, capture_output=True).stdout


@unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
class ComposeAudioTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="cap_compose_audio_test_")
        cls.directory = Path(cls.temp.name)
        scope["folder_paths"] = SimpleNamespace(get_output_directory=lambda: str(cls.directory))
        for name, audio in (("tone", True), ("silent", False)):
            cmd = ["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=s=64x48:r=24:d=1"]
            if audio:
                cmd += ["-f", "lavfi", "-i", "sine=frequency=440:sample_rate=44100:duration=1"]
            cmd += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
            if audio:
                cmd += ["-c:a", "aac", "-ac", "1"]
            run(cmd + [str(cls.directory / (name + ".mp4"))])

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def compose(self, name, use_original=True, seconds=None, mixed=False, spans=False, silent_only=False):
        data = {"fps":24, "clips":[
            {"source_clip_id":"a", "output_video":"tone.mp4", "start_ms":0, "end_ms":1000},
            {"source_clip_id":"b", "output_video":"silent.mp4" if mixed else "tone.mp4", "start_ms":1000, "end_ms":2000},
        ]}
        if silent_only:
            for clip in data["clips"]:
                clip["output_video"] = "silent.mp4"
        if spans:
            data["clips"][0]["playback_spans"] = [
                {"source_clip_id":"a", "start_frame":0, "frame_count":12},
                {"source_clip_id":"b", "start_frame":0, "frame_count":12},
            ]
            data["clips"][1]["playback_spans"] = [{"source_clip_id":"b", "start_frame":0, "frame_count":24}]
        audio = None
        if seconds is not None:
            samples = torch.arange(round(seconds * 32000)) / 32000
            audio = {"waveform":(0.1 * torch.sin(2 * torch.pi * 880 * samples))[None, None, :], "sample_rate":32000}
        audio_paths = []
        write_audio = scope["_write_audio_tmp"]
        def writer(audio):
            path = write_audio(audio)
            if path:
                audio_paths.append(path)
            return path
        with patch.dict(scope, {"_write_audio_tmp":writer}):
            result = Node().execute(json.dumps(data), filename_prefix=name, save_sidecar=False,
                                    trim_extends=spans, audio=audio, use_original_audio=use_original)
        file = self.directory / result["result"][0]
        self.assertTrue(file.is_file())
        self.assertEqual(result["ui"]["video"][0]["type"], "output")
        metadata = scope["embed_video_generation"].call_args.args[1]
        self.assertEqual(metadata["audio"], {"use_original_audio":use_original, "audio_input":audio is not None})
        for path in audio_paths:
            self.assertFalse(Path(path).exists(), "temporary audio is removed after encoding")
        info = json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-of", "json", str(file)]))
        video = next(s for s in info["streams"] if s["codec_type"] == "video")
        self.assertEqual(int(video["nb_frames"]), 48)
        self.assertAlmostEqual(float(video["duration"]), 2, delta=1/24)
        self.assertEqual(video["r_frame_rate"], "24/1")
        has_audio = any(s["codec_type"] == "audio" for s in info["streams"])
        pcm = None
        if has_audio:
            pcm = np.frombuffer(run(["ffmpeg", "-v", "error", "-i", str(file), "-vn", "-ac", "1",
                                      "-ar", "48000", "-f", "f32le", "pipe:1"]), dtype=np.float32)
            self.assertAlmostEqual(len(pcm)/48000, 2, delta=0.1)
        return file, pcm

    def amplitude(self, pcm, frequency, start):
        data = pcm[int(start*48000):int((start+0.25)*48000)]
        return abs(np.mean(data * np.exp(-2j*np.pi*frequency*np.arange(len(data))/48000))) * 2

    def test_input_contract_and_old_workflow_defaults(self):
        inputs = Node.INPUT_TYPES()
        self.assertEqual(list(inputs["required"]), ["data_json", "filename_prefix", "trim_extends", "save_sidecar"])
        self.assertEqual(inputs["optional"]["audio"][0], "AUDIO")
        self.assertIs(inputs["optional"]["use_original_audio"][1]["default"], True)

    def test_original_only_and_silent_export(self):
        _, pcm = self.compose("original")
        self.assertGreater(self.amplitude(pcm, 440, 0.25), 0.03)
        _, pcm = self.compose("mute", use_original=False)
        self.assertIsNone(pcm)

    def test_replacement_short_audio_is_padded(self):
        _, pcm = self.compose("short", use_original=False, seconds=0.8)
        self.assertGreater(self.amplitude(pcm, 880, 0.25), 0.03)
        self.assertLess(self.amplitude(pcm, 440, 0.25), 0.005)
        self.assertLess(np.max(np.abs(pcm[72000:84000])), 0.001)

    def test_mixed_audio_and_video_pixels_unchanged(self):
        baseline, _ = self.compose("baseline")
        merged, pcm = self.compose("mixed", seconds=3)
        self.assertGreater(self.amplitude(pcm, 440, 1.5), 0.03)
        self.assertGreater(self.amplitude(pcm, 880, 1.5), 0.03)
        hashes = lambda file: run(["ffmpeg", "-v", "error", "-i", str(file), "-map", "0:v:0", "-f", "hash", "-hash", "sha256", "pipe:1"])
        self.assertEqual(hashes(baseline), hashes(merged), "audio mux must not re-encode video")

    def test_mixed_silent_segments_and_context_spans(self):
        _, pcm = self.compose("silent_part", mixed=True, seconds=3, spans=True)
        self.assertGreater(self.amplitude(pcm, 440, 0.15), 0.03)
        self.assertLess(self.amplitude(pcm, 440, 1.5), 0.005)
        self.assertGreater(self.amplitude(pcm, 880, 1.5), 0.03)

    def test_empty_audio_is_rejected(self):
        data = json.dumps({"clips":[{"output_video":"tone.mp4"}]})
        with self.assertRaisesRegex(ValueError, "audio input is empty"):
            Node().execute(data, trim_extends=False, audio={"waveform":torch.empty(1, 1, 0), "sample_rate":48000})

    def test_silent_sources_accept_external_audio(self):
        _, pcm = self.compose("all_silent", silent_only=True)
        self.assertIsNone(pcm)
        _, pcm = self.compose("all_silent_external", seconds=3, silent_only=True)
        self.assertGreater(self.amplitude(pcm, 880, 1.5), 0.03)

    def test_audio_temp_is_removed_on_failure(self):
        paths = []
        write_audio = scope["_write_audio_tmp"]
        def writer(audio):
            path = write_audio(audio)
            paths.append(path)
            return path
        audio = {"waveform":torch.zeros(1, 1, 4800), "sample_rate":48000}
        with patch.dict(scope, {"_write_audio_tmp":writer}), patch.object(Node, "_normalize_segment", side_effect=RuntimeError("encode failed")):
            with self.assertRaisesRegex(RuntimeError, "encode failed"):
                Node().execute(json.dumps({"clips":[{"output_video":"tone.mp4"}]}),
                               audio=audio, trim_extends=False, save_sidecar=False)
        self.assertEqual(len(paths), 1)
        self.assertFalse(Path(paths[0]).exists())


if __name__ == "__main__":
    unittest.main()
