import ast
import json
from pathlib import Path
import tempfile
import unittest
from test_compose_frame_boundaries import scope as compose_scope
from test_director_generation_scope import select

scope=dict(compose_scope)
backend=Path(__file__).resolve().parents[1]/'backend'
tree=ast.parse((backend/'cap_compose_timeline_export.py').read_text(encoding='utf-8'))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name in ('_clip_audio_file','_collect_plan')],type_ignores=[]),str(backend),'exec'),scope)
scope.update(resolve_media_path=lambda file,**kwargs:file,normalize_volume_points=lambda rows:rows or [])

class TrackStateTests(unittest.TestCase):
    def test_picture_and_sound(self):
        with tempfile.NamedTemporaryFile(suffix='.mp4') as media:
            video=dict(type='director',enabled=False,visible=True,muted=False,clips=[dict(id='v',duration_ms=1000,generated_videos=[dict(file=media.name)])])
            audio=dict(type='audio',enabled=False,visible=False,muted=False,clips=[dict(id='a',duration_ms=1000,source=dict(file=media.name))])
            sub=dict(type='subtitle',enabled=False,visible=True,clips=[dict(text='English',duration_ms=1000)])
            project=dict(tracks=[video,audio,sub])
            plan=scope['_collect_plan'](project)
            self.assertEqual([len(plan[k]) for k in ('video_segs','audio_segs','subtitle_segs')],[1,1,1])
            video['muted']=True
            plan=scope['_collect_plan'](project)
            self.assertTrue(plan['video_segs'][0]['muted'])
            self.assertEqual(len(plan['video_segs']),1)
            video['visible']=False;audio['muted']=True;sub['visible']=False
            plan=scope['_collect_plan'](project)
            self.assertEqual([len(plan[k]) for k in ('video_segs','audio_segs','subtitle_segs')],[0,0,0])

    def test_media_and_voiceover(self):
        with tempfile.NamedTemporaryFile(suffix='.mp4') as media:
            visual=dict(type='media',enabled=False,visible=True,muted=False,clips=[dict(duration_ms=1000,media_ids=['m'])])
            voice=dict(type='voiceover',enabled=False,visible=False,muted=False,clips=[dict(duration_ms=1000,generated_audios=[dict(file=media.name)])])
            project=dict(media=[dict(id='m',kind='video',file=media.name)],tracks=[visual,voice])
            plan=scope['_collect_plan'](project)
            self.assertEqual(len(plan['video_segs']),1)
            self.assertEqual(len(plan['audio_segs']),1)
            visual['visible']=False;voice['muted']=True
            plan=scope['_collect_plan'](project)
            self.assertEqual(len(plan['video_segs']),0)
            self.assertEqual(len(plan['audio_segs']),0)

    def test_project_normalization_removes_only_track_enabled(self):
        tree=ast.parse((backend/'cap_timeline_project_io.py').read_text(encoding='utf-8'))
        fn=next(n for n in tree.body if isinstance(n,ast.FunctionDef) and n.name=='migrate_project')
        env=dict(json=json,SCHEMA_VERSION=4,parse_schema_version=lambda p:4,
                 ensure_project_identity=lambda p,path:p)
        for name in ['_migrate_setting_prompts','_normalize_timeline_prompt_selection','_normalize_media_catalog','_ensure_clip_media_ids']:
            env[name]=lambda p:None
        exec(compile(ast.Module(body=[fn],type_ignores=[]),'migrate','exec'),env)
        source=dict(tracks=[dict(type=kind,enabled=False,visible=True,muted=False,clips=[dict(enabled=False)])
                            for kind in ('subtitle','director','media','audio','voiceover','filter')])
        normalized=env['migrate_project'](source)
        for track in normalized['tracks']:
            self.assertNotIn('enabled',track)
            self.assertTrue(track['visible'])
            self.assertFalse(track['clips'][0]['enabled'])
        self.assertIn('enabled',source['tracks'][0])

    def test_generation_uses_visible_and_muted_only(self):
        tracks=[dict(type='director',enabled=False,visible=True,clips=[dict(id='v',type='clip')]),
                dict(type='audio',enabled=False,visible=False,muted=False,clips=[dict(id='a',type='audio')])]
        self.assertEqual(select(tracks),(['v'],['a']))
        tracks[0]['visible']=False;tracks[1]['muted']=True
        self.assertEqual(select(tracks),([],[]))

if __name__=='__main__':unittest.main()
