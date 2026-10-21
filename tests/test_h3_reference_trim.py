import ast
import logging
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock
import unittest
import torch

ROOT = Path(__file__).resolve().parents[1]
TREE = ast.parse((ROOT / 'backend/cap_minimax_h3.py').read_text(encoding='utf-8-sig'))
functions = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in ('_frames_at_fps', '_pad_video_frames')]
cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_MiniMaxH3ReferenceToVideo')
load = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_load_video_ref')

class H3ReferenceTrimTests(unittest.TestCase):
    def test_context_tail_ends_at_selected_reference_trim_and_respects_speed(self):
        calls = []
        def video(path, start_time, duration):
            calls.append((path, start_time, duration))
            return SimpleNamespace(get_components=lambda: SimpleNamespace(
                images=torch.arange(round(duration * 24)).float().reshape(-1, 1, 1, 1), frame_rate=24, audio=None))
        names = {'_frames_at_fps', '_load_motion_context_from_video'}
        definitions = [node for node in TREE.body if isinstance(node, ast.FunctionDef) and node.name in names]
        scope = dict(torch=torch, H3_FPS=24, REF_VIDEO_FPS=24, REF_VIDEO_MAX_SEC=15, VideoFromFile=video,
                     os=SimpleNamespace(path=SimpleNamespace(isfile=lambda _:True)), _LOG=logging.getLogger(__name__))
        exec(compile(ast.Module(body=definitions, type_ignores=[]), '<context tail>', 'exec'), scope)
        frames, _ = scope['_load_motion_context_from_video']('original.mp4', 22,
            dict(start=7, duration=10, rate=2))
        path, start, duration = calls[0]
        self.assertEqual(path, 'original.mp4')
        self.assertAlmostEqual(start + duration, 17)
        self.assertAlmostEqual(duration, (22 / 24 + .35) * 2)
        self.assertEqual(len(frames), 22)

    def test_context_fallback_precedence_and_audio_only_reference(self):
        execute = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'execute')
        for source in ('latent', 'generated', 'reference', 'audio', 'none'):
            with self.subTest(source=source):
                row = dict(id='current', source_clip_id='current', start_ms=5000, end_ms=10000,
                    preview_start_ms=5000, preview_end_ms=10000, reference_previous=True, h3_motion_context_length=22,
                    h3_timing=dict(fps=24, context_frames=22, context_carry_frames=0, raw_frames=158,
                                   head_frames=0, tail_frames=16, play_frames=120, previous_source_clip_id='previous'))
                parser = SimpleNamespace(_compose_prompt=lambda *args, **kwargs:'current prompt',
                    _uses_master_audio=lambda *args:False, _clip_audio_from_audios=lambda *args, **kwargs:None)
                av = dict(videos=[dict(file='reference.mp4', start=7, duration=10, rate=2)] if source == 'reference' else [],
                          audios=[dict(file='voice.wav', source_start_ms=0, source_end_ms=5000)] if source == 'audio' else [], duration_ms=5000)
                native = Mock(return_value=SimpleNamespace(args=([], {'samples':'AV'})))
                motion = Mock(return_value=([], 22))
                from test_h3_timing import h3
                scope = dict(torch=torch, H3_FPS=24, align_frame_count=lambda n:n+(5-n)%17,
                    _snap_h3_grid=lambda n:22, _context_latent_usable=lambda *args:source=='latent',
                    _prev_clip_output_video_path=Mock(return_value='generated.mp4' if source=='generated' else ''),
                    _previous_reference_media=Mock(return_value=av),
                    _load_motion_context_from_video=Mock(return_value=(torch.ones(22,1,1,3), None)),
                    _motion_context_cls=lambda:lambda:SimpleNamespace(apply=motion),
                    _h3_audio_clip=lambda clip, duration:clip, plan_h3_clips=h3.plan_h3_clips,
                    MAX_REF_IMAGES=9, MAX_REF_VIDEOS=3, MAX_REF_AUDIOS=3,
                    MiniMaxH3ReferenceToVideo=SimpleNamespace(execute=native),
                    playback_rate=lambda rate:float(rate or 1), compile_h3_mentions=lambda prompt, refs:prompt,
                    _LOG=logging.getLogger(__name__))
                exec(compile(ast.Module(body=[execute], type_ignores=[]), '<reference execute>', 'exec'), scope)
                audio_load = Mock(return_value=dict(waveform=torch.ones(1,1,22), sample_rate=24))
                node = SimpleNamespace(_parse_clip=lambda *args:({'fps':24},row,{},parser), _visual_refs=lambda *args:[],
                    _stack_frames=lambda *args:None, _load_audio_ref=audio_load)
                out = scope['execute'](node, 'clip', 'vae', 'audio_vae', 768, 512, 'match', '{}', 0,
                                       context_latent={} if source=='latent' else None)
                self.assertEqual(out[8], 22 if source in ('latent','generated','reference') else 0)
                self.assertEqual(out[2], 158 if out[8] else 124)
                self.assertEqual(audio_load.call_count, int(source=='audio'))
                if source=='audio':
                    self.assertTrue(native.call_args.kwargs['ref_audios'])
                    self.assertGreater(audio_load.call_args.args[0]['source_start_ms'], 4000)
                if source in ('latent','generated'):
                    scope['_previous_reference_media'].assert_not_called()
                if source=='none':
                    self.assertIsNone(native.call_args.kwargs['ref_audios'])

    def test_reference_calls_match_installed_comfyui_signature(self):
        upstream = ast.parse((ROOT.parents[1] / 'comfy_extras/nodes_minimax_h3.py').read_text(encoding='utf-8'))
        node = next(n for n in upstream.body if isinstance(n, ast.ClassDef) and n.name == 'MiniMaxH3ReferenceToVideo')
        execute = next(n for n in node.body if isinstance(n, ast.FunctionDef) and n.name == 'execute')
        execute.decorator_list = []
        execute.returns = None
        execute.body = ast.parse('return locals()').body
        scope = {}
        exec(compile(ast.fix_missing_locations(ast.Module(body=[execute], type_ignores=[])), '<upstream signature>', 'exec'), scope)
        values = dict(clip=object(), vae=object(), audio_vae=object(), prompt='A walking cat',
                      width=768, height=512, length=124, ref_image_size='match',
                      ref_images={'ref_image_1': object()}, ref_videos={'ref_video_1': object()},
                      ref_video_audios={'ref_video_audio_1': object()}, ref_audios={'ref_audio_1': object()})
        values['MiniMaxH3ReferenceToVideo'] = SimpleNamespace(execute=lambda *a, **kw: scope['execute'](None, *a, **kw))
        calls = [n for n in ast.walk(cls) if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute)
                 and isinstance(n.func.value, ast.Name) and n.func.value.id == 'MiniMaxH3ReferenceToVideo'
                 and n.func.attr == 'execute']
        self.assertEqual(len(calls), 2)
        for call in calls:
            with self.subTest(line=call.lineno):
                bound = eval(compile(ast.Expression(body=call), '<reference call>', 'eval'), values)
                for name in ('clip', 'vae', 'audio_vae', 'prompt', 'width', 'height', 'length',
                             'ref_image_size', 'ref_images', 'ref_videos', 'ref_video_audios', 'ref_audios'):
                    self.assertEqual(bound[name], values[name])

    def load(self, trim, extra=0, available=1000):
        calls = []
        def video(path, start_time, duration):
            calls.append((path, start_time, duration))
            n = min(available, round(duration * 24))
            images = torch.arange(n, dtype=torch.float32).reshape(n, 1, 1, 1)
            audio = {'sample_rate': 240, 'waveform': torch.ones(1, 1, n * 10)}
            return SimpleNamespace(get_components=lambda: SimpleNamespace(images=images, frame_rate=24, audio=audio))
        scope = dict(torch=torch, REF_VIDEO_FPS=24, REF_VIDEO_MAX_SEC=15,
                     align_frame_count=lambda n: n + (5 - n) % 17, VideoFromFile=video)
        exec(compile(ast.Module(body=functions + [load], type_ignores=[]), '<reference>', 'exec'), scope)
        frames, audio = scope['_load_video_ref'](None, 'cropped.mp4', trim, extra, 124)
        return calls, frames, audio

    def test_reads_real_tail_beyond_user_end(self):
        trim = dict(file='original.mp4', start=3, duration=2, rate=1)
        calls, frames, audio = self.load(trim)
        self.assertEqual(calls[0][0:2], ('original.mp4', 3))
        self.assertAlmostEqual(calls[0][2], 56 / 24)
        self.assertEqual(len(frames), 56)
        self.assertEqual(frames[-1].item(), 55)
        self.assertEqual(audio['waveform'].shape[-1], 560)
        self.assertEqual(trim['duration'], 2)

    def test_generation_padding_and_source_eof(self):
        _, frames, audio = self.load(dict(file='original.mp4', start=3, duration=2, rate=1), extra=17, available=50)
        self.assertEqual(len(frames), 73)
        self.assertTrue(torch.all(frames[50:] == 49))
        self.assertEqual(audio['waveform'].shape[-1], 730)
        self.assertTrue(torch.all(audio['waveform'][..., 500:] == 0))

    def test_old_reference_retains_tail_instead_of_rounding_down(self):
        _, frames, audio = self.load(None, available=48)
        self.assertEqual(len(frames), 56)
        self.assertEqual(frames[-1].item(), 47)
        self.assertEqual(audio['waveform'].shape[-1], 560)


