"""Check V1 and V3 menu categories without loading models or starting the server."""
import ast
from pathlib import Path
import unittest


BACKEND = Path(__file__).resolve().parents[1] / "backend"
GROUPS = {
    "Timeline": ("cap_data_json_parser", "cap_timeline_preview"),
    "MiniMaxH3": ("cap_minimax_h3", "cap_h3_fast_audio_refine", "cap_h3_timeline_sequence", "cap_h3_video_generator"),
    "Video": ("cap_seq_to_video", "cap_compose_clip_videos", "cap_model_preview"),
    "Image": ("cap_load_image_metadata", "cap_save_images", "cap_load_images_from_dir", "cap_image_batch"),
    "Prompt": ("prompt_input_rich", "cap_prompt_group", "cap_clip_prompt_vl"),
    "Utils": ("cap_size_settings", "cap_clear_directory", "cap_windows_shutdown", "cap_format_json", "cap_show_anything", "cap_join_strings"),
}
INTERNAL = {"CAP_H3SequenceContinuation", "CAP_H3SequenceTrimVideo", "CAP_H3SequenceAudioJoin", "CAP_H3SequenceTrimAudio"}


class NodeCategoryTests(unittest.TestCase):
    def test_all_node_categories(self):
        expected = {module: "Capricorncd/" + group for group, modules in GROUPS.items() for module in modules}
        expected["cap_timeline_editor"] = "Capricorncd"
        found = {}
        for path in BACKEND.glob("*.py"):
            tree = ast.parse(path.read_text(encoding="utf-8-sig"))
            for cls in (n for n in tree.body if isinstance(n, ast.ClassDef)):
                categories = []
                for node in ast.walk(cls):
                    if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "CATEGORY" for t in node.targets):
                        categories.append(ast.literal_eval(node.value))
                    elif isinstance(node, ast.keyword) and node.arg == "category":
                        categories.append(ast.literal_eval(node.value))
                if not categories:
                    continue
                with self.subTest(node=cls.name):
                    self.assertNotIn(cls.name, found)
                    self.assertIn(path.stem, expected, "New node modules need an explicit menu group")
                    category = expected[path.stem] + ("/Internal" if cls.name in INTERNAL else "")
                    self.assertEqual(categories, [category])
                    found[cls.name] = category
        self.assertEqual(len(found), 34)
        self.assertEqual({name for name, category in found.items() if category.endswith("/Internal")}, INTERNAL)


if __name__ == "__main__":
    unittest.main()
