import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('h3_context_media', Path(__file__).resolve().parents[1] / 'backend/h3_context_media.py')
media = importlib.util.module_from_spec(spec)
spec.loader.exec_module(media)


class ContextMediaTests(unittest.TestCase):
    def test_keyframe_end_respects_video_trim_speed_and_audio_offset(self):
        source = dict(start_ms=1000, end_ms=11000, images=[dict(id='video')], audios=[
            dict(id='audio', source_start_ms=2000, source_end_ms=22000, playback_rate=2, clip_offset_ms=1000)])
        materials = {'video':dict(kind='video', file='trimmed.mp4', video_trim=dict(file='original.mp4', start=7, duration=20, rate=2)),
                     'audio':dict(kind='audio', file='sound.wav')}
        result = media.reference_context_media(source, materials, 4000)
        self.assertEqual(result['videos'][0], dict(file='original.mp4', location='input', start=7, duration=8, rate=2))
        self.assertEqual(result['audios'][0]['source_end_ms'], 8000)
        self.assertEqual(result['audios'][0]['file'], 'sound.wav')
        self.assertEqual(source['audios'][0]['source_end_ms'], 22000)

    def test_selected_clip_uses_exact_previous_owner_from_catalog(self):
        previous = dict(id='a', start_ms=0, end_ms=5000, images=[dict(id='v')])
        current = dict(id='b', h3_timing=dict(previous_source_clip_id='a'))
        data = dict(clips=[current], composition_clips=[previous], materials=[dict(id='v', kind='video', file='ref.mp4')])
        result = media.previous_context_media(data, 0)
        self.assertEqual(result['videos'][0]['duration'], 5)
        self.assertEqual(result['videos'][0]['file'], 'ref.mp4')
        current['h3_timing']['previous_source_clip_id'] = 'missing'
        self.assertEqual(media.previous_context_media(data, 0)['videos'], [])

    def test_image_only_source_has_no_av_context(self):
        result = media.reference_context_media(dict(start_ms=0, end_ms=5000, images=[dict(id='i')]),
            {'i':dict(kind='image', file='hero.png')})
        self.assertEqual(result['videos'], [])
        self.assertEqual(result['audios'], [])


if __name__ == '__main__': unittest.main()
