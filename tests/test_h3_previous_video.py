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


if __name__ == "__main__":
    unittest.main()
