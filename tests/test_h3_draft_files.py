import ast
import json
import re
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace


class DraftFilesTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name).resolve()
        self.scope = dict(Path=Path, json=json, re=re, sys=SimpleNamespace(platform='win32'),
                          folder_paths=SimpleNamespace(get_output_directory=lambda: str(self.root)),
                          DRAFT_ROOT='capricorncd-timeline/h3_drafts')
        backend = Path(__file__).resolve().parents[1] / 'backend'
        for name in ('cap_h3_drafts.py', 'cap_h3_draft_files.py'):
            tree = ast.parse((backend / name).read_text(encoding='utf-8'))
            tree.body = [node for node in tree.body if isinstance(node, ast.FunctionDef)]
            exec(compile(tree, name, 'exec'), self.scope)
        self.version_id = 'a' * 32
        self.directory = self.scope['draft_directory'](self.version_id)
        self.directory.mkdir(parents=True)
        self.video = self.directory / 'preview.mp4'
        self.video.write_bytes(b'preview')
        (self.directory / 'latent.safetensors').write_bytes(b'latent')
        self.manifest = dict(id=self.version_id, schema_version=1, clip_id='clip-1',
                             file=self.video.relative_to(self.root).as_posix(), seed=1)
        self.write_manifest()
        self.moved = []
        self.scope['_win_send_to_recycle_bin'] = self.moved.append

    def write_manifest(self):
        (self.directory / 'version.json').write_text(json.dumps(self.manifest), encoding='utf-8')

    def test_recycle_only_version_files(self):
        self.scope['recycle_version'](self.version_id)
        self.assertEqual(self.moved, [str(self.video), str(self.directory / 'latent.safetensors'), str(self.directory / 'version.json')])

    def test_reject_other_file_before_any_move(self):
        self.manifest['file'] = 'other.mp4'
        self.write_manifest()
        with self.assertRaises(ValueError):
            self.scope['recycle_version'](self.version_id)
        self.assertEqual(self.moved, [])

    def test_no_permanent_delete_fallback(self):
        self.scope['sys'].platform = 'linux'
        with self.assertRaises(ValueError):
            self.scope['recycle_version'](self.version_id)
        self.assertTrue(self.video.exists())
        self.assertEqual(self.moved, [])

    def test_associate_matches_clip_and_requires_restored_files(self):
        associate = self.scope['associated_versions']
        rows = associate(str(self.directory), 'clip-1')
        self.assertEqual(rows[0]['id'], self.version_id)
        self.assertEqual(associate(str(self.directory), 'other-clip'), [])
        self.assertEqual(associate(self.scope['DRAFT_ROOT'], 'clip-1'), rows)
        (self.directory / 'latent.safetensors').unlink()
        with self.assertRaises(ValueError):
            associate(str(self.directory), 'clip-1')
        with self.assertRaises(ValueError):
            associate(str(self.root.parent), 'clip-1')

    def test_partial_recycle_can_be_retried(self):
        (self.directory / 'latent.safetensors').unlink()
        self.scope['recycle_version'](self.version_id)
        self.assertEqual(self.moved, [str(self.video), str(self.directory / 'version.json')])


if __name__ == '__main__':
    unittest.main()
