import ast
import os
import re
import unittest
from pathlib import Path

path = Path(__file__).parents[1] / 'backend/cap_clip_prompt_vl.py'
tree = ast.parse(path.read_text(encoding='utf-8'))
fn = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'storyboard_image_hint')
scope = dict(os=os, re=re)
exec(compile(ast.Module(body=[fn], type_ignores=[]), str(path), 'exec'), scope)
hint = scope['storyboard_image_hint']

class StoryboardAssetTests(unittest.TestCase):
    def test_setting_overrides_filename(self):
        text = hint(dict(media_type='grid_storyboard', grid_panels=6, file='story_G9.png'), 2, 'multi_ref')
        self.assertIn('count: 6', text)
        self.assertIn('<Picture 2>', text)
        self.assertNotIn('count: 9', text)

    def test_auto_suffix_and_visual(self):
        self.assertIn('count: 4', hint(dict(name='story_G4.png'), 1, 'grid_storyboard'))
        self.assertIn('determine visually', hint(dict(media_type='grid_storyboard'), 1, 'multi_ref'))

    def test_character_sheet_is_not_storyboard(self):
        text = hint(dict(media_type='character', file='hero_G9.png'), 1, 'grid_storyboard')
        self.assertIn('not a storyboard', text)
        self.assertNotIn('panel count', text)
        self.assertEqual(hint(dict(media_type='other'), 1, 'multi_ref'), '')

if __name__ == '__main__':
    unittest.main()
