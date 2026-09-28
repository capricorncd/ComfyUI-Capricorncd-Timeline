import ast
import json
import os
from pathlib import Path
import tempfile
from types import SimpleNamespace
import unittest

from aiohttp import web


class DirectoryCheckTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "existing").mkdir()
        (self.root / "file.txt").write_text("test")
        source = ast.parse((Path(__file__).parents[1] / "backend/__init__.py").read_text(encoding="utf-8"))
        methods = []
        for node in ast.walk(source):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in {"_safe_join", "api_export_directory_check"}:
                node.decorator_list = []
                methods.append(node)
        namespace = {"os": os, "web": web, "folder_paths": SimpleNamespace(get_output_directory=lambda: str(self.root))}
        exec(compile(ast.Module(body=methods, type_ignores=[]), "directory_routes", "exec"), namespace)
        self.check = namespace["api_export_directory_check"]

    async def request(self, directory, remote="127.0.0.1", origin="http://localhost:8188"):
        async def body():
            return {"directory": directory}
        response = await self.check(SimpleNamespace(json=body, remote=remote, content_type="application/json",
                                                   scheme="http", host="localhost:8188", headers={"Origin": origin}))
        return response.status, json.loads(response.body)

    async def test_existing_and_missing(self):
        for path in ["output/existing", "existing", str(self.root / "existing"), "output/"]:
            self.assertEqual(await self.request(path), (200, {"exists": True}))
        for path in ["output/missing", "output/file.txt", "../outside"]:
            self.assertEqual(await self.request(path), (200, {"exists": False}))
        self.assertFalse((self.root / "missing").exists())

    async def test_access_boundaries(self):
        self.assertEqual((await self.request(str(self.root), remote="10.0.0.2"))[0], 403)
        self.assertEqual((await self.request("output/existing", remote="10.0.0.2"))[0], 200)
        self.assertEqual((await self.request("output/existing", origin="https://other.example"))[0], 403)


if __name__ == "__main__":
    unittest.main()
