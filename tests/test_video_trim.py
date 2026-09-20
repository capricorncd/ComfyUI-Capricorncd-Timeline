import ast
import json
import math
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)

scope = dict(math=math, os=os, _ffmpeg_path=lambda p: str(p), _run_ffmpeg=run)
speed = ast.parse((ROOT / 'backend/media_speed.py').read_text(encoding='utf-8-sig'))
exec(compile(speed, '<speed>', 'exec'), scope)
tree = ast.parse((ROOT / 'backend/cap_compose_clip_videos.py').read_text(encoding='utf-8-sig'))
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'trim_video_file')
exec(compile(ast.Module(body=[fn], type_ignores=[]), '<trim>', 'exec'), scope)
trim = scope['trim_video_file']

@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'ffmpeg required')
class VideoTrimTests(unittest.TestCase):
    def test_range_audio_and_speed(self):
        with tempfile.TemporaryDirectory() as tmp:
            src = Path(tmp) / 'source.mp4'
            run(['ffmpeg', '-v', 'error', '-f', 'lavfi', '-i', 'color=red:s=64x64:r=24:d=2',
                 '-f', 'lavfi', '-i', 'color=blue:s=64x64:r=24:d=2', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=4',
                 '-filter_complex', '[0:v][1:v]concat=n=2:v=1:a=0[v]', '-map', '[v]', '-map', '2:a', '-c:v', 'libx264', '-c:a', 'aac', str(src)])
            original = src.read_bytes()
            for rate in (1, 2, 0.5):
                out = Path(tmp) / f'trim-{rate}.mp4'
                trim(str(src), str(out), start=2.25, duration=1, rate=rate)
                probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-show_streams', '-of', 'json', str(out)]))
                self.assertEqual({s['codec_type'] for s in probe['streams']}, {'video', 'audio'})
                for stream in probe['streams']:
                    self.assertAlmostEqual(float(stream['duration']), 1 / rate, delta=0.09)
                pixel = subprocess.check_output(['ffmpeg', '-v', 'error', '-i', str(out), '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
                self.assertGreater(pixel[2], pixel[0] + 150, 'Must select blue second segment, not red video head')
            self.assertEqual(src.read_bytes(), original)
            silent = Path(tmp) / 'silent.mp4'
            run(['ffmpeg', '-v', 'error', '-i', str(src), '-an', '-c:v', 'copy', str(silent)])
            trim(str(silent), str(Path(tmp) / 'silent-trim.mp4'), start=2, duration=0.5)

    def test_invalid_ranges(self):
        for start, duration, rate in [(-1, 1, 1), (0, 0, 1), (0, float('nan'), 1), (0, 1, float('inf')), (0, 1, 0)]:
            with self.assertRaises(ValueError):
                trim('unused', 'unused', start=start, duration=duration, rate=rate)

if __name__ == '__main__':
    unittest.main()
