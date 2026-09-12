import ast
import hashlib
import json
from pathlib import Path
import re
import unittest


source = Path(__file__).resolve().parents[1] / 'backend/cap_timeline_project_io.py'
tree = ast.parse(source.read_text(encoding='utf-8-sig'))
scope = dict(json=json, re=re, hashlib=hashlib, SCHEMA_VERSION=4,
             KIND_SUBDIR={'image':'images', 'video':'videos', 'audio':'audios'})
exec(compile(ast.fix_missing_locations(ast.Module(body=[ast.ImportFrom(module='__future__', names=[ast.alias(name='annotations')], level=0)]
                       + [n for n in tree.body if isinstance(n, ast.FunctionDef)], type_ignores=[])), str(source), 'exec'), scope)
migrate = scope['migrate_project']


class PromptImportTest(unittest.TestCase):
    def project(self):
        def prompt(sound):
            return ('  # keep comment\r\nsubject_definitions:\r\n角色\r\nsummary:\r\n总结\r\n'
                    'retention_analysis:\r\n原样\r\ndetailed_description:\r\n动作\r\n'
                    f'overall_soundscape:\r\n{sound}\r\nnon_diegetic_music:\r\nn/a.\r\ncustom_section:\r\n日本語  \r\n')
        return {'schema_version':4, 'media':[], 'settings':{
            'prepend_prompt':'  风格\n# comment\n', 'append_prompt':'non_diegetic_music:\nn/a.',
            'negative_prompt':'stale alias'}, 'tracks':[{'type':'director','clips':[
                {'id':'a','prompt':prompt('雨声')}, {'id':'b','prompt':prompt('鸟鸣')}]}]}

    def test_repeated_import_and_export_preserve_text(self):
        project = self.project()
        before = json.loads(json.dumps(project))
        result = project
        for _ in range(3):
            result = migrate(json.loads(json.dumps(result)))
            self.assertEqual([c['prompt'] for c in result['tracks'][0]['clips']],
                             [c['prompt'] for c in project['tracks'][0]['clips']])
            for key in ('prepend_prompt','append_prompt'):
                self.assertEqual(result['settings'][key],project['settings'][key])
        self.assertEqual(project,before)

    def test_explicit_blank_and_stale_fields(self):
        project = self.project()
        project['settings']['append_prompt'] = ''
        project['tracks'][0]['clips'][0]['ai_prompt'] = 'stale'
        project['tracks'][0]['clips'][0]['detailed_description'] = 'stale'
        result = migrate(project)
        self.assertEqual(result['settings']['append_prompt'],'')
        self.assertEqual(result['tracks'][0]['clips'][0]['prompt'],project['tracks'][0]['clips'][0]['prompt'])

    def test_legacy_fields_stay_in_clip(self):
        project = self.project()
        project['schema_version'] = 2
        project['tracks'][0]['clips'][0] = {'id':'a','ai_prompt':'动作\noverall_soundscape:\n雨声'}
        result = migrate(project)
        self.assertEqual(result['tracks'][0]['clips'][0]['prompt'],'动作\noverall_soundscape:\n雨声')
        self.assertEqual(result['settings']['append_prompt'],project['settings']['append_prompt'])


if __name__ == '__main__':
    unittest.main()
