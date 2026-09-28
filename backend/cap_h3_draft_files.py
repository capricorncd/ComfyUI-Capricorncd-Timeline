"""Local preview-version file management; never permanently delete files."""
import asyncio
import json
import sys
from pathlib import Path

from aiohttp import web
import folder_paths

from .cap_clear_directory import _win_send_to_recycle_bin
from .cap_h3_drafts import DRAFT_ROOT, draft_directory, read_draft


def preview_path(manifest):
    root = Path(folder_paths.get_output_directory()).resolve()
    path = (root / manifest['file']).resolve()
    if path.parent != version_directory(manifest['id']) or path.suffix.lower() not in {'.mp4', '.webm', '.mov', '.mkv'}:
        raise ValueError('Preview video must be inside its version directory')
    return path


def version_directory(version_id):
    path = draft_directory(version_id)
    expected = Path(folder_paths.get_output_directory()).resolve() / DRAFT_ROOT / version_id
    if path != expected or expected.is_symlink():
        raise ValueError('Version directory must not be redirected')
    return path


def recycle_version(version_id):
    if sys.platform != 'win32':
        raise ValueError('System recycle bin is not supported on this platform; no files were deleted')
    directory = version_directory(version_id)
    manifest_path = directory / 'version.json'
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('id') != version_id or manifest.get('schema_version') != 1:
        raise ValueError('Invalid preview version')
    paths = [preview_path(manifest), directory / 'latent.safetensors', manifest_path]
    # Resolve and validate every target before moving any file.
    for path in paths:
        if path.is_symlink() or not path.resolve().is_relative_to(Path(folder_paths.get_output_directory()).resolve()):
            raise ValueError('Preview files must remain inside the output directory')
    for path in paths:
        if path.is_file():
            _win_send_to_recycle_bin(str(path))


def associated_versions(directory, clip_id):
    root = (Path(folder_paths.get_output_directory()) / DRAFT_ROOT).resolve()
    path = Path(directory)
    if not path.is_absolute():
        path = Path(folder_paths.get_output_directory()) / path
    path = path.resolve()
    if not path.is_relative_to(root) or not path.is_dir():
        raise ValueError('Select an existing folder inside output/' + DRAFT_ROOT)
    manifests = [path / 'version.json'] if (path / 'version.json').is_file() else list(path.glob('*/version.json'))
    rows = []
    for file in sorted(manifests, key=lambda item: item.stat().st_mtime, reverse=True):
        version_directory(file.parent.name)
        if file.is_symlink() or (file.parent / 'latent.safetensors').is_symlink():
            raise ValueError('Version files must not be redirected')
        manifest = read_draft(file.parent.name)
        if file.resolve() != (draft_directory(manifest['id']) / 'version.json').resolve():
            raise ValueError('Version folder does not match its ID')
        if str(manifest['clip_id']) != str(clip_id):
            continue
        if not preview_path(manifest).is_file():
            raise ValueError('Restore the preview video from the recycle bin first')
        keys = ('id', 'clip_id', 'source_output', 'seed', 'width', 'height', 'frames', 'fps', 'prompt', 'file', 'keyframe_segment')
        rows.append({key: manifest[key] for key in keys if key in manifest})
    return rows


def register_h3_draft_file_routes(routes):
    lock = asyncio.Lock()

    @routes.post('/audio_keyframe_timeline/h3_draft_files/{action}')
    async def manage(request):
        if request.remote not in {'127.0.0.1', '::1', '::ffff:127.0.0.1'} or request.content_type != 'application/json':
            raise web.HTTPForbidden()
        if request.headers.get('Origin') not in (None, f'{request.scheme}://{request.host}'):
            raise web.HTTPForbidden()
        try:
            body = await request.json()
            async with lock:
                if request.match_info['action'] == 'delete':
                    await asyncio.to_thread(recycle_version, body.get('id'))
                    return web.json_response({'ok': True})
                if request.match_info['action'] == 'associate':
                    rows = await asyncio.to_thread(associated_versions, str(body.get('directory') or ''), body.get('clip_id'))
                    return web.json_response({'versions': rows})
                raise web.HTTPNotFound()
        except (OSError, ValueError, KeyError, TypeError, AttributeError) as error:
            return web.json_response({'error': str(error)}, status=400)
