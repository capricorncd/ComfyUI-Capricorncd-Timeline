import importlib.util
from pathlib import Path
import unittest
import sys
import types

path = Path(__file__).parents[1] / 'backend/h3_prompt_mentions.py'
package = types.ModuleType('mention_test_backend')
package.__path__ = [str(path.parent)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location('mention_test_backend.h3_prompt_mentions', path)
h3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h3)

class MentionTests(unittest.TestCase):
    def test_commented_mentions_do_not_load_selected_assets(self):
        project = {'media': [{'id': 'hero', 'name': '流川枫长发', 'kind': 'image'}]}
        clip = {'prompt': '//@流川枫长发 个', 'prompt_media_ids': ['hero']}
        self.assertEqual(h3.prompt_reference_rows(project, clip), [])
        clip['prompt'] += '\n@流川枫长发 扣篮'
        self.assertEqual([row['id'] for row in h3.prompt_reference_rows(project, clip)], ['hero'])
    def test_chinese_prose_before_mentions_in_all_sections(self):
        refs = [({'name': '樱木花道'}, '<Picture 1>'), ({'name': '球场'}, '<Picture 2>')]
        text = 'summary: 一名运动员@樱木花道 在室内篮球场@球场 完成扣篮。\ndetailed_description: 跟随@樱木花道，动作参考<Video 1>。'
        self.assertEqual(h3.compile_h3_mentions(text, refs),
            'summary: 一名运动员<Picture 1> 在室内篮球场<Picture 2> 完成扣篮。\ndetailed_description: 跟随<Picture 1>，动作参考<Video 1>。')
        project = {'media': [{'id': 'hero', 'name': '樱木花道'}, {'id': 'court', 'name': '球场'}]}
        self.assertEqual([row['id'] for row in h3.prompt_reference_rows(project, {'prompt': text})], ['hero', 'court'])

    def test_actual_reference_order_and_names(self):
        refs = [({'name':'角色'}, '<Picture 2>'), ({'name':'角色 A'}, '<Picture 1>'),
                ({'name':'动作'}, '<Video 1>'), ({'name':'声音'}, '<Audio 2>')]
        self.assertEqual(h3.compile_h3_mentions('@角色 A follows @动作 with @声音. @角色', refs),
                         '<Picture 1> follows <Video 1> with <Audio 2>. <Picture 2>')
        self.assertEqual(h3.compile_h3_mentions('a@角色 @角色ABC @unknown <Picture 1>', refs),
                         'a@角色 @角色ABC @unknown <Picture 1>')
    def test_invalid_reference_is_not_silently_misbound(self):
        with self.assertRaisesRegex(ValueError, 'Ambiguous'):
            h3.compile_h3_mentions('@hero', [({'name':'hero'},'<Picture 1>'),({'name':'hero'},'<Picture 2>')])
        with self.assertRaisesRegex(ValueError, 'not loaded'):
            h3.compile_h3_mentions('@hero', [({'name':'hero'},None)])
    def test_prompt_only_references_do_not_modify_visible_media(self):
        project = {'media':[{'id':'v','name':'motion','kind':'video','video_shots':{'points':[{'description':'@hero'}]}},
                            {'id':'i','name':'hero','kind':'image'}, {'id':'a','name':'voice','kind':'audio'}],
                   'settings':{'prepend_prompt':'@voice'}}
        clip = {'media_ids':['v'],'prompt_media_ids':['i'],'prompt':'@hero'}
        refs = h3.prompt_reference_rows(project,clip)
        self.assertEqual([r['id'] for r in refs], ['i','a'])
        self.assertEqual(clip['media_ids'],['v'])
        clip['use_prepend_prompt']=False
        self.assertEqual([r['id'] for r in h3.prompt_reference_rows(project,clip)], ['i'])
    def test_builtin_skill_preserves_user_structure(self):
        text=h3.h3_prompt_skill({'agent':'MiniMaxH3','skill':'USER STYLE'})
        self.assertIn('do not force a six-section',text)
        self.assertIn('after loading the files',text)
        self.assertTrue(text.endswith('USER STYLE'))
        self.assertEqual(h3.h3_prompt_skill({'agent':'Wan','skill':'USER STYLE'}),'USER STYLE')

if __name__ == '__main__': unittest.main()
