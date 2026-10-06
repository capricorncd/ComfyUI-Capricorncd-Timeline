import json
import os
from pathlib import Path
import tempfile
import unittest

from test_compose_frame_boundaries import portrait, scope, run


class PortraitFilterTests(unittest.TestCase):
    def test_export_time_range_strength_and_color(self):
        with tempfile.TemporaryDirectory(prefix='cap_filter_test_') as directory:
            source = str(Path(directory) / 'skin.mkv')
            pixels = bytes([190, 135, 105]) * (32 * 32 * 48)
            run(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                 '-s', '32x32', '-r', '24', '-i', 'pipe:0', '-c:v', 'ffv1', source], input=pixels)
            project = dict(settings=dict(width=32, height=32, fps=24), tracks=[
                dict(type='filter', clips=[dict(start_ms=500, duration_ms=1000, filter_preset='fair', filter_strength=0.7)]),
                dict(type='director', clips=[dict(start_ms=0, duration_ms=2000, muted=True, generated_videos=[dict(file=source)])])])
            output = str(Path(directory) / 'out.mp4')
            scope['compose_timeline_project'](project, output)
            frames = run(['ffmpeg', '-v', 'error', '-i', output, '-f', 'rawvideo', '-pix_fmt', 'rgb24', 'pipe:1'])
            color = lambda frame: list(frames[frame*32*32*3:frame*32*32*3+3])
            before, filtered, after = color(11), color(12), color(36)
            self.assertGreater(filtered[1], before[1]+8)
            self.assertGreater(filtered[2], before[2]+12)
            for a,b in zip(before,after): self.assertLessEqual(abs(a-b),3)
            self.assertEqual(color(35), filtered)
            project['tracks'][0]['visible']=False
            self.assertEqual(scope['_collect_plan'](project)['filter_segs'], [])

    def test_lut_strength_zero_identity_and_cleanup(self):
        path=portrait.write_lut('fair', 0)
        try:
            rows=Path(path).read_text().splitlines()[3:]
            self.assertEqual(rows[0], '0.0000000 0.0000000 0.0000000')
            self.assertEqual(rows[-1], '1.0000000 1.0000000 1.0000000')
        finally:
            os.unlink(path)
        with self.assertRaises(ValueError):portrait.write_lut('../invalid',1)


if __name__ == '__main__':unittest.main()
