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
