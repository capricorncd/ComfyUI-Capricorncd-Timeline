import ast
import os
from pathlib import Path
import re
import tempfile
import unittest

from PIL import Image, ImageFilter


source = Path(__file__).resolve().parents[1] / 'backend' / 'cap_compose_timeline_export.py'
tree = ast.parse(source.read_text(encoding='utf-8-sig'))
scope = dict(re=re, os=os, tempfile=tempfile, ImageFilter=ImageFilter, resolve_font_path=lambda _: '')
exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)
                            and n.name in {'_subtitle_rgba', '_render_subtitle_png'}], type_ignores=[]), str(source), 'exec'), scope)


class SubtitleRgbaTests(unittest.TestCase):
    def test_color_and_combined_opacity(self):
        color = scope['_subtitle_rgba']
        self.assertEqual(color('#112233', 1), (17, 34, 51, 255))
        self.assertEqual(color('rgba(17,34,51,0.5)', .5), (17, 34, 51, 64))
        self.assertEqual(color('#11223300', 1), (17, 34, 51, 0))
        self.assertEqual(color('rgba(17,34,51,0)', 1), (17, 34, 51, 0))
        self.assertEqual(color('invalid', 1), (0, 0, 0, 255))

    def render(self, **settings):
        style = dict(font_size=60, color='#ffffff', stroke_width=8, stroke_enabled=True,
                     shadow_enabled=True, shadow_offset_x=35, shadow_offset_y=35, shadow_blur=0,
                     stroke_color='rgba(255,0,0,0.5)', shadow_color='rgba(0,0,255,0.25)')
        style.update(settings)
        path = scope['_render_subtitle_png']('TEST', style)
        try:
            with Image.open(path) as image:
                return list(image.getdata())
        finally:
            os.remove(path)

    def test_render_independent_alpha(self):
        pixels = self.render()
        red = [a for r, g, b, a in pixels if r > 240 and g < 10 and b < 10]
        blue = [a for r, g, b, a in pixels if b > 240 and r < 10 and g < 10]
        self.assertIn(128, red)
        self.assertIn(64, blue)
        self.assertTrue(any(r == g == b == 255 and a == 255 for r, g, b, a in pixels))

    def test_transparent_effects_and_overall_opacity(self):
        pixels = self.render(stroke_color='rgba(255,0,0,0)', shadow_color='rgba(0,0,255,0)')
        self.assertFalse(any(a > 0 and max(r, g, b) - min(r, g, b) > 10 for r, g, b, a in pixels))
        self.assertTrue(all(a == 0 for *_, a in self.render(opacity=0)))


if __name__ == '__main__':
    unittest.main()
