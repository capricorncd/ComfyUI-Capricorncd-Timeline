import array
import ast
import tempfile
from pathlib import Path
import unittest

from test_compose_frame_boundaries import run, scope, speed, source


class MediaSpeedTests(unittest.TestCase):
    def test_rate_limits(self):
        for value in (None, '', 'bad', 0, -1, float('nan'), float('inf')):
            self.assertEqual(speed.playback_rate(value), 1)
        self.assertEqual(speed.playback_rate(0.1), 0.25)
        self.assertEqual(speed.playback_rate(10), 4)

    def test_media_and_audio_export(self):
        # Load the envelope filter without importing torch/ComfyUI.
        tree = ast.parse((source.parent / 'audio_envelope.py').read_text())
        import math
        scope['math'] = math
        exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
             and n.name in ('normalize_volume_points', 'volume_points_filter')], type_ignores=[]), str(source), 'exec'), scope)
        scope['resolve_media_path'] = lambda file, **kw: file
        scope['_probe_has_audio'] = lambda path: True
        scope['_clip_audio_file'] = lambda clip, media: clip['audio_file']
        with tempfile.TemporaryDirectory(prefix='cap_speed_') as directory:
            video = str(Path(directory) / 'source.mp4')
            run(['ffmpeg','-v','error','-y','-f','lavfi','-i','color=white:s=32x32:r=24:d=4',
                 '-f','lavfi','-i','sine=frequency=500:duration=4:sample_rate=48000',
                 '-c:v','libx264','-c:a','aac','-shortest',video])
            for rate in (0.25, 0.5, 1, 2, 4):
                for audio_track in (False, True):
                    with self.subTest(rate=rate, audio_track=audio_track):
                        duration = 3 / rate
                        clip = dict(start_ms=0,duration_ms=round(duration*1000),media_ids=['v'],
                                    source=dict(in_ms=1000), playback_rate=rate)
                        tracks = [dict(type='media',muted=audio_track,clips=[clip])]
                        if audio_track:
                            tracks.append(dict(type='audio',clips=[dict(clip,audio_file=video)]))
                        project = dict(settings=dict(width=32,height=32,fps=24),
                                       media=[dict(id='v',kind='video',file=video)],tracks=tracks)
                        output = str(Path(directory) / 'out.mp4')
                        scope['compose_timeline_project'](project,output)
                        frames = run(['ffmpeg','-v','error','-i',output,'-an','-pix_fmt','gray','-f','rawvideo','pipe:1'])
                        self.assertEqual(len(frames)//1024,round(duration*24))
                        self.assertGreater(min(frames),200, 'no black tail after slow motion')
                        audio = array.array('f',run(['ffmpeg','-v','error','-i',output,'-vn','-ac','1','-ar','48000','-f','f32le','pipe:1']))
                        self.assertAlmostEqual(len(audio)/48000,duration,delta=0.06)
                        chunk = audio[4800:24000]
                        crossings = sum(a <= 0 < b for a,b in zip(chunk,chunk[1:]))
                        self.assertAlmostEqual(crossings/(len(chunk)/48000),500*rate,delta=5)


if __name__ == '__main__':
    unittest.main()
