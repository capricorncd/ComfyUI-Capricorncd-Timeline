import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image, PngImagePlugin

spec = importlib.util.spec_from_file_location('crop', Path(__file__).resolve().parents[1] / 'backend/cap_image_crop.py')
crop = importlib.util.module_from_spec(spec)
spec.loader.exec_module(crop)


class CropTests(unittest.TestCase):
    def test_pixels_metadata_and_original(self):
        with tempfile.TemporaryDirectory() as directory:
            source, output = Path(directory) / 'original.png', Path(directory) / 'crop.png'
            image = Image.new('RGBA', (100, 80), (12, 34, 56, 78))
            meta = PngImagePlugin.PngInfo()
            for key, value in {'prompt': '{"node":1}', 'workflow': '{"nodes":[]}', 'ImageAssetMetadata': '{"generation_prompt":"original prompt"}'}.items():
                meta.add_itxt(key, value)
            image.save(source, pnginfo=meta)
            original_bytes = source.read_bytes()
            crop.crop_image_file(source, output, dict(x=.2, y=.25, width=.5, height=.5))
            with Image.open(output) as result:
                self.assertEqual(result.size, (50,40))
                self.assertEqual(result.getpixel((0,0)), (12,34,56,78))
                self.assertEqual(result.info['prompt'], '{"node":1}')
                self.assertEqual(result.info['workflow'], '{"nodes":[]}')
                self.assertEqual(json.loads(result.info['ImageAssetMetadata'])['generation_prompt'], 'original prompt')
            crop.crop_image_file(source, output, dict(x=0,y=0,width=1,height=1))
            with Image.open(output) as result:
                self.assertEqual(result.size, (100,80))
            self.assertEqual(source.read_bytes(), original_bytes)

    def test_invalid_rectangles(self):
        for rect in [dict(x=-.1,y=0,width=1,height=1), dict(x=0,y=0,width=2,height=1), dict(x=0,y=0,width=float('nan'),height=1)]:
            with self.assertRaises(ValueError):
                crop.crop_image_file('unused.png','unused-out.png',rect)


if __name__ == '__main__':
    unittest.main()
