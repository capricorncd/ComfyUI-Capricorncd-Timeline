import ast
from pathlib import Path
from types import SimpleNamespace
import unittest
import torch

ROOT = Path(__file__).resolve().parents[1]
TREE = ast.parse((ROOT / 'backend/cap_minimax_h3.py').read_text(encoding='utf-8-sig'))
functions = [n for n in TREE.body if isinstance(n, ast.FunctionDef) and n.name in ('_frames_at_fps', '_pad_video_frames')]
cls = next(n for n in TREE.body if isinstance(n, ast.ClassDef) and n.name == 'CAP_MiniMaxH3ReferenceToVideo')
load = next(n for n in cls.body if isinstance(n, ast.FunctionDef) and n.name == '_load_video_ref')

class H3ReferenceTrimTests(unittest.TestCase):
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
