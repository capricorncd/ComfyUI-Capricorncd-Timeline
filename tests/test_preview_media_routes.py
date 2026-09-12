import ast
from pathlib import Path
import time
import unittest
import uuid

from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer


class PreviewMediaRoutesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Exercise the real route bodies without importing model/node dependencies.
        source = ast.parse((Path(__file__).parents[1] / "backend/__init__.py").read_text(encoding="utf-8"))
        names = {"api_put_preview_image", "api_get_preview_image", "api_delete_preview_image"}
        handlers = [node for node in ast.walk(source) if isinstance(node, ast.AsyncFunctionDef) and node.name in names]
        self.cache = {}
        scope = {"web": web, "uuid": uuid, "time": time, "routes": web.RouteTableDef(), "preview_images": self.cache}
        exec(compile(ast.Module(body=handlers, type_ignores=[]), "preview_routes", "exec"), scope)
        app = web.Application()
        app.add_routes(scope["routes"])
        self.client = TestClient(TestServer(app))
        await self.client.start_server()
        self.path = f"/audio_keyframe_timeline/preview_image/{uuid.uuid4()}"

    async def asyncTearDown(self):
        await self.client.close()

    async def put(self, step, data, mime="video/mp4"):
        response = await self.client.post(f"{self.path}?frame={step}", data=data, headers={"Content-Type": mime})
        self.assertEqual(response.status, 204)

    async def test_step_bytes_and_mime_are_immutable(self):
        await self.put(1, b"first-video")
        await self.put(2, b"second-pass-noise", "image/jpeg")
        await self.put(3, b"second-video")
        await self.put(1, b"late-duplicate", "image/webp")
        response = await self.client.get(f"{self.path}?frame=1")
        self.assertEqual(await response.read(), b"first-video")
        self.assertEqual(response.content_type, "video/mp4")
        response = await self.client.get(f"{self.path}?frame=2")
        self.assertEqual(response.content_type, "image/jpeg")
        response = await self.client.get(self.path)
        self.assertEqual(await response.read(), b"second-video")
        await self.put(4, b"next")
        response = await self.client.get(f"{self.path}?frame=1")
        self.assertEqual(response.status, 404, "Never substitute a newer step for an expired URL")

    async def test_video_ranges(self):
        await self.put(1, b"0123456789")
        for header, expected, content_range in [
            ("bytes=2-5", b"2345", "bytes 2-5/10"),
            ("bytes=6-", b"6789", "bytes 6-9/10"),
            ("bytes=-3", b"789", "bytes 7-9/10"),
            ("bytes=0-99", b"0123456789", "bytes 0-9/10"),
        ]:
            response = await self.client.get(f"{self.path}?frame=1", headers={"Range": header})
            self.assertEqual(response.status, 206)
            self.assertEqual(await response.read(), expected)
            self.assertEqual(response.headers["Content-Range"], content_range)
        for header in ["bytes=20-", "bytes=invalid", "bytes=0-1,3-4"]:
            response = await self.client.get(f"{self.path}?frame=1", headers={"Range": header})
            self.assertEqual(response.status, 416)
        response = await self.client.get(f"{self.path}?frame=invalid")
        self.assertEqual(response.status, 400)

    async def test_memory_limit_and_delete(self):
        for step in range(1, 4):
            await self.put(step, b"x" * (3 * 1024 * 1024))
        frames, _ = next(iter(self.cache.values()))
        self.assertEqual(list(frames), [2, 3])
        response = await self.client.delete(self.path)
        self.assertEqual(response.status, 204)
        self.assertFalse(self.cache)


if __name__ == "__main__":
    unittest.main()
