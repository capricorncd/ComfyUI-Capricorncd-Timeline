import ast
import json
import math
from pathlib import Path
import re
import shutil
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch
import wave

from test_compose_frame_boundaries import names, run, scope as base_scope, source, tree

scope = dict(base_scope, re=re, _t=lambda key, *args, **kwargs: key, get_last_known_lang=lambda: "en",
             resolve_media_path=lambda path, **kwargs: path)
envelope_path = source.parent / "audio_envelope.py"
envelope_tree = ast.parse(envelope_path.read_text(encoding="utf-8"))
scope["math"] = math
exec(compile(ast.Module(body=[node for node in envelope_tree.body if isinstance(node, ast.FunctionDef)
    and node.name in {"normalize_volume_points", "volume_points_filter"}], type_ignores=[]), str(envelope_path), "exec"), scope)
scope["_probe_has_audio"] = lambda path: any(
    stream["codec_type"] == "audio" for stream in probe(path)["streams"])
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef)
    and node.name in names | {"_clip_audio_file", "compose_to_output", "resolve_compose_output_path"}],
    type_ignores=[]), str(source), "exec"), scope)


def probe(path):
    return json.loads(run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", str(path)]))


@unittest.skipUnless(shutil.which("ffmpeg"), "ffmpeg required")
class ComposeRangeAudioTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cap_export_test_")
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.video = self.directory / "source.mkv"
        self.audio = self.directory / "tone.wav"
        pixels = b"".join(bytes([40 + frame % 160]) * (32 * 32)
                          + bytes([128]) * (32 * 32 // 2) for frame in range(96))
        run(["ffmpeg", "-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "yuv420p",
             "-s", "32x32", "-r", "24", "-i", "pipe:0", "-f", "lavfi", "-i",
             "sine=frequency=440:sample_rate=48000:duration=4", "-c:v", "ffv1", "-c:a", "pcm_s16le",
             str(self.video)], input=pixels)
        run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i",
             "sine=frequency=880:sample_rate=48000:duration=4", str(self.audio)])
        self.project = dict(settings=dict(width=32, height=32, fps=24), tracks=[dict(
            type="director", clips=[dict(start_ms=0, duration_ms=4000,
                generated_videos=[dict(file=str(self.video), trim_in_sec=0, trim_out_sec=4)])])])

    def compose(self, project=None, **kwargs):
        return scope["compose_timeline_project"](project or self.project, str(self.directory / "out.mp4"), **kwargs)

    def test_video_only_keeps_audio_and_exact_range_frames(self):
        meta = self.compose(export_range=dict(start_frame=17, end_frame=42))
        streams = probe(self.directory / "out.mp4")["streams"]
        self.assertEqual({s["codec_type"] for s in streams}, {"video", "audio"})
        self.assertEqual(int(streams[0]["nb_frames"]), 25)
        self.assertAlmostEqual(meta["duration_sec"], 25 / 24)
        pixels = run(["ffmpeg", "-v", "error", "-i", str(self.directory / "out.mp4"),
                      "-an", "-pix_fmt", "yuv420p", "-f", "rawvideo", "pipe:1"])
        stride = 32 * 32 * 3 // 2
        for index in range(25):
            self.assertAlmostEqual(pixels[index * stride], 40 + 17 + index, delta=2)

    def test_combined_outputs_and_audio_only_formats(self):
        for fmt, codec in (("wav", "pcm_s16le"), ("mp3", "mp3")):
            for video in (False, True):
                with self.subTest(format=fmt, video=video):
                    path = self.directory / f"out.{fmt}"
                    self.compose(export_video=video, audio_output_path=str(path), audio_format=fmt,
                                 export_range=dict(start_frame=12, end_frame=60))
                    info = probe(path)
                    self.assertEqual(len(info["streams"]), 1)
                    self.assertEqual(info["streams"][0]["codec_name"], codec)
                    self.assertAlmostEqual(float(info["format"]["duration"]), 2, delta=0.06)
                    samples = run(["ffmpeg", "-v", "error", "-i", str(path), "-f", "s16le", "pipe:1"])
                    self.assertTrue(any(samples), "exported audio must not be silent")

    def test_audio_only_timeline_and_fades_are_cropped_not_restarted(self):
        project = dict(settings=dict(width=32, height=32, fps=24), tracks=[dict(type="audio", clips=[
            dict(start_ms=500, duration_ms=3000, source=dict(file=str(self.audio), in_ms=0),
                 fade_in_ms=1000, fade_out_ms=1000, volume=0.5)])])
        full = self.directory / "full.wav"
        cut = self.directory / "cut.wav"
        self.compose(project, export_video=False, audio_output_path=str(full))
        self.compose(project, export_video=False, audio_output_path=str(cut),
                     export_range=dict(start_frame=24, end_frame=72))
        with wave.open(str(full)) as audio:
            audio.setpos(48000)
            expected = audio.readframes(96000)
        with wave.open(str(cut)) as audio:
            self.assertEqual(audio.getnframes(), 96000)
            self.assertEqual(audio.readframes(96000), expected)

    def test_muted_audio_exports_silence(self):
        self.project["tracks"][0]["muted"] = True
        path = self.directory / "silent.wav"
        self.compose(export_video=False, audio_output_path=str(path), export_range=dict(start_frame=24, end_frame=48))
        with wave.open(str(path)) as audio:
            self.assertEqual(audio.getnframes(), 48000)
            self.assertFalse(any(audio.readframes(48000)))

    def test_output_files_share_stem_and_stay_inside_output(self):
        clip_tree = ast.parse((source.parent / "cap_compose_clip_videos.py").read_text(encoding="utf-8-sig"))
        exec(compile(ast.Module(body=[node for node in clip_tree.body if isinstance(node, ast.FunctionDef)
            and node.name == "_safe_under"], type_ignores=[]), str(source), "exec"), scope)
        with patch.dict(scope, folder_paths=SimpleNamespace(get_output_directory=lambda: str(self.directory)),
                        DEFAULT_COMPOSE_PREFIX="cap_timeline_compose/",
                        _safe_under_output=lambda path: scope["_safe_under"](str(self.directory), path)):
            meta = scope["compose_to_output"](self.project, filename_prefix="exports/", filename="Movie.mp4",
                export_audio=True, audio_format="wav", export_range=dict(start_frame=0, end_frame=12))
            self.assertEqual([row["filename"] for row in meta["outputs"]], ["Movie.mp4", "Movie.wav"])
            for row in meta["outputs"]:
                self.assertEqual(row["subfolder"], "exports")
                self.assertTrue(Path(row["output_path"]).is_file())
            with self.assertRaises(ValueError):
                scope["resolve_compose_output_path"]("../escape", "Test", "bad.wav", "wav")

    def test_invalid_ranges_and_output_selections(self):
        for bounds in ({"start_frame": 4, "end_frame": 4}, {"start_frame": -1, "end_frame": 5},
                       {"start_frame": 1, "end_frame": 97}, {"start_frame": 0.5, "end_frame": 5},
                       {"start_frame": True, "end_frame": 5}, "invalid"):
            with self.subTest(bounds=bounds), self.assertRaises(ValueError):
                self.compose(export_range=bounds)
        with self.assertRaises(ValueError):
            scope["compose_to_output"](self.project, export_video=False, export_audio=False)
        with self.assertRaises(ValueError):
            scope["compose_to_output"](self.project, export_audio=True, audio_format="../bad")
        with self.assertRaises(ValueError):
            scope["resolve_compose_output_path"]("", "Test", extension="../bad")


if __name__ == "__main__":
    unittest.main()
