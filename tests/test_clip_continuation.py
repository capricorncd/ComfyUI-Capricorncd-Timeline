import ast
import json
import os
import tempfile
from pathlib import Path
import unittest
from test_h3_timing import h3, clips


class ContinuationTests(unittest.TestCase):
    def rows(self):
        rows=clips()
        for row in rows:
            row.update(save_latent=False,h3_motion_context_length=0,reference_previous=False)
        rows[1]['reference_previous']=True
        return rows

    def test_next_flag_saves_previous_and_prefers_22(self):
        rows=self.rows(); h3.plan_h3_clips(rows,24)
        self.assertTrue(rows[0]['save_latent'])
        self.assertTrue(rows[0]['h3_timing']['save_latent'])
        self.assertEqual(rows[1]['h3_timing']['context_frames'],22)
        self.assertFalse(rows[1]['save_latent'])
        self.assertNotIn('h3_timing',rows[2])

    def test_explicit_false_breaks_legacy_automatic_context(self):
        rows=self.rows(); rows[1]['reference_previous']=False; rows[0]['save_latent']=True
        h3.plan_h3_clips(rows,24)
        self.assertEqual(rows[1]['h3_motion_context_length'],0)
        self.assertNotIn('h3_timing',rows[1])

    def test_no_cross_track_gap_or_other_agent(self):
        for mutation in ({'z_index':3},{'preview_start_ms':5010},{'agent':'other'}):
            rows=self.rows(); rows[1].update(mutation); h3.plan_h3_clips(rows,24)
            self.assertFalse(rows[0]['save_latent'])

    def test_replanning_missing_predecessor_clears_context(self):
        rows=self.rows(); h3.plan_h3_clips(rows,24)
        h3.plan_h3_clips(rows[1:],24)
        self.assertEqual(rows[1]['h3_timing']['context_frames'],0)

    def test_video_fallback_priority_and_missing_files(self):
        path=Path(__file__).resolve().parents[1]/'backend/cap_minimax_h3.py'
        tree=ast.parse(path.read_text('utf-8'))
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='_prev_clip_output_video_path')
        with tempfile.TemporaryDirectory() as temp:
            directory=Path(temp)
            for name in ('new.mp4','old.mp4','ref.mp4'): (directory/name).write_bytes(b'test')
            scope=dict(json=json,os=os,_resolve_output_file=lambda name: str(directory/name) if (directory/name).is_file() else '')
            exec(compile(ast.Module(body=[fn],type_ignores=[]),str(path),'exec'),scope)
            resolve=scope[fn.name]
            rows=[dict(source_clip_id='a',output_video='new.mp4'),dict(previous_output_video='old.mp4',previous_reference_video=str(directory/'ref.mp4'),h3_timing=dict(previous_source_clip_id='a'))]
            self.assertEqual(Path(resolve(json.dumps(dict(clips=rows)),1)).name,'new.mp4')
            (directory/'new.mp4').unlink()
            self.assertEqual(Path(resolve(json.dumps(dict(clips=rows)),1)).name,'old.mp4')
            (directory/'old.mp4').unlink()
            self.assertEqual(Path(resolve(json.dumps(dict(clips=rows)),1)).name,'ref.mp4')
            (directory/'ref.mp4').unlink()
            self.assertEqual(resolve(json.dumps(dict(clips=rows)),1),'')

if __name__=='__main__': unittest.main()
