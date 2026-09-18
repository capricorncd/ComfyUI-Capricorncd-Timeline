"""Local AI Service adapter: asynchronous music generation and audio denoising."""
import asyncio
from pathlib import Path
import re
import math
import shutil
import subprocess
import tempfile
from urllib.parse import urlsplit

import aiohttp
from aiohttp import web
import folder_paths

from .cap_bgm_settings import _read
from .cap_compose_clip_videos import _run_ffmpeg, _probe_duration_sec, _probe_has_audio
from .audio_envelope import volume_points_filter
from .timecode import _safe_join, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS


PREFIX = '/audio_keyframe_timeline/local_audio'
LIMIT = 512 * 1024 * 1024


ENDPOINTS = {'music': '/v1/music/generate', 'sfx': '/v1/sfx/generate', 'denoise': '/v1/denoise/file',
             'separation': '/v1/separate/file', 'vc': '/v1/voice/convert', 'tts': '/v1/tts/generate'}


def connection(kind='music'):
    config = _read()
    override = config.get('services', {}).get(kind, {})
    endpoint = override.get('url') or ENDPOINTS[kind]
    common = str(config.get('url', '')).rstrip('/')
    if endpoint.startswith('//'):
        raise ValueError('Invalid audio service endpoint.')
    endpoint = endpoint if urlsplit(endpoint).scheme else common + '/' + endpoint.lstrip('/')
    parsed = urlsplit(endpoint)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError('Configure a valid HTTP(S) audio service endpoint.')
    # Companion uploads/voices/jobs use the same API mount and credentials.
    prefix = parsed.path.split('/v1/', 1)[0] if '/v1/' in parsed.path else ''
    base = f'{parsed.scheme}://{parsed.netloc}{prefix}'
    key = override.get('api_key') or config.get('api_key')
    return base, {'Authorization': 'Bearer ' + key} if key else {}, endpoint


async def request_json(session, method, url, **kwargs):
    async with session.request(method, url, allow_redirects=False, **kwargs) as response:
        data = await response.json(content_type=None)
        if response.status >= 300:
            raise ValueError(str(data.get('detail') or data.get('error') or f'HTTP {response.status}'))
        return data


def denoise_source(payload):
    location = payload.get('location', 'output')
    if location not in ('input', 'output'):
        raise ValueError('Unsupported media location.')
    root = folder_paths.get_input_directory() if location == 'input' else folder_paths.get_output_directory()
    path = _safe_join(root, payload.get('file', ''))
    if not path or Path(path).suffix.lower() not in VIDEO_EXTENSIONS | AUDIO_EXTENSIONS or not Path(path).is_file():
        raise ValueError('Audio or video not found.')
    return path


