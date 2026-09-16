import asyncio
import importlib.util
import json
import shutil
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).parents[1]
PACKAGE = 'local_audio_test'
pkg = types.ModuleType(PACKAGE)
pkg.__path__ = [str(ROOT / 'backend')]
sys.modules[PACKAGE] = pkg
fp = types.SimpleNamespace()
settings = types.ModuleType(PACKAGE + '.cap_bgm_settings')
settings._read = lambda: {}
compose = types.ModuleType(PACKAGE + '.cap_compose_clip_videos')
compose._probe_duration_sec = lambda path: 2.0
compose._probe_has_audio = lambda path: True
compose._run_ffmpeg = lambda command: Path(command[-1]).write_bytes(b'muxed video')
with patch.dict(sys.modules, {'folder_paths': fp, settings.__name__: settings, compose.__name__: compose}):
    spec = importlib.util.spec_from_file_location(PACKAGE + '.cap_local_audio', ROOT / 'backend/cap_local_audio.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'FFmpeg is required')
class AudioExtractionTests(unittest.TestCase):
    def test_clip_mix_preserves_silence_offsets_and_duration(self):
        import wave
        import array
        def run(command):
            subprocess.run(command, check=True, capture_output=True)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            fp.get_input_directory = lambda: str(root)
            source = root / 'tone.wav'
            run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', str(source)])
            output = root / 'mix.wav'
            with patch.object(module, '_run_ffmpeg', run):
                module.prepare_clip_mix(output, {'duration_sec': 4, 'mix': [
                    {'file': 'tone.wav', 'location': 'input', 'trim_in_sec': 0.5, 'edit_start_sec': 1, 'duration_sec': 1, 'volume': 0.5},
                    {'file': 'tone.wav', 'location': 'input', 'edit_start_sec': 2, 'duration_sec': 1, 'volume': 1},
                ]})
            with wave.open(str(output)) as audio:
                self.assertEqual(audio.getnframes(), 4 * 48000)
                samples = array.array('h', audio.readframes(audio.getnframes()))
            self.assertEqual(max(abs(n) for n in samples[:48000]), 0)
            self.assertGreater(max(abs(n) for n in samples[48000:96000]), 0)
            self.assertAlmostEqual(max(abs(n) for n in samples[96000:144000]) / max(abs(n) for n in samples[48000:96000]), 2, delta=0.05)
            self.assertEqual(max(abs(n) for n in samples[144000:]), 0)

    def test_full_and_clip_with_playback_speed(self):
        def run(command):
            subprocess.run(command, check=True, capture_output=True)

        def duration(path):
            return float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries',
                'format=duration', '-of', 'default=nw=1:nk=1', path]))

        with tempfile.TemporaryDirectory() as temporary:
            source = str(Path(temporary) / 'source.wav')
            run(['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', source])
            with patch.object(module, '_run_ffmpeg', run), patch.object(module, '_probe_duration_sec', duration):
                for scope, expected in [('full', 6), ('clip', 2)]:
                    output = Path(temporary) / (scope + '.wav')
                    actual = module.prepare_denoise_audio(source, output, {
                        'scope': scope, 'trim_in_sec': 1, 'duration_sec': 2, 'playback_rate': 2})
                    self.assertAlmostEqual(actual, expected, delta=0.1)
                with self.assertRaises(ValueError):
                    module.prepare_denoise_audio(source, output, {'scope': 'invalid'})
                with self.assertRaises(ValueError):
                    module.prepare_denoise_audio(source, output, {'scope': 'clip', 'duration_sec': -1})


class LocalAudioTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        fp.get_output_directory = lambda: str(self.root)
        fp.get_input_directory = lambda: str(self.root)
        self.calls = []
        self.status = 'succeeded'
        self.remote = web.Application()
        self.remote.router.add_route('*', '/{path:.*}', self.remote_request)
        self.remote_server = TestServer(self.remote)
        await self.remote_server.start_server()
        self.config = {'connection': 'standalone', 'url': str(self.remote_server.make_url('')).rstrip('/'), 'api_key': 'secret'}
        self.config_patch = patch.object(module, '_read', lambda: self.config)
        self.config_patch.start()
        routes = web.RouteTableDef()
        module.register_local_audio_routes(routes)
        app = web.Application()
        app.add_routes(routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        await self.remote_server.close()
        self.config_patch.stop()
        self.temp.cleanup()

    async def remote_request(self, request):
        self.assertEqual(request.headers.get('Authorization'), 'Bearer voice-secret' if request.path == '/v1/voices/vivian/audio' else 'Bearer secret')
        self.calls.append((request.method, request.path))
        if request.path == '/v1/voices':
            return web.json_response([{'id': 'vivian', 'name': 'Vivian', 'vc_available': True}])
        if request.path == '/v1/voices/vivian/audio':
            return web.Response(body=b'RIFF-preview', content_type='audio/wav')
        if request.path in ('/v1/music/generate', '/v1/sfx/generate', '/v1/tts/generate', '/v1/voice/convert'):
            self.params = await request.json()
            return web.json_response({'id': 'music_123', 'status': 'queued'}, status=202)
        if request.path in ('/v1/denoise/file', '/v1/separate/file', '/v1/uploads'):
            reader = await request.multipart()
            field = await reader.next()
            self.uploaded = await field.read()
            self.form = {}
            async for field in reader:
                self.form[field.name] = await field.text()
            if request.path == '/v1/uploads':
                return web.json_response({'upload_id': 'upload_' + str(len(self.calls))})
            return web.json_response({'id': 'separate_123' if request.path == '/v1/separate/file' else 'denoise_123', 'status': 'queued'}, status=202)
        if request.method == 'DELETE':
            return web.json_response({'status': 'cancelled'})
        if '/files/' in request.path:
            return web.Response(body=b'audio data', content_type='audio/wav')
        return web.json_response({'status': self.status, 'error': 'worker failed' if self.status == 'failed' else None,
                                  'result': {'files': [{'path': 'DO NOT READ', 'url': 'http://example.invalid/DO-NOT-FETCH', 'duration': 2}] * (2 if 'separate_123' in request.path else 1)}})

    async def test_voice_preview_uses_service_credentials(self):
        self.config['services'] = {'vc': {'url': self.config['url'] + '/v1/voice/convert', 'api_key': 'voice-secret'}}
        response = await self.client.get(module.PREFIX + '/voice_preview/vivian?kind=vc')
        self.assertEqual(response.status, 200)
        self.assertEqual(await response.read(), b'RIFF-preview')
        self.assertEqual(response.content_type, 'audio/wav')
        self.assertNotIn('Authorization', response.headers)
        self.assertEqual(self.calls[-1], ('GET', '/v1/voices/vivian/audio'))
        response = await self.client.get(module.PREFIX + '/voice_preview/vivian?kind=music')
        self.assertEqual(response.status, 400)

    async def call(self, action, payload=None):
        path = module.PREFIX + '/' + action
        response = await self.client.get(path) if payload is None else await self.client.post(path, json=payload)
        return response.status, await response.json()

    async def test_music_download_binding_and_idempotence(self):
        status, job = await self.call('start', {'kind': 'music', 'lyrics': '[Verse] hello', 'style': 'piano', 'max_duration': 2})
        self.assertEqual(status, 200)
        self.assertNotIn('secret', json.dumps(job))
        self.assertEqual(self.params['lyrics'], '[Verse] hello')
        status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200, result)
        self.assertEqual((self.root / result['files'][0]['file']).read_bytes(), b'audio data')
        calls = len(self.calls)
        self.assertEqual((await self.call('result/' + job['id'], {}))[1], result)
        self.assertEqual(len(self.calls), calls)

    async def test_service_endpoint_resolution(self):
        self.config.update(url='https://common.example/proxy', api_key='shared', services={
            'tts': {'url': 'https://speech.example/prefix/v1/tts/generate', 'api_key': 'private'},
            'music': {'url': 'v1/music/generate', 'api_key': ''},
        })
        base, headers, endpoint = module.connection('tts')
        self.assertEqual(base, 'https://speech.example/prefix')
        self.assertEqual(headers['Authorization'], 'Bearer private')
        self.assertEqual(endpoint, base + '/v1/tts/generate')
        base, headers, endpoint = module.connection('music')
        self.assertEqual(endpoint, 'https://common.example/proxy/v1/music/generate')
        self.assertEqual(headers['Authorization'], 'Bearer shared')

    async def test_sfx_prompt_settings_and_download(self):
        self.config['services'] = {'sfx': {'num_inference_steps': 20, 'cfg_scale': 3.5}}
        status, job = await self.call('start', {'kind': 'sfx', 'prompt': 'rain', 'seconds': 3, 'seed': 42})
        self.assertEqual(status, 200)
        self.assertEqual(self.params, dict(prompt='rain', seconds=3, seed=42, count=1, num_inference_steps=20, cfg_scale=3.5))
        status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200)
        self.assertTrue(result['files'][0]['file'].startswith('CapTimelineEditor/sfx/'))
        self.assertEqual(result['files'][0]['location'], 'output')

    async def test_tts_single_request_multiline_and_limit(self):
        status, voices = await self.call('voices')
        self.assertEqual(status, 200)
        self.assertEqual(voices[0]['id'], 'vivian')
        status, job = await self.call('start', {'kind': 'tts', 'text': 'First line\nSecond line', 'speaker': 'vivian', 'language': 'English'})
        self.assertEqual(status, 200, job)
        self.assertEqual(self.params['text'], 'First line\nSecond line')
        self.assertEqual(sum(path == '/v1/tts/generate' for _, path in self.calls), 1)
        status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200)
        self.assertEqual(result['files'][0]['location'], 'input')
        self.assertIn('/speech/', result['files'][0]['file'])
        status, _ = await self.call('start', {'kind': 'tts', 'text': 'x' * 2001})
        self.assertEqual(status, 400)

    async def test_voice_conversion_upload_and_reference(self):
        (self.root / 'source.wav').write_bytes(b'original')
        payload = dict(kind='vc', location='input', file='source.wav', scope='clip', duration_sec=2, speaker='vivian')
        status, job = await self.call('start', payload)
        self.assertEqual(status, 200, job)
        self.assertIn('source_upload_id', self.params)
        self.assertEqual(self.params['target_voice'], 'vivian')
        status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200)
        self.assertIn('/voice_converted/', result['files'][0]['file'])
        with patch.object(module, '_probe_duration_sec', lambda path: 60):
            status, _ = await self.call('start', payload | {'reference_file': 'source.wav'})
            self.assertEqual(status, 200)
            self.assertIn('reference_upload_id', self.params)
            self.assertNotIn('target_voice', self.params)
            self.assertNotEqual(self.params['source_upload_id'], self.params['reference_upload_id'])
            status, _ = await self.call('start', {'kind': 'tts', 'text': 'Clone', 'speaker': 'vivian', 'instruct': 'ignored', 'reference_file': 'source.wav', 'reference_text': 'Original'})
            self.assertEqual(status, 200)
            self.assertEqual(self.params['reference_text'], 'Original')
            self.assertNotIn('speaker', self.params)
            self.assertNotIn('instruct', self.params)

    async def test_separation_downloads_two_tracks(self):
        (self.root / 'source.wav').write_bytes(b'original')
        self.config['services'] = {'separation': {'segment_seconds': 4}}
        status, job = await self.call('start', {'kind': 'separation', 'location': 'input', 'file': 'source.wav', 'scope': 'clip', 'duration_sec': 2})
        self.assertEqual(status, 200, job)
        self.assertEqual(self.form, dict(segment_seconds='4'))
        status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200, result)
        self.assertEqual(len(result['files']), 2)
        for index, row in enumerate(result['files']):
            self.assertIn(f'speaker_{index + 1}', row['file'])
            self.assertEqual(row['location'], 'input')
            self.assertEqual((self.root / row['file']).read_bytes(), b'audio data')

    async def test_denoise_extracts_clip_audio_and_preserves_original(self):
        source = self.root / 'clip.mp4'
        source.write_bytes(b'original video')
        commands = []
        def mux(command):
            commands.append(command)
            Path(command[-1]).write_bytes(b'new video')
        with patch.object(module, '_run_ffmpeg', mux):
            status, job = await self.call('start', {'kind': 'denoise', 'file': 'clip.mp4', 'scope': 'clip', 'trim_in_sec': 1, 'duration_sec': 2})
            self.assertEqual(status, 200)
            self.assertEqual(self.uploaded, b'new video')
            status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200, result)
        self.assertEqual(source.read_bytes(), b'original video')
        self.assertIn('atrim=start=1.0:duration=2.0', commands[0][commands[0].index('-af') + 1])
        self.assertTrue(result['files'][0]['file'].endswith('.wav'))
        self.assertEqual(result['files'][0]['location'], 'input')

    async def test_path_and_remote_host_rejected(self):
        status, _ = await self.call('start', {'kind': 'denoise', 'file': '../outside.mp4'})
        self.assertEqual(status, 400)
        self.config['url'] = 'file:///invalid'
        status, _ = await self.call('start', {'kind': 'music', 'lyrics': 'a', 'style': 'b'})
        self.assertEqual(status, 400)
        self.assertEqual(self.calls, [])

    async def test_cancel_and_failure(self):
        _, job = await self.call('start', {'kind': 'music', 'lyrics': 'a', 'style': 'b'})
        self.status = 'failed'
        status, data = await self.call('status/' + job['id'])
        self.assertEqual(data['error'], 'worker failed')
        self.assertEqual((await self.call('result/' + job['id'], {}))[0], 400)
        self.assertEqual((await self.call('cancel/' + job['id'], {}))[0], 200)
        self.assertEqual((await self.call('status/' + job['id']))[0], 404)

    async def test_processed_audio_keeps_returned_duration(self):
        source = self.root / 'clip.mp4'
        source.write_bytes(b'original')
        _, job = await self.call('start', {'kind': 'denoise', 'file': 'clip.mp4', 'scope': 'clip', 'trim_in_sec': 1, 'duration_sec': 2})
        with patch.object(module, '_probe_duration_sec', lambda path: 1):
            status, result = await self.call('result/' + job['id'], {})
        self.assertEqual(status, 200)
        self.assertEqual(result['files'][0]['duration_sec'], 1)
        self.assertEqual(source.read_bytes(), b'original')


if __name__ == '__main__':
    unittest.main()
