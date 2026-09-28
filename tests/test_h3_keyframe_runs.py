import copy
import ast
import importlib.util
from pathlib import Path
from types import SimpleNamespace
import unittest

spec = importlib.util.spec_from_file_location('h3_keyframe_runs', Path(__file__).resolve().parents[1] / 'backend/h3_keyframe_runs.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class KeyframeRunTests(unittest.TestCase):
    def data(self):
        return dict(fps=24, materials=[dict(id='ref', file='trim.mp4', video_trim=dict(file='original.mp4'))],
                    clips=[dict(id='a', source_clip_id='a', clip_role='video_ref', start_ms=1000, end_ms=26000, output_video='run.mp4',
                                prompt='base', images=[dict(id='ref')], audios=[])])

    def test_long_clip_continues_and_keeps_tail_trim(self):
        data = self.data()
        data['clips'][0]['h3_drafts'] = [{'id': 'saved-preview'}]
        self.assertTrue(module.expand_keyframe_runs(data))
        self.assertTrue(all(row['h3_drafts'] == [{'id': 'saved-preview'}] for row in data['clips']))
        self.assertEqual(len(data['clips']), 3)
        self.assertEqual(sum(row['h3_timing']['play_frames'] for row in data['clips']), 600)
        self.assertEqual([row['save_latent'] for row in data['clips']], [True, True, False])
        self.assertEqual(data['clips'][1]['h3_timing']['previous_source_clip_id'], data['clips'][0]['source_clip_id'])
        for row in data['clips']:
            timing = row['h3_timing']
            self.assertLessEqual(timing['play_frames'], 240)
            self.assertEqual(timing['raw_frames'] - timing['context_frames'] + timing['context_carry_frames'] - timing['tail_frames'], timing['play_frames'])

    def test_selection_reference_slice_and_prompt(self):
        data = self.data()
        data['h3_generation'] = dict(keyframe_runs=[dict(clip_id='a', clip_start_ms=1000, fps=24,
            reference=dict(id='ref', start=7, rate=2), intervals=[dict(start_frame=120, end_frame=600, prompt='turn')])])
        original = copy.deepcopy(data['clips'][0])
        module.expand_keyframe_runs(data)
        self.assertEqual(len(data['clips']), 2)
        self.assertEqual(data['clips'][0]['keyframe_segment']['start_frame'], 120)
        self.assertEqual(data['clips'][1]['keyframe_segment']['end_frame'], 600)
        self.assertEqual([row['video_trim']['start'] for row in data['materials'][1:]], [17, 37])
        self.assertEqual([row['prompt'] for row in data['clips']], ['turn', 'turn'])
        self.assertTrue(all(row['keyframe_segment']['prompt'] == 'turn' for row in data['clips']))
        self.assertEqual(original['images'], [dict(id='ref')])

    def test_blank_keyframe_prompts_fall_back_per_interval(self):
        data = self.data()
        prompts = ['first shot', '', ' \n\t ', None]
        data['h3_generation'] = dict(keyframe_runs=[dict(clip_id='a', clip_start_ms=1000, fps=24,
            intervals=[dict(start_frame=i * 120, end_frame=(i + 1) * 120, prompt=prompt)
                       for i, prompt in enumerate(prompts)])])
        original = data['clips'][0]
        module.expand_keyframe_runs(data)
        expected = ['first shot', 'base', 'base', 'base']
        self.assertEqual([row['prompt'] for row in data['clips']], expected)
        self.assertEqual([row['keyframe_segment']['prompt'] for row in data['clips']], expected)
        self.assertEqual(original['prompt'], 'base')

    def test_segment_prompts_override_auto_prompt_and_keep_global_selections(self):
        data = self.data()
        data['clips'][0].update(auto_prompt=True, h3_generated_prompt='stale automatic text',
                                prompt_includes=['clip'], use_prepend_prompt=True, use_append_prompt=False)
        original = copy.deepcopy(data['clips'][0])
        data['h3_generation'] = dict(keyframe_runs=[dict(clip_id='a', clip_start_ms=1000, fps=24,
            intervals=[dict(start_frame=0, end_frame=120, prompt='keyframe text'),
                       dict(start_frame=120, end_frame=240, prompt=' \n ')])])
        module.expand_keyframe_runs(data)
        tree = ast.parse((Path(__file__).resolve().parents[1] / 'backend/cap_data_json_parser.py').read_text(encoding='utf-8'))
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'CAP_DataJsonClipParser')
        methods = [node for node in cls.body if isinstance(node, ast.FunctionDef)
                   and node.name in {'_compose_prompt', '_timeline_prompt_includes', '_ref_id'}]
        scope = {}
        exec(compile(ast.Module(body=methods, type_ignores=[]), '<prompt>', 'exec'), scope)
        parser = SimpleNamespace(_clip_prompt_includes=lambda row: row['prompt_includes'],
                                 _normalize_prompt_concat_order=lambda value: ['global', 'clip'],
                                 _strip_comment_lines=lambda text: text,
                                 _ref_list=lambda value: [],
                                 _timeline_prompt_includes=lambda row: scope['_timeline_prompt_includes'](None, row))
        for row, expected in zip(data['clips'], ['keyframe text', 'base']):
            self.assertFalse(row['auto_prompt'])
            self.assertNotIn('h3_generated_prompt', row)
            compose = lambda: scope['_compose_prompt'](parser, row, '', prepend_prompt='selected global', append_prompt='unselected global')
            self.assertEqual(compose(), 'selected global\n\n' + expected)
            row.update(use_prepend_prompt=False, use_append_prompt=True)
            self.assertEqual(compose(), expected + '\n\nunselected global')
        self.assertTrue(original['auto_prompt'])
        self.assertEqual(original['h3_generated_prompt'], 'stale automatic text')

    def test_unsegmented_clip_keeps_its_prompt(self):
        for role in ['video_ref', 't2v']:
            with self.subTest(role=role):
                data = self.data()
                data['clips'][0].update(clip_role=role, end_ms=6000)
                self.assertFalse(module.expand_keyframe_runs(data))
                self.assertEqual(data['clips'][0]['prompt'], 'base')

    def test_no_end_only_interval_and_no_empty_run(self):
        data = self.data()
        data['h3_generation'] = dict(keyframe_runs=[dict(clip_id='a', clip_start_ms=1000, fps=24, intervals=[])])
        with self.assertRaises(ValueError): module.expand_keyframe_runs(data)


if __name__ == '__main__': unittest.main()
