import ast
import json
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]


class SharedPromptTests(unittest.TestCase):
    def setUp(self):
        tree = ast.parse((ROOT / "backend/cap_h3_prompt_generator.py").read_text(encoding="utf-8"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef))
        self.calls = []
        self.clip = object()
        owner = self

        class Generator:
            def generate_text(self, **kwargs):
                owner.calls.append(kwargs)
                return ("generated " + kwargs["prompt"],)

        scope = dict(json=json, nodes=SimpleNamespace(NODE_CLASS_MAPPINGS={"H3QwenVLGenerateText": Generator}),
            comfy=SimpleNamespace(model_management=SimpleNamespace(throw_exception_if_processing_interrupted=lambda: None)),
            CAP_DataJsonClipParser=lambda: SimpleNamespace(_compose_prompt=lambda row, *a, **kw: row["prompt"]),
            prompt_materials=lambda *a: ({}, [], None, []),
            agent_system_prompt=lambda *a: "system", with_prompt_skill=lambda a, b: a + b,
            h3_prompt_skill=lambda p: p["skill"], with_output_language=lambda a, b: a,
            build_user_prompt=lambda p: p["clip_prompt"], _AUDIO_MODE_INSTRUCTIONS={"none": "unused"})
        exec(compile(ast.Module(body=[cls], type_ignores=[]), "shared-prompt", "exec"), scope)
        self.node = scope[cls.name]()
        self.data = {"clips": [
            {"id": "on", "auto_prompt": True, "prompt": "draft", "start_ms": 0, "end_ms": 5000},
            {"id": "off", "auto_prompt": False, "prompt": "manual", "start_ms": 5000, "end_ms": 10000},
        ]}

    def test_selected_clips_share_clip_and_preserve_draft(self):
        original = json.dumps(self.data)
        output, report = self.node.generate(self.clip, "tail", original, skill="user skill")
        result = json.loads(output)
        self.assertEqual(len(self.calls), 1)
        self.assertIs(self.calls[0]["clip"], self.clip)
        self.assertIn("user skill", self.calls[0]["system_prompt"])
        self.assertEqual(result["clips"][0]["prompt"], "draft")
        self.assertIn("generated draft", result["clips"][0]["h3_generated_prompt"])
        self.assertEqual(result["clips"][1], self.data["clips"][1])
        self.assertEqual(json.loads(report)[0]["clip_id"], "on")
        self.assertEqual(json.dumps(self.data), original)

    def test_clip_skills_keep_order_and_skip_disabled(self):
        self.data["clips"][0]["prompt_skills"] = [
            {"id": "one", "text": "first rule", "enabled": True},
            {"id": "off", "text": "excluded rule", "enabled": False},
            {"id": "two", "text": "second rule", "enabled": True},
        ]
        self.node.generate(self.clip, "tail", json.dumps(self.data), skill="global rule")
        system = self.calls[0]["system_prompt"]
        self.assertIn("global rule\n\nfirst rule\n\nsecond rule", system)
        self.assertNotIn("excluded rule", system)

    def test_disabled_and_refine_skip_generation(self):
        for enabled, action in [(False, "normal"), (True, "refine")]:
            self.data["h3_generation"] = {"action": action}
            original = json.dumps(self.data)
            self.assertEqual(self.node.generate(self.clip, "tail", original, enabled=enabled), (original, ""))
        self.assertEqual(self.calls, [])

    def test_all_flags_false_skip_generation(self):
        self.data["clips"][0]["auto_prompt"] = False
        original = json.dumps(self.data)
        self.assertEqual(self.node.generate(self.clip, "tail", original), (original, ""))
        self.assertEqual(self.calls, [])

    def test_final_prompt_is_not_concatenated_twice(self):
        tree = ast.parse((ROOT / "backend/cap_data_json_parser.py").read_text(encoding="utf-8"))
        cls = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == "CAP_DataJsonClipParser")
        method = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == "_compose_prompt")
        scope = {}
        exec(compile(ast.Module(body=[method], type_ignores=[]), "parser", "exec"), scope)
        self.assertEqual(scope["_compose_prompt"](None,
            {"auto_prompt": True, "prompt": "draft", "h3_generated_prompt": "final"}, "global",
            prepend_prompt="before", append_prompt="after"), "final")


if __name__ == "__main__":
    unittest.main()
