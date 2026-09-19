import ast
import copy
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import Mock


BACKEND = Path(__file__).resolve().parents[1] / "backend"


def load_definitions(filename, names, scope):
    tree = ast.parse((BACKEND / filename).read_text(encoding="utf-8"))
    definitions = [n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name in names]
    exec(compile(ast.Module(body=definitions, type_ignores=[]), filename, "exec"), scope)
    return scope


class PreviousVideoTests(unittest.TestCase):
    def setUp(self):
        self.scope = load_definitions("cap_minimax_h3.py", {"_prev_clip_output_video_path"}, {
            "json": json, "os": os, "_resolve_output_file": lambda rel: os.path.normpath(rel) if os.path.isfile(rel) else "",
        })
        self.resolve = self.scope["_prev_clip_output_video_path"]

    def test_self_contained_clip_resolves_without_timeline_or_index(self):
        scope = load_definitions("cap_data_json_parser.py", {"_build_clip_json"}, {
            "copy": copy, "json": json, "os": os,
        })
        parser = Mock()
        parser._clip_prompt_includes.return_value = ["clip"]
        parser._normalize_prompt_concat_order.return_value = ["clip"]
        parser._ref_list.return_value = []
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "previous.mp4"
            video.touch()
            clip = {"id": "second", "h3_motion_context_length": 22}
            result = json.loads(scope["_build_clip_json"](
                parser, clip, {}, previous_output_video=str(video),
            ))
            self.assertEqual(self.resolve("", 0, result["previous_output_video"]), str(video))
            self.assertNotIn("previous_output_video", clip)
            first = json.loads(scope["_build_clip_json"](parser, result, {}))
            self.assertEqual(first["previous_output_video"], "")

    def test_full_timeline_still_resolves_predecessor(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "previous.mp4"
            video.touch()
            data = json.dumps({"clips": [{"output_video": str(video)}, {}]})
            self.assertEqual(self.resolve(data, 1), str(video))
            self.assertEqual(self.resolve(data, 0), "")
            self.assertEqual(self.resolve(data, 2), "")

    def test_missing_video_does_not_select_an_unrelated_file(self):
        self.assertEqual(self.resolve("", 0, "missing.mp4"), "")

    def test_selected_clip_carries_previous_video_and_tracks_resolve_by_id(self):
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "previous.mp4"
            video.touch()
            row = {"previous_output_video": str(video),
                   "h3_timing": {"previous_source_clip_id": "a", "context_frames": 22}}
            self.assertEqual(self.resolve(json.dumps({"clips": [row]}), 0), str(video))
            del row["previous_output_video"]
            data = {"clips": [{"id": "a", "output_video": str(video)},
                              {"id": "other-track", "output_video": "wrong.mp4"}, row]}
            self.assertEqual(self.resolve(json.dumps(data), 2), str(video))

    def test_video_tail_contains_exactly_requested_frames_and_audio(self):
        import torch
        from types import SimpleNamespace
        import logging
        frames = torch.arange(40).reshape(40, 1, 1, 1)
        waveform = torch.arange(40000).reshape(1, 1, 40000)
        components = SimpleNamespace(images=frames, frame_rate=24,
                                     audio={"waveform": waveform, "sample_rate": 24000})
        scope = load_definitions("cap_minimax_h3.py", {"_load_motion_context_from_video"}, {
            "torch": torch, "os": os, "H3_FPS": 24, "_LOG": logging.getLogger(__name__),
            "VideoFromFile": lambda *a, **kw: SimpleNamespace(get_components=lambda: components),
            "_frames_at_fps": lambda frames, *a: frames,
        })
        with tempfile.NamedTemporaryFile() as video:
            tail, audio = scope["_load_motion_context_from_video"](video.name, 22)
        self.assertEqual(tail[:, 0, 0, 0].tolist(), list(range(18, 40)))
        self.assertEqual(audio["waveform"].shape[-1], 22000)
        self.assertEqual(audio["waveform"][0, 0, 0].item(), 18000)


if __name__ == "__main__":
    unittest.main()
