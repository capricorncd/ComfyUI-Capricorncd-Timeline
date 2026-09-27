import importlib.util
from pathlib import Path
import unittest

path = Path(__file__).parents[1] / 'backend/h3_prompt_mentions.py'
spec = importlib.util.spec_from_file_location('h3_prompt_mentions', path)
h3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h3)

class MentionTests(unittest.TestCase):
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
