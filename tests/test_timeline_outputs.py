import ast
import datetime
import json
from pathlib import Path
from types import SimpleNamespace
import unittest


ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'backend/cap_timeline_editor.py').read_text(encoding='utf-8-sig'))
node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_TimelineEditor')
contract = {n.targets[0].id: ast.literal_eval(n.value) for n in node.body
            if isinstance(n, ast.Assign) and n.targets[0].id in ('RETURN_NAMES', 'RETURN_TYPES')}
execute = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')


class TimelineOutputsTests(unittest.TestCase):
    def test_single_clip_keeps_existing_predecessor_video_before_filtering(self):
        from test_h3_timing import h3
        namespace = dict(json=json, datetime=datetime, PROJECT_VERSION='test', SCHEMA_VERSION=4,
                         clear_clip_prompt_vl=lambda: None, _setting_prompt=lambda s, k: s.get(k, ''),
                         _safe_filename_part=lambda name, default: name or default,
                         plan_h3_clips=h3.plan_h3_clips, _is_subtitle_clip=lambda c: False,
                         _clip_visual_entries=lambda *a: [], _strip_comment_lines=lambda s: s,
                         _clip_role_fields=lambda c: (c.get('clip_role', 'multi_ref'), ''), _clip_agent_fields=lambda c: ('MiniMaxH3', ''),
                         _timeline_prompt_includes=lambda c: ['clip'], _clip_seed=lambda c: 1,
                         _h3_motion_context_length=lambda c: c.get('h3_motion_context_length', 0),
                         _clip_image_refs=lambda e: [])
        exec(compile(ast.Module(body=[execute], type_ignores=[]), '<timeline execute>', 'exec'), namespace)
        first = dict(id='a', prompt='First', save_latent=True, generated_videos=[
            dict(file='disabled.mp4', enabled=False), dict(file='existing.mp4'), dict(file='older.mp4')])
        second = dict(id='b', prompt='Second', h3_motion_context_length=22, h3_drafts=[{'id': 'preview', 'enabled': True}],
                      head_extend_sec=2, tail_extend_sec=3, generate_preview_video=True)
        instance = SimpleNamespace(
            _project=lambda value: json.loads(value),
            _visual_segments=lambda clips: [(first, 0, 5000, 0), (second, 5000, 10000, 0)],
            _audio_slices=lambda *a: [], _concat_runtime_clips_audio=lambda *a, **kw: None,
            _prepare_frame_seq_dir=lambda: 'frame-dir')
        project = dict(settings=dict(runtime_only_clip_ids=['b']), tracks=[])
        result = namespace['execute'](instance, 24, 864, 480, 'test', json.dumps(project))
        rows = json.loads(result[3])['clips']
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]['source_clip_id'], 'b')
        self.assertEqual(rows[0]['h3_drafts'], second['h3_drafts'])
        self.assertEqual(rows[0]['previous_output_video'], 'existing.mp4')
        self.assertEqual(rows[0]['h3_timing']['context_frames'], 22)
        self.assertEqual((rows[0]['start_ms'], rows[0]['end_ms']), (5000, 10000))
        self.assertEqual(rows[0]['h3_timing']['head_frames'], 0)
        self.assertEqual(rows[0]['h3_timing']['play_frames'], 120)
        for removed in ('head_extend_sec', 'tail_extend_sec', 'generate_preview_video'):
            self.assertNotIn(removed, rows[0])
        audio_rows = [{'id': 'audio-reference'}]
        calls = []
        instance._audio_slices = lambda *a: calls.append(a) or audio_rows
        for role, option, expected in [('multi_ref', None, False), ('multi_ref', True, True),
                                       ('digital_human', None, True), ('digital_human', False, False)]:
            with self.subTest(role=role, option=option):
                second['clip_role'] = role
                second.pop('use_audio_track_audio', None)
                if option is not None:
                    second['use_audio_track_audio'] = option
                calls.clear()
                result = namespace['execute'](instance, 24, 864, 480, 'test', json.dumps(project))
                row = json.loads(result[3])['clips'][0]
                self.assertEqual(row['use_audio_track_audio'], expected)
                self.assertEqual(row['audios'], audio_rows if expected else [])
                self.assertEqual(len(calls), int(expected), 'disabled clips must not collect or mix track audio')

    def test_execution_matches_output_contract_and_preserves_prompt_data(self):
        namespace = dict(json=json, datetime=datetime, PROJECT_VERSION='test', SCHEMA_VERSION=4,
                         clear_clip_prompt_vl=lambda: None, _setting_prompt=lambda s, k: s.get(k, ''),
                         _safe_filename_part=lambda name, default: name or default,
                         plan_h3_clips=lambda clips, fps: None)
        exec(compile(ast.Module(body=[execute], type_ignores=[]), '<timeline execute>', 'exec'), namespace)
        audio = object()
        instance = SimpleNamespace(
            _project=lambda value: json.loads(value), _visual_segments=lambda clips: [],
            _concat_runtime_clips_audio=lambda clips, materials: audio,
            _prepare_frame_seq_dir=lambda: 'frame-dir',
        )
        project = json.dumps(dict(settings=dict(prepend_prompt='Keep style', append_prompt='Keep ending'), tracks=[]))
        result = namespace['execute'](instance, 24, 864, 480, 'test', project)
        self.assertEqual(contract['RETURN_NAMES'], ('fps', 'width', 'height', 'data_json', 'clips_length',
                                                    'total_frame_count', 'clips_audio', 'frame_seq_dir'))
        self.assertEqual(contract['RETURN_TYPES'], ('FLOAT', 'INT', 'INT', 'STRING', 'INT', 'INT', 'AUDIO', 'STRING'))
        self.assertEqual(len(result), len(contract['RETURN_NAMES']))
        self.assertEqual(result[:3], (24.0, 864, 480))
        self.assertEqual(result[4:], (0, 1, audio, 'frame-dir'))
        data = json.loads(result[3])
        self.assertEqual(data['prepend_prompt'], 'Keep style')
        self.assertEqual(data['append_prompt'], 'Keep ending')
        for language in ('en', 'zh', 'ja'):
            locale = json.loads((ROOT / 'locales' / language / 'nodeDefs.json').read_text(encoding='utf-8-sig'))
            self.assertEqual(tuple(locale['CAP_TimelineEditor']['outputs']), contract['RETURN_NAMES'])


if __name__ == '__main__':
    unittest.main()
