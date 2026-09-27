import copy
import importlib.util
from pathlib import Path
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
        self.assertTrue(module.expand_keyframe_runs(data))
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
        self.assertEqual(data['clips'][0]['prompt'], 'base\n\nturn')
        self.assertEqual(original['images'], [dict(id='ref')])

    def test_no_end_only_interval_and_no_empty_run(self):
        data = self.data()
        data['h3_generation'] = dict(keyframe_runs=[dict(clip_id='a', clip_start_ms=1000, fps=24, intervals=[])])
        with self.assertRaises(ValueError): module.expand_keyframe_runs(data)


if __name__ == '__main__': unittest.main()
