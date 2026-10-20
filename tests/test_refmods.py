import ast
from pathlib import Path
from types import SimpleNamespace, MethodType
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'backend/cap_refmods.py'


class RefModTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        calls = self.calls

        class Loader:
            @classmethod
            def IS_CHANGED(cls, **kwargs):
                return kwargs['mod_1'], cls.revision

            revision = 1
            def load(self, **kwargs):
                calls.append(kwargs)
                if kwargs['strength_1'] == 0:
                    return [], ''
                kind = 'image' if 'portrait' in kwargs['mod_1'] else 'video'
                return [(SimpleNamespace(kind=kind), kwargs['strength_1'])], ''

        class Encoder:
            @staticmethod
            def prepare_references(mods, vae):
                return [{'type':mod.kind} for mod, _ in mods], [{'kind':mod.kind, 'refmod':True} for mod, _ in mods]

        scope = {'nodes':SimpleNamespace(NODE_CLASS_MAPPINGS={
            'MiniMaxH3RefModsLoader':Loader, 'MiniMaxH3RefModTextEncode':Encoder})}
        tree = ast.parse(SOURCE.read_text(encoding='utf-8'))
        tree.body = [node for node in tree.body if not isinstance(node, ast.Import)]
        exec(compile(tree, str(SOURCE), 'exec'), scope)
        self.load, self.adapter = scope['load_refmods'], scope['RefModPromptClip']
        self.file_state, self.loader = scope['refmod_file_state'], Loader

    def test_replaced_refmod_changes_node_cache_state(self):
        rows = [{'path':'打斗/回旋踢'}, {'path':'disabled','enabled':False}]
        before = self.file_state(rows)
        self.loader.revision = 2
        self.assertNotEqual(before, self.file_state(rows))
        self.assertEqual(len(before), 1)

    def test_native_numbering_and_multiple_directories(self):
        mods, refs = self.load([{'path':'短剧/portrait'}, {'path':'打斗/回旋踢','strength':.7}],
                               {'image':2,'video':1,'audio':1})
        self.assertEqual([row[1] for row in refs], ['<Picture 3>', '<Video 2>'])
        self.assertEqual(self.calls[1]['strength_1'], .7)
        self.assertEqual(len(mods), 2)

    def test_disabled_or_zero_references_do_not_load(self):
        mods, refs = self.load([{'path':'disabled','enabled':False}, {'path':'zero','strength':0}],
                               {'image':0,'video':0,'audio':0})
        self.assertEqual(mods, [])
        self.assertEqual(len(self.calls), 1)
        self.assertEqual([row[1] for row in refs], ['disabled','zero'])

    def test_qwen_and_dit_share_order_without_mutating_other_conditions(self):
        captured = []
        original = [['embedding', {'minimax_refs':[{'kind':'image'}], 'minimax_keyframes':['anchor']}]]
        clip = SimpleNamespace(tokenize=lambda text, **kwargs: captured.append((text, kwargs)),
                               encode_from_tokens_scheduled=lambda _:original)
        adapter = self.adapter(clip, [(SimpleNamespace(kind='video'),1)], 'vae')
        adapter.tokenize('action <Video 1>', minimax_ref_items=[{'type':'image','data':'normal'}])
        self.assertEqual([item['type'] for item in captured[0][1]['minimax_ref_items']], ['image','video'])
        out = adapter.attach(adapter.encode_from_tokens_scheduled(None))
        self.assertEqual([block['kind'] for block in out[0][1]['minimax_refs']], ['image','video'])
        self.assertEqual(len(original[0][1]['minimax_refs']), 1)
        self.assertEqual(out[0][1]['minimax_keyframes'], ['anchor'])

    def test_timeline_node_presents_and_attaches_saved_reference(self):
        captured = []
        original_clip = SimpleNamespace(
            tokenize=lambda prompt, **kwargs: captured.append((prompt, kwargs)),
            encode_from_tokens_scheduled=lambda _: [['embedding', {}]])

        class NativeReference:
            @staticmethod
            def execute(clip, prompt, **kwargs):
                items = [{'type':'image','data':value} for value in (kwargs['ref_images'] or {}).values()]
                clip.tokenize(prompt, minimax_ref_items=items)
                positive = clip.encode_from_tokens_scheduled(None)
                positive[0][1]['minimax_refs'] = [{'kind':'image'}]
                return SimpleNamespace(args=(positive, {'samples':'AV'}))

        row = {'start_ms':0,'end_ms':1000,'prompt':'Use @normal with @打斗/回旋踢',
               'images':[{'id':'normal'}], 'refmods':[{'path':'打斗/回旋踢'}]}
        material = {'name':'normal','kind':'image'}
        parser = SimpleNamespace(_ref_id=lambda ref:ref['id'], _load_image=lambda _: 'image',
            _compose_prompt=lambda *args, **kwargs:row['prompt'], _uses_master_audio=lambda *args:False,
            _clip_audio_from_audios=lambda *args, **kwargs:None)
        scope = {'torch':SimpleNamespace(zeros=lambda *args:'blank'), 'H3_FPS':24,
                 'align_frame_count':lambda n:n, '_snap_h3_grid':lambda _:0,
                 '_h3_audio_clip':lambda clip, duration:clip,
                 'MAX_REF_IMAGES':9, 'MAX_REF_VIDEOS':3, 'MAX_REF_AUDIOS':3,
                 '_kind_of':lambda row, path:row['kind'],
                 'os':SimpleNamespace(path=SimpleNamespace(isfile=lambda _:True)),
                 'refmod_reference_rows':lambda refs, prompt:refs,
                 'load_refmods':self.load, 'RefModPromptClip':self.adapter,
                 'compile_h3_mentions':lambda text, refs: text.replace('@normal',refs[0][1]).replace('@打斗/回旋踢',refs[1][1]),
                 'MiniMaxH3ReferenceToVideo':NativeReference}
        tree = ast.parse(SOURCE.with_name('cap_minimax_h3.py').read_text(encoding='utf-8'))
        cls = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == 'CAP_MiniMaxH3ReferenceToVideo')
        execute = next(node for node in cls.body if isinstance(node, ast.FunctionDef) and node.name == 'execute')
        exec(compile(ast.Module(body=[execute], type_ignores=[]), str(SOURCE), 'exec'), scope)
        node = SimpleNamespace(_parse_clip=lambda *args:({'fps':24},row,{},parser),
            _visual_refs=lambda *args:row['images'], _material_for_ref=lambda *args:('normal.png', material),
            _stack_frames=lambda *args:'preview')
        node.execute = MethodType(scope['execute'], node)
        result = node.execute(original_clip, 'vae', 'audio_vae', 768, 768, 'match', '{}', 0)
        self.assertEqual(captured[0][0], 'Use <Picture 1> with <Video 1>')
        self.assertEqual([item['type'] for item in captured[0][1]['minimax_ref_items']], ['image','video'])
        self.assertEqual([block['kind'] for block in result[0][0][1]['minimax_refs']], ['image','video'])


if __name__ == '__main__':
    unittest.main()
