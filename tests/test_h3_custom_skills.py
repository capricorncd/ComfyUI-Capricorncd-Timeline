import ast
from pathlib import Path
import tempfile
import unittest


class CustomSkillsTest(unittest.TestCase):
    def test_save_list_load_preview_and_invalid_paths(self):
        path = Path(__file__).parents[1] / 'backend' / 'cap_h3_skills.py'
        tree = ast.parse(path.read_text(encoding='utf-8'))
        tree.body = [node for node in tree.body if not isinstance(node, ast.ImportFrom) or node.level == 0]
        scope = {'__file__': str(path), 'get_last_known_lang': lambda: 'en'}
        exec(compile(tree, str(path), 'exec'), scope)
        with tempfile.TemporaryDirectory() as tmp:
            scope['skill_repo_root'] = lambda source='community': Path(tmp) / source
            skill_id = scope['save_custom_skill']('My Skill', 'Exact prompt', b'GIF89a', '.gif')
            self.assertEqual(scope['load_skill_text'](skill_id), 'Exact prompt')
            self.assertEqual(scope['resolve_skill_preview'](skill_id).read_bytes(), b'GIF89a')
            rows = scope['list_h3_skills']()
            self.assertEqual(rows[0]['title'], 'My Skill')
            self.assertTrue(rows[0]['has_preview'])
            self.assertEqual(rows[0]['preview_type'], 'image')
            video_id = scope['save_custom_skill']('Video', 'Video rule', b'video', '.mp4')
            self.assertEqual(scope['resolve_skill_preview'](video_id).suffix, '.mp4')
            for bad in ['custom__../secret', 'custom__/absolute', 'custom__a/../../secret']:
                with self.assertRaises(ValueError):
                    scope['load_skill_text'](bad)
            with self.assertRaises(ValueError):
                scope['save_custom_skill']('Bad', 'Text', b'x', '.html')


if __name__ == '__main__':
    unittest.main()