class H3AudioTrimTests(unittest.TestCase):
    def test_padding_reads_real_tail_and_respects_speed(self):
        scope = dict(playback_rate=lambda v: float(v or 1))
        helper = next(n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name == '_h3_audio_clip')
        exec(compile(ast.Module(body=[helper], type_ignores=[]), '<audio plan>', 'exec'), scope)
        original = dict(start_ms=0, end_ms=2000, audios=[
            dict(source_start_ms=1000, source_end_ms=3000, clip_offset_ms=0),
            dict(source_start_ms=1000, source_end_ms=2000, clip_offset_ms=0),
            dict(source_start_ms=1000, source_end_ms=5000, playback_rate=2, clip_offset_ms=0),
        ])
        planned = scope['_h3_audio_clip'](original, 2333)
        self.assertEqual(planned['end_ms'], 2333)
        self.assertEqual([r['source_end_ms'] for r in planned['audios']], [3333, 2000, 5666])
        self.assertEqual(original['audios'][0]['source_end_ms'], 3000)
        # Context prefix is handled separately: 78 generated - 22 context = 56 content frames.
        self.assertEqual(scope['_h3_audio_clip'](original, round((78 - 22) * 1000 / 24))['end_ms'], 2333)

    def test_reference_tail_and_eof_silence(self):
        fn = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_load_audio_ref')
        scope = dict(torch=torch, CAP_DataJsonClipParser=object, playback_rate=lambda v: float(v or 1),
                     os=SimpleNamespace(path=SimpleNamespace(normpath=lambda p:p, isfile=lambda p:True)))
        exec(compile(ast.Module(body=[fn], type_ignores=[]), '<audio reference>', 'exec'), scope)
        parser = SimpleNamespace(_audio_row_path=lambda *a:'original.wav',
            _load_waveform=lambda p:(torch.arange(3200).reshape(1, 1, -1).float(), 1000),
            _trim=lambda w, sr, start, end:dict(waveform=w[..., start:end], sample_rate=sr))
        audio = scope['_load_audio_ref'](None, dict(source_start_ms=1000, source_end_ms=3333), {}, parser)
        self.assertEqual(audio['waveform'].shape[-1], 2333)
        self.assertEqual(audio['waveform'][0, 0, 2100].item(), 3100)
        self.assertTrue(torch.all(audio['waveform'][..., 2200:] == 0))

if __name__ == '__main__': unittest.main()
