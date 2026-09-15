import ast
import asyncio
import filecmp
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

from aiohttp import FormData, web
from aiohttp.test_utils import TestClient, TestServer


class OutputVideoImportTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        fp = SimpleNamespace(get_output_directory=lambda: str(self.root))
        self.patch = patch.dict('sys.modules', folder_paths=fp)
        self.patch.start()
        base = Path(__file__).parents[1]
        names = {'_unique_destination', '_list_output_media', '_store_output_video', 'api_import_output_video', 'api_list_output_videos'}
        tree = ast.parse((base / 'backend/__init__.py').read_text(encoding='utf-8'))
        nodes = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)) and n.name in names]
        safe_tree = ast.parse((base / 'backend/timecode.py').read_text(encoding='utf-8'))
        nodes.insert(0, next(n for n in safe_tree.body if isinstance(n, ast.FunctionDef) and n.name == '_safe_join'))
        scope = dict(os=os, asyncio=asyncio, filecmp=filecmp, tempfile=tempfile, folder_paths=fp,
                     web=web, routes=web.RouteTableDef(), VIDEO_EXTENSIONS={'.mp4', '.mov'},
                     resolve_lang=lambda request: 'en', t=lambda key, lang: key)
        exec(compile(ast.Module(body=nodes, type_ignores=[]), 'output_routes', 'exec'), scope)
        app = web.Application()
        app.add_routes(scope['routes'])
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.patch.stop()
        self.temp.cleanup()

    async def upload(self, name, content):
        form = FormData()
        form.add_field('file', content, filename=name, content_type='video/mp4')
        return await self.client.post('/audio_keyframe_timeline/import_output_video', data=form)

    async def test_nested_listing_has_no_400_file_cutoff(self):
        nested = self.root / 'nested'
        nested.mkdir()
        for i in range(405):
            (nested / f'{i}.mp4').write_bytes(b'video')
        response = await self.client.get('/audio_keyframe_timeline/output_videos')
        self.assertEqual((await response.json())['count'], 405)

    async def test_import_reuse_and_name_collision(self):
        original = self.root / 'nested' / 'clip.mp4'
        original.parent.mkdir()
        original.write_bytes(b'original video bytes with metadata')
        response = await self.upload('clip.mp4', original.read_bytes())
        self.assertEqual(response.status, 200)
        self.assertEqual((await response.json())['file'], 'nested/clip.mp4')
        for content, expected in [(b'external one', 'clip.mp4'), (b'external two', 'clip_1.mp4')]:
            response = await self.upload('clip.mp4', content)
            self.assertEqual(response.status, 200)
            path = (await response.json())['file']
            self.assertEqual(path, 'CapTimelineEditor/imports/' + expected)
            self.assertEqual((self.root / path).read_bytes(), content)
        self.assertEqual(original.read_bytes(), b'original video bytes with metadata')
        self.assertFalse(list(self.root.glob('*.upload')))

    async def test_reject_invalid_and_empty_files(self):
        for name, content in [('bad.txt', b'bad'), ('empty.mp4', b'')]:
            response = await self.upload(name, content)
            self.assertEqual(response.status, 400)
        self.assertEqual(list(self.root.iterdir()), [])


if __name__ == '__main__':
    unittest.main()