def prepare_denoise_audio(source, destination, payload):
    scope = payload.get('scope', 'clip')
    if scope not in ('full', 'clip'):
        raise ValueError('Choose full audio or clip interval.')
    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error', '-i', source]
    if scope == 'clip':
        offset = float(payload.get('trim_in_sec', 0))
        duration = float(payload.get('duration_sec', 0))
        rate = float(payload.get('playback_rate', 1))
        if not all(math.isfinite(n) for n in (offset, duration, rate)) or offset < 0 or duration <= 0 or not 0.05 <= rate <= 20:
            raise ValueError('Invalid clip interval or playback rate.')
        filters = [f'atrim=start={offset}:duration={duration * rate}', 'asetpts=PTS-STARTPTS']
        while rate < 0.5:
            filters.append('atempo=0.5')
            rate /= 0.5
        while rate > 2:
            filters.append('atempo=2')
            rate /= 2
        filters.append(f'atempo={rate}')
        command += ['-af', ','.join(filters)]
    command += ['-map', '0:a:0', '-vn', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', '1', str(destination)]
    _run_ffmpeg(command)
    duration = _probe_duration_sec(str(destination))
    if not duration or Path(destination).stat().st_size > LIMIT:
        raise ValueError('Invalid audio or upload exceeds 512 MB.')
    return duration


def prepare_clip_mix(destination, payload, *, channels=1):
    duration = float(payload.get('duration_sec', 0))
    if not math.isfinite(duration) or duration <= 0:
        raise ValueError('Invalid clip duration.')
    command = ['ffmpeg', '-y', '-hide_banner', '-loglevel', 'error']
    filters, labels = [], []
    for row in payload['mix']:
        source = denoise_source(row)
        if not _probe_has_audio(source):
            continue
        offset = float(row.get('trim_in_sec', 0))
        start = float(row.get('edit_start_sec', 0))
        length = float(row.get('duration_sec', 0))
        volume = float(row.get('volume', 1))
        if not all(math.isfinite(n) for n in (offset, start, length, volume)) or min(offset, start, volume) < 0 or length <= 0:
            raise ValueError('Invalid clip mix interval or volume.')
        index = len(labels)
        command += ['-i', source]
        envelope = volume_points_filter(row.get('volume_points'), offset)
        filters.append(f'[{index}:a:0]atrim=start={offset}:duration={length},asetpts=PTS-STARTPTS'
                       f'{envelope},volume={volume},aresample=48000,adelay={round(start * 1000)}:all=1[a{index}]')
        labels.append(f'[a{index}]')
    if not labels:
        raise ValueError('The clip has no audible audio sources.')
    filters.append(''.join(labels) + f'amix=inputs={len(labels)}:normalize=0:dropout_transition=0,apad,atrim=duration={duration}[mixed]')
    command += ['-filter_complex', ';'.join(filters), '-map', '[mixed]', '-c:a', 'pcm_s16le', '-ar', '48000', '-ac', str(channels), str(destination)]
    _run_ffmpeg(command)
    if not _probe_duration_sec(str(destination)) or Path(destination).stat().st_size > LIMIT:
        raise ValueError('Invalid clip mix or upload exceeds 512 MB.')


def register_local_audio_routes(routes):
    # Bind each submitted task to its original service and source, even if settings change.
    jobs = {}

    async def handle(request):
        try:
            action = request.match_info['action']
            if action == 'voice_preview':
                voice_id = request.match_info['voice_id']
                if not re.fullmatch(r'[A-Za-z0-9_-]+', voice_id):
                    raise ValueError('Invalid voice ID.')
                kind = request.query.get('kind', 'tts')
                if kind not in ('tts', 'vc'):
                    raise ValueError('Unsupported voice service.')
                url, headers, _ = connection(kind)
                async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as session:
                    async with session.get(url + '/v1/voices/' + voice_id + '/audio', allow_redirects=False) as response:
                        if response.status != 200:
                            raise ValueError(f'Voice preview unavailable (HTTP {response.status}).')
                        audio = await response.read()
                        return web.Response(body=audio, content_type='audio/wav', headers={'Cache-Control': 'private, no-store'})
            if action == 'voices':
                url, headers, _ = connection(request.query.get('kind', 'tts') if request.query.get('kind') in ('tts', 'vc') else 'tts')
                async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=30)) as session:
                    return web.json_response(await request_json(session, 'GET', url + '/v1/voices'))
            if action == 'start':
                payload = await request.json()
                if not isinstance(payload, dict):
                    raise ValueError('Expected a task object.')
                kind = payload.get('kind')
                if kind not in ('music', 'denoise', 'sfx', 'separation', 'tts', 'vc'):
                    raise ValueError('Unsupported task.')
                if len(jobs) >= 200:
                    for old_id in list(jobs):
                        if 'files' in jobs[old_id] or jobs[old_id].get('terminal'):
                            del jobs[old_id]
                    if len(jobs) >= 200:
                        raise ValueError('Too many pending local audio tasks; finish or cancel existing tasks.')
                url, headers, endpoint = connection(kind)
                mix = payload.get('mix')
                if mix is not None and (not isinstance(mix, list) or not mix or any(not isinstance(row, dict) for row in mix)):
                    raise ValueError('Expected clip audio sources.')
                source = denoise_source(payload) if kind in ('denoise', 'separation', 'vc') and mix is None else None
                config = _read()
                async with aiohttp.ClientSession(headers=headers, timeout=aiohttp.ClientTimeout(total=300)) as session:
                    reference_id = None
                    if kind in ('tts', 'vc') and payload.get('reference_file'):
                        reference = denoise_source({'file': payload['reference_file'], 'location': 'input'})
                        with tempfile.TemporaryDirectory(prefix='cap_voice_reference_') as temporary:
                            audio = Path(temporary) / 'reference.wav'
                            interval = {'scope': 'full'}
                            if 'reference_start_sec' in payload or 'reference_end_sec' in payload:
                                start = float(payload.get('reference_start_sec', -1))
                                end = float(payload.get('reference_end_sec', -1))
                                duration = await asyncio.to_thread(_probe_duration_sec, reference)
                                if not all(math.isfinite(n) for n in (start, end)) or not duration or not 0 <= start < end <= duration + 0.001:
                                    raise ValueError('Invalid reference audio interval.')
                                interval = {'scope': 'clip', 'trim_in_sec': start, 'duration_sec': min(end, duration) - start}
                            await asyncio.to_thread(prepare_denoise_audio, reference, audio, interval)
                            with audio.open('rb') as stream:
                                form = aiohttp.FormData()
                                form.add_field('file', stream, filename='reference.wav', content_type='audio/wav')
                                uploaded = await request_json(session, 'POST', url + '/v1/uploads', data=form)
                                reference_id = uploaded['upload_id']
                    if kind == 'music':
                        params = {key: payload[key] for key in ('lyrics', 'style', 'count', 'seed', 'mode', 'max_duration') if key in payload}
                        job = await request_json(session, 'POST', endpoint + '?wait=false', json=params)
                    elif kind == 'sfx':
                        params = {key: payload[key] for key in ('prompt', 'seconds', 'seed') if key in payload}
                        params.update(count=1, num_inference_steps=config.get('services', {}).get('sfx', {}).get('num_inference_steps', 100), cfg_scale=config.get('services', {}).get('sfx', {}).get('cfg_scale', 4))
                        job = await request_json(session, 'POST', endpoint + '?wait=false', json=params)
                    elif kind == 'tts':
                        text = str(payload.get('text', '')).strip()
                        if not 1 <= len(text) <= 2000:
                            raise ValueError('TTS requires 1–2000 characters; shorten the text before submitting.')
                        params = {'text': text, 'language': payload.get('language', 'Auto'), 'seed': payload.get('seed', 42)}
                        if reference_id:
                            params.update(reference_upload_id=reference_id, reference_text=payload.get('reference_text', ''))
                        else:
                            params.update(speaker=payload.get('speaker', 'vivian'), instruct=payload.get('instruct', ''))
                        job = await request_json(session, 'POST', endpoint + '?wait=false', json=params)
                    else:
                        with tempfile.TemporaryDirectory(prefix='cap_denoise_source_') as temporary:
                            audio = Path(temporary) / 'source.wav'
                            if mix is not None:
                                await asyncio.to_thread(prepare_clip_mix, audio, payload)
                            else:
                                await asyncio.to_thread(prepare_denoise_audio, source, audio, payload)
                            with audio.open('rb') as stream:
                                form = aiohttp.FormData()
                                form.add_field('file', stream, filename='source.wav', content_type='audio/wav')
                                if kind == 'separation':
                                    form.add_field('segment_seconds', str(config.get('services', {}).get('separation', {}).get('segment_seconds', 2)))
                                if kind == 'vc':
                                    uploaded = await request_json(session, 'POST', url + '/v1/uploads', data=form)
                                    params = {'source_upload_id': uploaded['upload_id'], 'seed': payload.get('seed', 42)}
                                    if reference_id:
                                        params['reference_upload_id'] = reference_id
                                    else:
                                        params['target_voice'] = payload.get('speaker', 'vivian')
                                    job = await request_json(session, 'POST', endpoint + '?wait=false', json=params)
                                else:
                                    job = await request_json(session, 'POST', endpoint + '?wait=false', data=form)
                job_id = str(job.get('id', ''))
                if not re.fullmatch(r'[a-zA-Z0-9_-]+', job_id):
                    raise ValueError('Invalid service task ID.')
                jobs[job_id] = {'url': url, 'headers': headers, 'kind': kind, 'lock': asyncio.Lock()}
                return web.json_response({'id': job_id, 'status': job['status']})
            job_id = request.match_info['job_id']
            entry = jobs.get(job_id)
            if entry is None:
                return web.json_response({'error': 'Task not found; check Local AI Service task history.'}, status=404)
            async with entry['lock']:
                if action == 'result' and 'files' in entry:
                    return web.json_response({'files': entry['files']})
                if action == 'status' and 'files' in entry:
                    return web.json_response({'id': job_id, 'status': 'succeeded', 'error': None})
                async with aiohttp.ClientSession(headers=entry['headers'], timeout=aiohttp.ClientTimeout(total=600)) as session:
                    job_url = entry['url'] + '/v1/jobs/' + job_id
                    if action == 'cancel':
                        await request_json(session, 'DELETE', job_url)
                        jobs.pop(job_id, None)
                        return web.json_response({'status': 'cancelled'})
                    job = await request_json(session, 'GET', job_url)
                    if action == 'status':
                        entry['terminal'] = job['status'] not in ('queued', 'running')
                        return web.json_response({'id': job_id, 'status': job['status'], 'error': job.get('error')})
                    if action != 'result' or job['status'] != 'succeeded':
                        raise ValueError('Task has not completed successfully.')
                    files = (job.get('result') or {}).get('files') or []
                    if not files or len(files) > 2:
                        raise ValueError('Unexpected number of output files.')
                    if entry['kind'] == 'separation' and len(files) != 2:
                        raise ValueError('Expected two separated speaker tracks.')
                    processed = entry['kind'] in ('denoise', 'separation', 'tts', 'vc')
                    root = Path(folder_paths.get_input_directory() if processed else folder_paths.get_output_directory())
                    directory = root / 'CapTimelineEditor' / {'denoise': 'denoised', 'separation': 'separated', 'music': 'bgm', 'sfx': 'sfx', 'tts': 'speech', 'vc': 'voice_converted'}[entry['kind']]
                    directory.mkdir(parents=True, exist_ok=True)
                    saved = []
                    created = []
                    try:
                        with tempfile.TemporaryDirectory(prefix='cap_local_audio_') as temporary:
                            for index, item in enumerate(files):
                                audio = Path(temporary) / f'{index}.wav'
                                async with session.get(job_url + f'/files/{index}', allow_redirects=False) as response:
                                    if response.status != 200:
                                        raise ValueError(f'Result download failed: HTTP {response.status}')
                                    size = 0
                                    with audio.open('wb') as stream:
                                        async for chunk in response.content.iter_chunked(65536):
                                            size += len(chunk)
                                            if size > LIMIT:
                                                raise ValueError('Result exceeds 512 MB.')
                                            stream.write(chunk)
                                duration = await asyncio.to_thread(_probe_duration_sec, str(audio))
                                if not duration:
                                    raise ValueError('Service returned invalid audio.')
                                suffix = f'speaker_{index + 1}' if entry['kind'] == 'separation' else str(index)
                                destination = directory / f'{job_id}_{suffix}.wav'
                                created.append(destination)
                                await asyncio.to_thread(shutil.copyfile, audio, destination)
                                saved.append({'file': destination.relative_to(root).as_posix(), 'duration_sec': duration,
                                              'location': 'input' if processed else 'output'})
                    except BaseException:
                        for path in created:
                            path.unlink(missing_ok=True)
                        raise
                    entry['files'] = saved
                    entry['headers'] = {}
                    return web.json_response({'files': saved})
        except (ValueError, OSError, aiohttp.ClientError, asyncio.TimeoutError, RuntimeError, subprocess.TimeoutExpired) as exc:
            return web.json_response({'error': str(exc)}, status=400)

    routes.post(PREFIX + '/{action:start}')(handle)
    routes.get(PREFIX + '/{action:voices}')(handle)
    routes.get(PREFIX + '/{action:voice_preview}/{voice_id}')(handle)
    routes.get(PREFIX + '/{action:status}/{job_id}')(handle)
    routes.post(PREFIX + '/{action:cancel|result}/{job_id}')(handle)
