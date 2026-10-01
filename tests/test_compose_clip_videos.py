import ast
import json
import logging
import os
import shutil
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


class CompositionTailTests(unittest.TestCase):
    def test_final_tail_preserves_alignment_and_previous_segments(self):
        method = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == "execute")
        for spans in (False, True):
            for keep_tail in (False, True):
                with self.subTest(spans=spans, keep_tail=keep_tail), tempfile.TemporaryDirectory() as directory:
                    clips = []
                    for index in range(2):
                        filename = f"{index}.mp4"
                        (Path(directory) / filename).touch()
                        clip = dict(output_video=filename, source_clip_id=str(index))
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
                    composer._trim_plan.return_value = (22 / 24, 5)
                    with patch.object(shutil, "which", return_value="ffmpeg"):
                        local["execute"](composer, "{}", save_sidecar=False, keep_final_tail=keep_tail)
                    calls = composer._normalize_segment.call_args_list
                    self.assertEqual(len(calls), 2)
                    self.assertEqual(calls[0].args[2:], (22 / 24, 5, True))
                    self.assertEqual(calls[1].args[2:], (22 / 24, None if keep_tail else 5, True))


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
        self.assertEqual(self.plan(175, previous=False), (None, None))

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
