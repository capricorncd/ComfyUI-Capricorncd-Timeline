import ast
import hashlib
import json
import os
import tempfile
import unittest
from datetime import datetime
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
tree = ast.parse((ROOT / 'backend/cap_timeline_project_io.py').read_text(encoding='utf-8'))
function = next(n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == 'ensure_project_identity')
scope = dict(hashlib=hashlib, json=json, os=os, datetime=datetime)
exec(compile(ast.Module(body=[function], type_ignores=[]), '<identity>', 'exec'), scope)
ensure = scope['ensure_project_identity']

class IdentityTests(unittest.TestCase):
    def test_file_creation_not_modification_time(self):
        with tempfile.NamedTemporaryFile() as file:
            os.utime(file.name, (946684800, 946684800))
            project = ensure({'name': 'old'}, file.name)
            self.assertRegex(project['id'], r'^\d{8}-[0-9a-f]{8}$')
            if os.name == 'nt':
                self.assertEqual(project['created_at_source'], 'file_creation')
                self.assertTrue(project['id'].startswith(datetime.fromtimestamp(os.stat(file.name).st_ctime).strftime('%Y%m%d')))
                self.assertFalse(project['created_at'].startswith('2000'))
            identity = project['id']
            created = project['created_at']
            project['name'] = 'renamed'
            project['tracks'] = [{'id': 'new-track'}]
            ensure(project, file.name)
            self.assertEqual((project['id'], project['created_at']), (identity, created))

    def test_existing_creation_time_and_unknown_source(self):
        project = ensure({'created_at': '2024-01-02T12:00:00+09:00'})
        self.assertTrue(project['id'].startswith('20240102-'))
        unknown = ensure({'name': 'imported'})
        self.assertEqual(unknown['created_at_source'], 'first_seen')
        self.assertNotEqual(ensure({'name': 'new'})['id'], unknown['id'])

if __name__ == '__main__':
    unittest.main()
