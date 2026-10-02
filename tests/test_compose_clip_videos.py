import ast
import array
import json
import logging
import math
import os
import shutil
import subprocess
import tempfile
from pathlib import Path
import sys
import unittest
import importlib.util
from unittest.mock import Mock, patch


# Load the trim planner without importing ComfyUI's model/runtime dependencies.
source = (Path(__file__).resolve().parents[1] / "backend") / "cap_compose_clip_videos.py"
tree = ast.parse(source.read_text(encoding="utf-8-sig"))
node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "CAP_ComposeClipVideos")
method = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == "_trim_plan")
spec = importlib.util.spec_from_file_location("h3_timing", source.parent / "h3_timing.py")
timing = importlib.util.module_from_spec(spec)
spec.loader.exec_module(timing)
scope = {"json": json, "sys": sys, "subprocess": Mock(), "_ffmpeg_path": str,
         "timing_from_filename": timing.timing_from_filename, "trim_h3_video": timing.trim_h3_video}
exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), "exec"), scope)
helpers = [n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name in
           ("_digital_human_groups", "_continuous_audio_clip")]
exec(compile(ast.Module(body=helpers, type_ignores=[]), str(source), "exec"), scope)


class ContinuousAudioTests(unittest.TestCase):
    def clips(self):
        return [dict(clip_role="digital_human", start_ms=i * 1000, end_ms=(i + 1) * 1000,
                     audios=[dict(id="song", source_clip_id="audio1", source_start_ms=5000 + i * 1000,
                                  source_end_ms=6000 + i * 1000, clip_offset_ms=0)]) for i in range(2)]

    def test_only_adjacent_digital_human_runs(self):
        clips = self.clips()
        self.assertEqual(scope["_digital_human_groups"](clips), [[0, 1]])
        self.assertEqual(scope["_digital_human_groups"](clips[:1]), [])
        self.assertEqual(scope["_digital_human_groups"]([clips[0], dict(start_ms=1000, end_ms=1000), clips[1]]), [])
        clips[1]["start_ms"] += 100
        self.assertEqual(scope["_digital_human_groups"](clips), [])

    def test_source_is_read_once_across_cut_and_tail(self):
        clips = self.clips()
        result = scope["_continuous_audio_clip"]({}, clips, 2250)
        self.assertEqual(len(result["audios"]), 1)
        self.assertEqual(result["audios"][0]["source_start_ms"], 5000)
        self.assertEqual(result["audios"][0]["source_end_ms"], 7250)
        self.assertEqual(clips[0]["audios"][0]["source_end_ms"], 6000)

    def test_preview_padding_speed_and_volume_points(self):
        clips = self.clips()
        for i, clip in enumerate(clips):
            clip.update(start_ms=i * 1000 - 100, end_ms=(i + 1) * 1000 + 100,
                        preview_start_ms=i * 1000, preview_end_ms=(i + 1) * 1000)
            clip["audios"][0].update(source_start_ms=5000 + i * 2000 - 200,
                                    source_end_ms=5000 + (i + 1) * 2000 + 200,
                                    playback_rate=2, volume_points=[{"time_ms": 6000, "volume": 0.5}])
        rows = scope["_continuous_audio_clip"]({}, clips, 2250)["audios"]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["source_start_ms"], rows[0]["source_end_ms"]), (5000, 9500))
        self.assertEqual(rows[0]["clip_offset_ms"], 0)
        self.assertEqual(rows[0]["volume_points"], clips[0]["audios"][0]["volume_points"])

    def test_master_audio_and_different_sources(self):
        clips = self.clips()
        clips[1]["audios"][0]["id"] = "another_song"
        self.assertEqual(len(scope["_continuous_audio_clip"]({}, clips, 2000)["audios"]), 2)
        for clip in clips:
            del clip["audios"]
        rows = scope["_continuous_audio_clip"]({"audio_path": "song.wav", "trim_start_ms": 4000}, clips, 2000)["audios"]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["source_start_ms"], rows[0]["source_end_ms"]), (4000, 6000))

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "requires FFmpeg")
    def test_real_mux_has_continuous_audio_at_video_cut(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            video = root / "part.mp4"
            wav = root / "song.wav"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=s=32x32:r=24:d=1",
                            "-c:v", "libx264", str(video)], check=True, capture_output=True)
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=frequency=440:sample_rate=48000:duration=2",
                            "-ac", "2", str(wav)], check=True, capture_output=True)
            local = dict(scope, os=os, subprocess=subprocess,
                         _run_ffmpeg=lambda cmd: subprocess.run(cmd, check=True, capture_output=True),
                         _probe_duration_sec=lambda path: float(subprocess.check_output([
                             "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path])),
                         _write_audio_tmp=lambda audio: str(wav))
            methods = [n for n in node.body if isinstance(n, ast.FunctionDef) and n.name in
                       ("_compose_digital_human_group", "_merge_audio")]
            exec(compile(ast.Module(body=methods, type_ignores=[]), str(source), "exec"), local)
            composer = type("Composer", (), {n.name: local[n.name] for n in methods})()
            parser = Mock()
            parser._audio_row_path.return_value = str(wav)
            clips = self.clips()
            for clip in clips:
                for row in clip["audios"]:
                    row["source_start_ms"] -= 5000
                    row["source_end_ms"] -= 5000
            output = composer._compose_digital_human_group({}, clips, [str(video)] * 2, directory, parser)
            parser._clip_audio_from_audios.assert_called_once()
            self.assertEqual(len(parser._clip_audio_from_audios.call_args.args[0]["audios"]), 1)
            decoded = subprocess.check_output(["ffmpeg", "-v", "error", "-i", output, "-map", "0:a:0",
                                               "-ac", "1", "-f", "f32le", "-"])
            samples = array.array("f", decoded)
            # Every 5 ms around the one-second picture cut must still contain the tone.
            for start in range(48000 - 960, 48000 + 960, 240):
                rms = math.sqrt(sum(v * v for v in samples[start:start + 240]) / 240)
                self.assertGreater(rms, 0.03)
            self.assertAlmostEqual(local["_probe_duration_sec"](output), 2, delta=0.05)
            self.assertFalse(wav.exists())


class CompositionTailTests(unittest.TestCase):
    def test_final_tail_preserves_alignment_and_previous_segments(self):
        method = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        for spans, digital in ((False, False), (True, False), (False, True), (True, True)):
            for keep_tail in (False, True):
                with self.subTest(spans=spans, keep_tail=keep_tail), tempfile.TemporaryDirectory() as directory:
                    clips = []
                    for index in range(2):
                        filename = f"{index}.mp4"
                        (Path(directory) / filename).touch()
                        clip = dict(output_video=filename, source_clip_id=str(index), start_ms=index * 5000, end_ms=(index + 1) * 5000)
                        if digital:
                            clip["clip_role"] = "digital_human"
                        if spans:
                            clip["playback_spans"] = [dict(source_clip_id=str(index), start_frame=22, frame_count=120),
                                                      dict(source_clip_id=str(index), start_frame=142, frame_count=0)]
                        clips.append(clip)
                    # A disabled trailing clip must not prevent preserving the final active clip.
                    clips.append(dict(enabled=False))
                    local = dict(scope, os=os, shutil=shutil, tempfile=tempfile, log=logging.getLogger(__name__),
                                 folder_paths=Mock(get_output_directory=lambda: directory),
                                 CAP_DataJsonClipParser=Mock(), _safe_under=lambda base, path: path,
                                 _VIDEO_EXTS=(".mp4",), _probe_has_audio=lambda path: True,
                                 _run_ffmpeg=Mock(), read_video_generation=Mock(return_value=None),
                                 embed_video_generation=Mock())
                    local["subprocess"].run.return_value = Mock(returncode=0, stdout=json.dumps({
                        "streams": [{"nb_frames": "175", "r_frame_rate": "24/1"}]}))
                    exec(compile(ast.Module(body=[method], type_ignores=[]), str(source), "exec"), local)
                    composer = Mock()
                    composer._parse_data.return_value = dict(fps=24, clips=clips)
                    composer._build_output_path.return_value = ("final.mp4", "", os.path.join(directory, "final.mp4"))
                    composer._trim_plan.return_value = (22 / 24, 136 / 24)
                    composer._compose_digital_human_group.return_value = os.path.join(directory, "group.mp4")
                    with patch.object(shutil, "which", return_value="ffmpeg"):
                        local["execute"](composer, "{}", save_sidecar=False, keep_final_tail=keep_tail)
                    calls = composer._normalize_segment.call_args_list
                    self.assertEqual(len(calls), 2)
                    self.assertEqual(calls[0].args[2:], (22 / 24, 5, not digital))
                    self.assertEqual(calls[1].args[2:], (22 / 24, None if keep_tail else 5, not digital))
                    if digital:
                        composer._compose_digital_human_group.assert_called_once()
                        self.assertEqual(composer._compose_digital_human_group.call_args.args[1], clips[:2])
                    else:
                        composer._compose_digital_human_group.assert_not_called()


class TrimTests(unittest.TestCase):
    def plan(self, count, previous=True, context=39, save=False, **extra):
        scope["subprocess"].run.return_value = Mock(returncode=0, stdout=json.dumps({
            "streams": [{"nb_frames": str(count), "r_frame_rate": "24/1"}],
        }))
        clip = dict(start_ms=0, end_ms=5000, h3_motion_context_length=context, save_latent=save, **extra)
        return scope["_trim_plan"](None, clip, "test.mp4", True, 24, {"save_latent": previous})

    def test_full_video_mode_ignores_clip_and_h3_trim_metadata(self):
        clip = dict(start_ms=0, end_ms=5000, h3_motion_context_length=39,
                    head_trim_ms=1000, tail_end_ms=4000,
                    h3_timing={"raw_frames": 175, "context_frames": 39, "tail_frames": 16})
        self.assertEqual(scope["_trim_plan"](None, clip, "test.mp4", False, 24, {"save_latent": True}), (None, None))

    def test_raw_context(self):
        self.assertEqual(self.plan(175), (39 / 24, 136 / 24))

    def test_already_trimmed_context(self):
        self.assertEqual(self.plan(136), (0, 136 / 24))

    def test_already_final_length(self):
        self.assertEqual(self.plan(120), (None, 5))

    def test_previous_save_is_required(self):
        self.assertEqual(self.plan(175, previous=False), (0, 5))

    def test_digital_human_without_timing_trims_to_clip(self):
        self.assertEqual(self.plan(175, previous=False, context=0, clip_role="digital_human"), (0, 5))
        self.assertEqual(self.plan(175, previous=False, context=0, clip_role="digital_human",
                                   preview_start_ms=1000, preview_end_ms=4500), (1, 3.5))

    def test_first_clip_preserves_continuation_tail(self):
        self.assertEqual(self.plan(124, previous=False, save=True), (0, 124 / 24))

    def test_current_save_does_not_enable_context(self):
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            self.plan(175, previous=False, save=True)

    def test_preview_range(self):
        self.assertEqual(self.plan(175, preview_start_ms=1000, preview_end_ms=4500), (39 / 24 + 1, 100 / 24))

    def test_ambiguous_length_fails(self):
        with self.assertRaisesRegex(ValueError, "ambiguous"):
            self.plan(200)

    def test_filename_snapshot_overrides_modified_clip_settings(self):
        self.plan(175)
        file = "clip__h3v1_c39_r175_h0_t0_f24000_s1.mp4"
        changed_clip = dict(start_ms=0, end_ms=3000, h3_motion_context_length=5, save_latent=False)
        self.assertEqual(scope["_trim_plan"](None, changed_clip, file, True, 24, None), (39 / 24, 136 / 24))


if __name__ == "__main__":
    unittest.main()
