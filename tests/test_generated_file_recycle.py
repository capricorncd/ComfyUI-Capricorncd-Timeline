import ast
import logging
import os
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class GeneratedFileRecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.file = self.root / 'generated.mp4'
        self.file.write_bytes(b'video')
        self.recycled = []
        async def to_thread(fn, *args):
            return fn(*args)
        self.scope = dict(os=os, asyncio=SimpleNamespace(to_thread=to_thread), logging=logging,
                          sys=SimpleNamespace(platform='win32'),
                          resolve_lang=lambda request: 'en', t=lambda key, lang: key,
                          _asset_kind=lambda kind: ('', ['.mp4']) if kind == 'video' else None,
                          _win_send_to_recycle_bin=self.recycled.append,
                          web=SimpleNamespace(json_response=lambda body, status=200: (status, body)))
        import sys
        from unittest.mock import patch
        self.patch = patch.dict(sys.modules, folder_paths=SimpleNamespace(get_output_directory=lambda: str(self.root)))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        tree = ast.parse((Path(__file__).resolve().parents[1] / 'backend/__init__.py').read_text(encoding='utf-8'))
        nodes = [n for n in ast.walk(tree) if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))
                 and n.name in ('_safe_join', 'api_delete_asset')]
        for node in nodes:
            node.decorator_list = []
            node.returns = None
            for arg in node.args.args:
                arg.annotation = None
        exec(compile(ast.Module(body=nodes, type_ignores=[]), '<recycle>', 'exec'), self.scope)

    def run_request(self, json):
        coroutine = self.scope['api_delete_asset'](SimpleNamespace(json=json))
        try:
            coroutine.send(None)
        except StopIteration as result:
            return result.value
        self.fail('Unexpected asynchronous operation')

    def request(self, **extra):
        async def json():
            return dict(name='generated.mp4', kind='video', location='output', **extra)
        return self.run_request(json)

    def test_output_uses_recycler(self):
        status, body = self.request()
        self.assertEqual(status, 200)
        self.assertTrue(body['recycled'])
        self.assertEqual(self.recycled, [str(self.file.resolve())])
        self.assertTrue(self.file.exists())

    def test_input_and_traversal_rejected(self):
        for extra in ({'location': 'input'}, {'name': '../generated.mp4'}):
            async def json():
                return dict(dict(name='generated.mp4', kind='video', location='output'), **extra)
            status, _ = self.run_request(json)
            self.assertEqual(status, 400)
        self.assertEqual(self.recycled, [])

    def test_other_platform_does_not_permanently_delete(self):
        self.scope['sys'].platform = 'linux'
        status, _ = self.request()
        self.assertEqual(status, 400)
        self.assertEqual(self.recycled, [])
        self.assertTrue(self.file.exists())


if __name__ == '__main__':
    unittest.main()
