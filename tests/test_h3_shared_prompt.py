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
        self.valid_previews = set()
        owner = self

        class Generator:
            def generate_text(self, **kwargs):
                owner.calls.append(kwargs)
                return ("generated " + kwargs["prompt"],)

        class TailLoader:
            @classmethod
            def INPUT_TYPES(cls):
                return {"required": {"tail_name": (["installed_tail.safetensors"],)}}

            def select_tail(self, tail_name):
                return ({"tail_name": tail_name},)

        scope = dict(json=json, nodes=SimpleNamespace(NODE_CLASS_MAPPINGS={"H3QwenVLGenerateText": Generator, "H3QwenVLGenerationTailLoader": TailLoader}),
            prompt_skill_presets=lambda: {'Camera [official__camera]': 'official__camera'},
            load_skill_text=lambda skill_id: 'camera preset rules' if skill_id == 'official__camera' else None,
            latest_draft=lambda data, row: ({}, {}) if row['id'] in self.valid_previews else None,
            comfy=SimpleNamespace(model_management=SimpleNamespace(throw_exception_if_processing_interrupted=lambda: None)),
            CAP_DataJsonClipParser=lambda: SimpleNamespace(_compose_prompt=lambda row, *a, **kw: row["prompt"]),
            prompt_materials=lambda *a: ({}, [], None, []),
            agent_system_prompt=lambda *a: "system", with_prompt_skill=lambda a, b: a + b,
            h3_prompt_skill=lambda p: p["skill"], with_output_language=lambda a, b: a,
            build_user_prompt=lambda p: p["clip_prompt"], _AUDIO_MODE_INSTRUCTIONS={"none": "unused"})
        helper = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == "generate_h3_prompts")
        exec(compile(ast.Module(body=[cls, helper], type_ignores=[]), "shared-prompt", "exec"), scope)
        self.node = scope[cls.name]()
        self.generate = scope["generate_h3_prompts"]
        self.data = {"clips": [
            {"id": "on", "auto_prompt": True, "prompt": "draft", "start_ms": 0, "end_ms": 5000},
            {"id": "off", "auto_prompt": False, "prompt": "manual", "start_ms": 5000, "end_ms": 10000},
        ]}

    def run_prompt(self, clip, data_json, **kwargs):
        data = json.loads(data_json)
        config, = self.node.configure(**kwargs)
        self.generate(clip, data, config)
        report = [{"clip_id": row["id"], "prompt": row["h3_generated_prompt"]}
                  for row in data["clips"] if row.get("h3_generated_prompt")]
        return (json.dumps(data) if report else data_json, json.dumps(report) if report else "")

    def test_config_only_has_settings_and_does_not_load_model(self):
        inputs = self.node.INPUT_TYPES()
        self.assertNotIn('clip', inputs['required'])
        self.assertNotIn('data_json', inputs['required'])
        config, = self.node.configure(tail_name='installed_tail.safetensors', skill='camera')
        self.assertEqual(config['skill'], 'camera')
        self.assertEqual(self.node.RETURN_TYPES, ('CAP_H3_AUTO_PROMPT_CONFIG',))
        self.assertEqual(self.calls, [])

    def test_missing_config_only_errors_for_auto_clips(self):
        with self.assertRaisesRegex(ValueError, 'H3 Auto Prompt Config'):
            self.generate(self.clip, self.data, None)
        self.data['clips'][0]['auto_prompt'] = False
        self.generate(self.clip, self.data, None)
        self.assertEqual(self.calls, [])

    def test_selected_clips_share_clip_and_preserve_draft(self):
        original = json.dumps(self.data)
        output, report = self.run_prompt(self.clip, original, tail_name="installed_tail.safetensors", skill="user skill")
        result = json.loads(output)
        self.assertEqual(len(self.calls), 1)
        self.assertIs(self.calls[0]["clip"], self.clip)
        self.assertIn("user skill", self.calls[0]["system_prompt"])
        self.assertEqual(result["clips"][0]["prompt"], "draft")
        self.assertIn("generated draft", result["clips"][0]["h3_generated_prompt"])
        self.assertEqual(result["clips"][1], self.data["clips"][1])
        self.assertEqual(json.loads(report)[0]["clip_id"], "on")
        self.assertEqual(json.dumps(self.data), original)

    def test_tail_selection_without_loader_connection(self):
        self.run_prompt(self.clip, data_json=json.dumps(self.data), tail_name="installed_tail.safetensors")
        self.assertEqual(self.calls[0]['tail_clip'], {'tail_name': 'installed_tail.safetensors'})
        self.assertNotIn('tail_clip', self.node.INPUT_TYPES()['required'])
        self.assertNotIn('tail_clip', self.node.INPUT_TYPES()['optional'])
        self.assertEqual(self.node.INPUT_TYPES()['optional']['tail_name'][0], ['installed_tail.safetensors'])

    def test_tail_selection_rejects_unlisted_path(self):
        with self.assertRaisesRegex(ValueError, 'tail_name'):
            self.run_prompt(self.clip, data_json=json.dumps(self.data), tail_name='../other.safetensors')
        self.assertEqual(self.calls, [])

    def test_clip_skills_keep_order_and_skip_disabled(self):
        self.data["clips"][0]["prompt_skills"] = [
            {"id": "one", "text": "first rule", "enabled": True},
            {"id": "off", "text": "excluded rule", "enabled": False},
            {"id": "two", "text": "second rule", "enabled": True},
        ]
        self.run_prompt(self.clip, json.dumps(self.data), tail_name="installed_tail.safetensors", skill="global rule")
        system = self.calls[0]["system_prompt"]
        self.assertIn("global rule\n\nfirst rule\n\nsecond rule", system)
        self.assertNotIn("excluded rule", system)

    def test_preset_combines_with_custom_and_clip_skills(self):
        self.data['clips'][0]['prompt_skills'] = [{'text': 'clip rules', 'enabled': True}]
        self.run_prompt(self.clip, json.dumps(self.data), tail_name='installed_tail.safetensors',
                           skill_preset='Camera [official__camera]', skill='custom rules')
        self.assertIn('camera preset rules\n\ncustom rules\n\nclip rules', self.calls[0]['system_prompt'])
        self.assertEqual(self.node.INPUT_TYPES()['required']['skill_preset'][0], ['none', 'Camera [official__camera]'])

    def test_preset_rejects_arbitrary_path(self):
        with self.assertRaisesRegex(ValueError, 'skill preset'):
            self.run_prompt(self.clip, json.dumps(self.data), skill_preset='../SKILL.md')
        self.assertEqual(self.calls, [])

    def test_refine_skips_generation_without_tail(self):
        self.data["h3_generation"] = {"action": "refine"}
        original = json.dumps(self.data)
        self.assertEqual(self.run_prompt(self.clip, data_json=original), (original, ""))
        self.assertNotIn('enabled', self.node.INPUT_TYPES()['optional'])
        self.assertEqual(self.calls, [])

    def test_valid_preview_skips_normal_generation_without_tail(self):
        self.data['clips'][0]['h3_drafts'] = [{'id': 'preview'}]
        self.valid_previews.add('on')
        original = json.dumps(self.data)
        self.assertEqual(self.run_prompt(self.clip, data_json=original), (original, ''))
        self.assertEqual(self.calls, [])

    def test_missing_preview_and_new_draft_still_generate(self):
        self.data['clips'][0]['h3_drafts'] = [{'id': 'preview'}]
        self.run_prompt(self.clip, json.dumps(self.data), tail_name="installed_tail.safetensors")
        self.assertEqual(len(self.calls), 1)
        self.valid_previews.add('on')
        self.data['h3_generation'] = {'action': 'draft'}
        self.run_prompt(self.clip, json.dumps(self.data), tail_name="installed_tail.safetensors")
        self.assertEqual(len(self.calls), 2)

    def test_mixed_clips_only_generate_for_unmatched_preview(self):
        self.data['clips'][0]['h3_drafts'] = [{'id': 'preview'}]
        self.valid_previews.add('on')
        self.data['clips'][1]['auto_prompt'] = True
        output, report = self.run_prompt(self.clip, json.dumps(self.data), tail_name="installed_tail.safetensors")
        self.assertEqual([row['clip_id'] for row in json.loads(report)], ['off'])
        self.assertEqual(json.loads(output)['clips'][0], self.data['clips'][0])

    def test_keyframe_prompts_use_interval_instructions(self):
        self.data['h3_generation'] = {'keyframe_runs': [{'clip_id': 'on'}]}
        self.data['clips'][0].update(id='on__kf3_1', clip_role='video_ref', prompt='third interval',
                                   start_ms=15000, end_ms=20000)
        output, report = self.run_prompt(self.clip, json.dumps(self.data), tail_name='installed_tail.safetensors')
        self.assertIn('generated third interval', json.loads(output)['clips'][0]['h3_generated_prompt'])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual([row['clip_id'] for row in json.loads(report)], ['on__kf3_1'])

    def test_all_flags_false_skip_generation(self):
        self.data["clips"][0]["auto_prompt"] = False
        original = json.dumps(self.data)
        self.assertEqual(self.run_prompt(self.clip, original, tail_name="installed_tail.safetensors"), (original, ""))
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
