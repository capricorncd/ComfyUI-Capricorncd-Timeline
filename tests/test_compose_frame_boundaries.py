import ast
import logging
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from typing import Any


source = Path(__file__).resolve().parents[1] / 'backend' / 'cap_compose_timeline_export.py'
tree = ast.parse(source.read_text(encoding='utf-8-sig'))
names = {'_as_dict', '_as_list', '_ms', '_clip_volume', '_media_by_id', '_even_dim',
         '_compose_size', '_collect_plan', '_escape_enable', 'compose_timeline_project'}


def run(cmd, **kwargs):
    result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, **kwargs)
    if result.returncode:
        raise AssertionError(result.stderr.decode('utf-8', errors='replace'))
    return result.stdout


scope = dict(Any=Any, os=os, shutil=shutil, tempfile=tempfile, log=logging.getLogger(__name__),
             _ffmpeg_path=str, _run_ffmpeg=run, _resolve_output_video=str,
             _build_watermark_filters=lambda *args: ([], [], 'vout', None))
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                            and n.name in names], type_ignores=[]), str(source), 'exec'), scope)


@unittest.skipUnless(shutil.which('ffmpeg'), 'ffmpeg required')
class ComposeFrameBoundariesTests(unittest.TestCase):
    def test_context_replacement_has_no_black_missing_or_repeated_frames(self):
        for fps in (24, 30, 60, 24000 / 1001):
            with self.subTest(fps=fps):
                self.compose_case(fps)

    def compose_case(self, fps):
        with tempfile.TemporaryDirectory(prefix='cap_frame_test_') as directory:
            files = []
            for index, (origin, count) in enumerate(((0, 124), (102, 158), (238, 141))):
                path = str(Path(directory) / f'clip{index}.mkv')
                # Encode a deterministic frame number as luminance, including context.
                pixels = b''.join(bytes([40 + ((origin + frame) * 17) % 170]) * (32 * 32)
                                  + bytes([128]) * (32 * 32 // 2) for frame in range(count))
                run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'yuv420p',
                     '-s', '32x32', '-r', str(fps), '-i', 'pipe:0', '-c:v', 'ffv1', path], input=pixels)
                files.append(path)

            def row(file, start, end, offset=0):
                return dict(file=file, trim_in_sec=start/fps, trim_out_sec=end/fps, edit_start_sec=offset/fps)

            boundaries = [round(frame * 1000 / fps) for frame in (0, 124, 260, 371)]
            project = dict(settings=dict(width=32, height=32, fps=fps), tracks=[dict(
                type='director', muted=True, clips=[
                    dict(start_ms=0, duration_ms=boundaries[1], generated_videos=[
                        row(files[1], 0, 22, 102), row(files[0], 0, 102)]),
                    dict(start_ms=boundaries[1], duration_ms=boundaries[2]-boundaries[1], generated_videos=[
                        row(files[2], 0, 22, 114), row(files[1], 22, 136)]),
                    dict(start_ms=boundaries[2], duration_ms=boundaries[3]-boundaries[2], generated_videos=[row(files[2], 22, 133)]),
                ])])
            output = str(Path(directory) / 'composed.mp4')
            scope['compose_timeline_project'](project, output)
            pixels = run(['ffmpeg', '-v', 'error', '-i', output, '-an', '-pix_fmt', 'yuv420p',
                          '-f', 'rawvideo', 'pipe:1'])
            stride = 32 * 32 * 3 // 2
            self.assertEqual(len(pixels) // stride, 371)
            for frame in range(371):
                self.assertAlmostEqual(pixels[frame * stride], 40 + (frame * 17) % 170, delta=2,
                                       msg=f'wrong source frame / black frame at {frame}')


if __name__ == '__main__':
    unittest.main()
