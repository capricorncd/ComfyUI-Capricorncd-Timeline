import ast
import datetime
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from test_h3_prompt_mentions import h3 as mentions


ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'backend/cap_timeline_editor.py').read_text(encoding='utf-8-sig'))
node = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_TimelineEditor')
contract = {n.targets[0].id: ast.literal_eval(n.value) for n in node.body
            if isinstance(n, ast.Assign) and n.targets[0].id in ('RETURN_NAMES', 'RETURN_TYPES')}
execute = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')


class TimelineOutputsTests(unittest.TestCase):
    def test_single_clip_keeps_existing_predecessor_video_before_filtering(self):
        from test_h3_timing import h3
        namespace = dict(prompt_reference_rows=mentions.prompt_reference_rows, json=json, datetime=datetime, PROJECT_VERSION='test', SCHEMA_VERSION=4,
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
            dict(file='b_previous_run.mp4', enabled=True, h3_context_from='b-video'),
            dict(file='disabled.mp4', enabled=False), dict(file='existing.mp4'), dict(file='older.mp4')])
        second = dict(last_frame_media_id='tail-image', id='b', prompt='Second', h3_motion_context_length=22, h3_drafts=[{'id': 'preview', 'enabled': True}],
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
        self.assertEqual(rows[0]['last_frame_media_id'], 'tail-image')
        self.assertEqual(rows[0]['h3_drafts'], second['h3_drafts'])
        self.assertEqual(rows[0]['previous_output_video'], 'existing.mp4')
        self.assertEqual(rows[0]['h3_timing']['context_frames'], 22)
        self.assertEqual((rows[0]['start_ms'], rows[0]['end_ms']), (5000, 10000))
        self.assertEqual(rows[0]['h3_timing']['head_frames'], 0)
        self.assertEqual(rows[0]['h3_timing']['play_frames'], 120)
        for removed in ('head_extend_sec', 'tail_extend_sec', 'generate_preview_video'):
            self.assertNotIn(removed, rows[0])
        original_videos = first['generated_videos']
        first['generated_videos'] = original_videos[:1]
        result = namespace['execute'](instance, 24, 864, 480, 'test', json.dumps(project))
        self.assertNotIn('previous_output_video', json.loads(result[3])['clips'][0])
        first['generated_videos'] = original_videos
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


class ParserLastFrameTests(unittest.TestCase):
    def test_explicit_assignment_and_disabled_tail(self):
        tree = ast.parse((Path(__file__).parents[1] / 'backend/cap_data_json_parser.py').read_text(encoding='utf-8'))
        parser = next(n for n in tree.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_DataJsonClipParser')
        execute = next(n for n in parser.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')
        begin = next(i for i, n in enumerate(execute.body) if isinstance(n, ast.Assign) and isinstance(n.targets[0], ast.Name) and n.targets[0].id == 'last_frame_id')
        code = compile(ast.Module(body=execute.body[begin:begin + 5], type_ignores=[]), '<parser frame assignment>', 'exec')
        node = SimpleNamespace(_ref_id=lambda ref: ref['id'], _first_loadable_image=lambda refs, materials: refs[0]['id'] if refs else None)
        for refs, expected in [([{'id':'tail'}, {'id':'head'}], ('head','tail')), ([{'id':'tail'}], (None,'tail')), ([{'id':'head'}], ('head',None))]:
            scope = dict(self=node, clip={'clip_role':'first_last','last_frame_media_id':'tail'}, refs=refs, materials={})
            exec(code, scope)
            self.assertEqual((scope['first_frame'],scope['last_frame']), expected)


if __name__ == '__main__':
    unittest.main()
