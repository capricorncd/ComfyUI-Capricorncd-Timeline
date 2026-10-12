import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import Mock, patch
from xml.etree import ElementTree
import zipfile

import numpy as np
from PIL import Image
from aiohttp import web
from aiohttp.test_utils import TestClient, TestServer, make_mocked_request


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = "save_images_test"
package = types.ModuleType(PACKAGE)
package.__path__ = [str(ROOT / "backend")]
sys.modules[PACKAGE] = package
folder_paths = types.SimpleNamespace()
with patch.dict(sys.modules, {"folder_paths": folder_paths}):
    spec = importlib.util.spec_from_file_location(PACKAGE + ".cap_save_images", ROOT / "backend/cap_save_images.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)


class SaveImagesTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        folder_paths.get_output_directory = lambda: str(self.root / "output")
        module.saved_image_batches.clear()
        self.routes = web.RouteTableDef()
        module.register_save_image_routes(self.routes)
        app = web.Application()
        app.add_routes(self.routes)
        self.client = TestClient(TestServer(app))
        await self.client.start_server()

    async def asyncTearDown(self):
        await self.client.close()
        self.temporary.cleanup()

    def save_batch(self, prefix):
        pixels = types.SimpleNamespace(cpu=lambda: types.SimpleNamespace(numpy=lambda: np.zeros((1, 1, 3))))
        # Exercise saving and UI routing without creating raster assets.
        image = Mock()
        image.save.side_effect = lambda path, **kwargs: Path(path).write_bytes(os.path.basename(path).encode())
        with patch.object(module.Image, "fromarray", return_value=image):
            return module.CAP_SaveImages().save_images([pixels, pixels], prefix, "{prefix}_{index}.png", 80, 300, save_sidecar=False)

    async def test_relative_and_absolute_batches_preserve_outputs_and_reveal_each_file(self):
        for prefix in ("output/测试, images/CSI", str(self.root / "outside output")):
            result = self.save_batch(prefix)
            directory, paths = result["result"]
            previews = result["ui"]["cap_saved_images"]
            self.assertEqual(len(previews), 2)
            expected = module.saved_image_batches[previews[0]["token"]]
            self.assertEqual(paths, ", ".join(str(Path(directory) / row["filename"]) for row in previews))
            for row, path in zip(previews, expected):
                url = f'/cap/saved_images/{row["token"]}/{row["index"]}'
                response = await self.client.get(url)
                self.assertEqual(response.status, 200)
                self.assertEqual(await response.read(), Path(path).read_bytes())
                with patch.object(module, "reveal_file") as reveal:
                    response = await self.client.post(url + "/reveal", json={})
                    self.assertEqual(response.status, 200)
                    reveal.assert_called_once_with(path)

    async def test_missing_and_forged_files_cannot_be_previewed_or_revealed(self):
        result = self.save_batch("CSI")
        row = result["ui"]["cap_saved_images"][0]
        base = f'/cap/saved_images/{row["token"]}'
        for suffix in ("-1", "2", "invalid"):
            self.assertEqual((await self.client.get(f"{base}/{suffix}")).status, 404)
        self.assertEqual((await self.client.get("/cap/saved_images/forged/0")).status, 404)
        Path(module.saved_image_batches[row["token"]][0]).unlink()
        with patch.object(module, "reveal_file") as reveal:
            self.assertEqual((await self.client.get(base + "/0")).status, 404)
            self.assertEqual((await self.client.post(base + "/0/reveal", json={})).status, 404)
            reveal.assert_not_called()

    async def test_reveal_only_allows_local_same_origin_json(self):
        row = self.save_batch("CSI")["ui"]["cap_saved_images"][0]
        url = f'/cap/saved_images/{row["token"]}/0/reveal'
        with patch.object(module, "reveal_file") as reveal:
            self.assertEqual((await self.client.post(url, json={}, headers={"Origin": "https://example.com"})).status, 403)
            self.assertEqual((await self.client.post(url, data="{}")).status, 403)
            handler = next(route.handler for route in self.routes if route.method == "POST")
            request = make_mocked_request("POST", url, headers={"Content-Type": "application/json"},
                                          match_info={"token": row["token"], "index": "0"})
            with self.assertRaises(web.HTTPForbidden):
                await handler(request)
            reveal.assert_not_called()

    async def test_failed_save_does_not_register_a_preview(self):
        pixels = types.SimpleNamespace(cpu=lambda: types.SimpleNamespace(numpy=lambda: np.zeros((1, 1, 3))))
        with patch.object(module.Image, "fromarray") as create:
            create.return_value.save.side_effect = OSError("Disk full")
            with self.assertRaises(OSError):
                module.CAP_SaveImages().save_images([pixels], "CSI", "{prefix}_{index}.png", 80, 300)
        self.assertEqual(module.saved_image_batches, {})


class ImageMetadataTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.root = Path(self.temporary.name)
        folder_paths.get_output_directory = lambda: str(self.root)
        self.prompt = {
            "1": {"class_type": "CLIPTextEncode", "inputs": {"text": "正面提示词 <灯光> & 人物"}},
            "2": {"class_type": "CLIPTextEncode", "inputs": {"text": "negative text"}},
            "3": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": "model.safetensors"}},
            "4": {"class_type": "KSampler", "inputs": {"seed": 123, "steps": 20, "cfg": 6.5,
                "sampler_name": "euler", "scheduler": "normal", "denoise": 1.0, "positive": ["1", 0]}},
        }
        self.workflow = {"nodes": [{"id": 1, "type": "CLIPTextEncode"}], "extra": {"说明": "完整工作流"}}
        self.array = np.full((8, 12, 4), [64, 128, 192, 128], dtype=np.uint8)

    def tearDown(self):
        self.temporary.cleanup()

    def save(self, extension="png", extra=None, **options):
        values = self.array[:, :, :3] if extension == "jpg" else self.array
        pixels = types.SimpleNamespace(cpu=lambda: types.SimpleNamespace(numpy=lambda: values / 255))
        result = module.CAP_SaveImages().save_images(
            [pixels], f"{extension}/CSI", "{prefix}_{index}." + extension, 80, 300,
            prompt=self.prompt, extra_pnginfo={"workflow": self.workflow, **(extra or {})},
            metadata="备注 中文 <&>", **options)
        row = result["ui"]["cap_saved_images"][0]
        return Path(module.saved_image_batches[row["token"]][0])

    def read_fields(self, image):
        if image.format == "PNG":
            return {key: json.loads(image.info[key]) for key in ("prompt", "workflow", "CapricorncdSaveImages", "ImageAssetMetadata")}
        packet = image.tag_v2[700] if image.format == "TIFF" else image.info["xmp"]
        return json.loads(ElementTree.fromstring(packet).find(".//{http://purl.org/dc/elements/1.1/}description").text)

    def test_defaults_and_complete_metadata_roundtrip_without_sidecar(self):
        inputs = module.CAP_SaveImages.INPUT_TYPES()["required"]
        self.assertFalse(inputs["save_sidecar"][1]["default"])
        self.assertEqual(inputs["quality"][1]["default"], 100)
        self.assertEqual(inputs["dpi"][1]["default"], 72)
        for extension, image_format in (("png", "PNG"), ("jpg", "JPEG"), ("webp", "WEBP"), ("tiff", "TIFF")):
            with self.subTest(extension=extension):
                path = self.save(extension)
                self.assertEqual(list(path.parent.glob("*.json")), [])
                baseline = io.BytesIO()
                values = self.array[:, :, :3] if extension == "jpg" else self.array
                Image.fromarray(values).save(baseline, format=image_format, quality=80, dpi=(300, 300))
                baseline.seek(0)
                with Image.open(path) as image, Image.open(baseline) as original:
                    image.load()
                    fields = self.read_fields(image)
                    self.assertEqual(fields["prompt"], self.prompt)
                    self.assertEqual(fields["workflow"], self.workflow)
                    parameters = fields["CapricorncdSaveImages"]
                    self.assertEqual(parameters["note"], "备注 中文 <&>")
                    self.assertEqual(parameters["quality"], 80)
                    self.assertEqual(parameters["dpi"], 300)
                    self.assertEqual(parameters["models"][0]["file"], "model.safetensors")
                    self.assertEqual(parameters["samplers"][0]["seed"], 123)
                    self.assertEqual(parameters["samplers"][0]["steps"], 20)
                    self.assertEqual(parameters["prompts"][0]["text"], self.prompt["1"]["inputs"]["text"])
                    self.assertIsNone(fields["ImageAssetMetadata"]["generation_prompt"])
                    self.assertEqual(fields["ImageAssetMetadata"]["generation_prompt_status"], "unavailable")
                    self.assertEqual(image.mode, original.mode)
                    self.assertEqual(image.tobytes(), original.tobytes(), "metadata must not cause a second lossy encode or change alpha")
                    if extension == "png":
                        self.assertEqual(image.info["dpi"], original.info["dpi"])

    def test_upstream_exact_prompt_and_reference_description_are_preserved(self):
        record = {"schema_version": 1, "asset_type": "prop", "asset_name": "道具",
            "generation_prompt": "Exact submitted prompt", "generation_prompt_status": "exact",
            "generation_prompt_source": "verified upstream generation record", "generation_mode": "external",
            "reference_images": [], "setting_description": "透明蓝色晶体道具", "consistency_constraints": ["保持蓝色"]}
        for value in (record, json.dumps(record, ensure_ascii=False)):
            path = self.save(extra={"ImageAssetMetadata": value, "custom": {"key": "保留"}})
            with Image.open(path) as image:
                self.assertEqual(json.loads(image.info["ImageAssetMetadata"]), record)
                self.assertEqual(json.loads(image.info["custom"]), {"key": "保留"})

    def test_optional_json_and_zip_still_include_embedded_metadata(self):
        path = self.save(save_sidecar=True, save_as_zip=True)
        self.assertTrue((path.parent / "CSI.json").is_file())
        with zipfile.ZipFile(str(path.parent) + ".zip") as archive:
            self.assertIn("CSI.json", archive.namelist())
            with Image.open(io.BytesIO(archive.read(path.name))) as image:
                self.assertEqual(self.read_fields(image)["prompt"], self.prompt)

    def test_long_metadata_is_not_truncated(self):
        self.prompt["1"]["inputs"]["text"] = "完整提示词" * 10000
        path = self.save()
        with Image.open(path) as image:
            self.assertEqual(self.read_fields(image)["prompt"], self.prompt)
        with self.assertRaisesRegex(ValueError, "JPEG XMP limit"):
            self.save("jpg")
        self.assertEqual(list((self.root / "jpg").glob("*.jpg")), [])


if __name__ == "__main__":
    unittest.main()
