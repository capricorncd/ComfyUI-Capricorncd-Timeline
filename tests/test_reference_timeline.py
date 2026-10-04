import ast
import copy
import json
from pathlib import Path
import shutil
import tempfile
import unittest
import uuid

from test_compose_range_audio import scope, run, probe

source = Path(__file__).resolve().parents[1] / 'backend/reference_timeline.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
namespace = dict(copy=copy, uuid=uuid)
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef)], type_ignores=[]), str(source), 'exec'), namespace)


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg required')
class ReferenceTimelineTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.video = self.root / 'source.mp4'
        self.audio = self.root / 'source.wav'
        run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=32x32:r=24:d=1', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(self.video)])
        run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=1', str(self.audio)])
        self.outputs = []

        def compose(project, **options):
            output = self.root / (options['filename'] + ('.mp4' if options['export_video'] else '.wav'))
            scope['compose_timeline_project'](project, str(output), export_video=options['export_video'],
                audio_output_path=str(output) if options['export_audio'] else None,
                export_range=options['export_range'], output_fps=options['output_fps'])
            self.outputs.append(project)
            return dict(output_path=str(output))

        namespace['compose_to_output'] = compose
        self.project = dict(name='Reference', settings=dict(fps=24, width=32, height=32), media=[
            dict(id='v', kind='video', file=str(self.video)), dict(id='a', kind='audio', file=str(self.audio))])
        self.clip = dict(id='clip', duration_ms=1000, muted=True, reference_timeline=dict(per_track=False,
            videos=[dict(id='v1', media_id='v', edit_start_sec=0, trim_in_sec=0, trim_out_sec=1)],
            audios=[dict(id='a1', media_id='a', track_id='audio', edit_start_sec=0, duration=1, source_offset=0)]))

    def compose(self):
        return namespace['compose_reference_timeline'](self.project, self.clip, lambda file: file)

    def test_default_composes_video_and_audio_without_parent_mute(self):
        before = copy.deepcopy(self.clip)
        rows = self.compose()
        self.assertEqual(len(rows), 1)
        streams = probe(rows[0]['file'])['streams']
        self.assertEqual({stream['codec_type'] for stream in streams}, {'video', 'audio'})
        self.assertEqual(rows[0]['video_trim']['duration'], 1)
        self.assertEqual(rows[0]['prompt_aliases'], ['source.mp4'])
        self.assertEqual(self.clip, before)

    def test_audio_only_outputs_one_mixed_audio(self):
        self.clip['reference_timeline']['videos'] = []
        self.clip['reference_timeline']['audios'].append(dict(id='a2', media_id='a', track_id='second', duration=0.5, edit_start_sec=0.5))
        rows = self.compose()
        self.assertEqual([row['kind'] for row in rows], ['audio'])
        self.assertAlmostEqual(float(probe(rows[0]['file'])['format']['duration']), 1, places=2)

    def test_per_track_composes_tracks_separately(self):
        self.clip['reference_timeline']['per_track'] = True
        self.clip['reference_timeline']['videos'][0]['trim_out_sec'] = 0.5
        self.clip['reference_timeline']['videos'][0]['track_id'] = 'video'
        self.clip['reference_timeline']['videos'].append(dict(id='v2', media_id='v', track_id='video', edit_start_sec=0.5, trim_out_sec=0.5))
        rows = self.compose()
        self.assertEqual([row['kind'] for row in rows], ['video', 'audio'])
        self.assertEqual(len(self.outputs[0]['tracks'][0]['clips'][0]['generated_videos']), 2)

    def test_child_disabled_and_muted_states(self):
        self.clip['reference_timeline']['videos'][0]['enabled'] = False
        self.clip['reference_timeline']['audios'][0]['muted'] = True
        self.assertEqual(self.compose(), [])

    def test_missing_catalog_reference_fails_clearly(self):
        self.clip['reference_timeline']['videos'][0]['media_id'] = 'missing'
        with self.assertRaisesRegex(ValueError, 'catalog'):
            self.compose()


if __name__ == '__main__':
    unittest.main()
