import ast
import copy
import hashlib
import os
from pathlib import Path
import tempfile
import types
import unittest
import uuid
from unittest.mock import Mock


source = Path(__file__).resolve().parents[1] / 'backend' / 'cap_reference_project.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
scope = {'os': os, 'IMAGE_EXTENSIONS': {'.png'}, 'VIDEO_EXTENSIONS': {'.mp4'}, 'AUDIO_EXTENSIONS': {'.wav'}}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'reference_media_path'], type_ignores=[]), str(source), 'exec'), scope)
scope.update(copy=copy, hashlib=hashlib, uuid=uuid, migrate_project=lambda project: project,
             iter_project_generated_videos=lambda project: [])
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'prepare_reference_merge'], type_ignores=[]), str(source), 'exec'), scope)


class ReferenceProjectTest(unittest.TestCase):
    def test_content_dedup_and_same_name_different_content(self):
        with tempfile.TemporaryDirectory() as directory:
            current, reference = Path(directory) / 'current', Path(directory) / 'reference'
            current.mkdir()
            reference.mkdir()
            (current / 'a.png').write_bytes(b'same')
            (reference / 'renamed.png').write_bytes(b'same')
            (reference / 'a.png').write_bytes(b'different')
            (reference / 'duplicate.png').write_bytes(b'different')
            scope['folder_paths'] = types.SimpleNamespace(get_input_directory=lambda: str(current), get_output_directory=lambda: str(current))
            scope['_import_media_bytes'] = Mock(return_value='imported.png')
            project = {'media': [{'id': name, 'file': name, 'kind': 'image'} for name in ['renamed.png', 'a.png', 'duplicate.png']], 'tracks': []}
            original = copy.deepcopy(project)
            result = scope['prepare_reference_merge'](project, str(reference), [{'id': 'existing', 'kind': 'image', 'file': 'a.png', 'location': 'input'}])
            self.assertEqual(result['media_ids']['renamed.png'], 'existing')
            self.assertEqual(result['media_ids']['a.png'], result['media_ids']['duplicate.png'])
            self.assertNotEqual(result['media_ids']['a.png'], 'existing')
            self.assertEqual(len(result['project']['media']), 1)
            scope['_import_media_bytes'].assert_called_once()
            self.assertEqual(project, original)
            project['media'].append({'id': 'missing', 'file': 'missing.png', 'kind': 'image'})
            scope['_import_media_bytes'].reset_mock()
            with self.assertRaisesRegex(ValueError, 'Source media not found'):
                scope['prepare_reference_merge'](project, str(reference), [])
            scope['_import_media_bytes'].assert_not_called()

    def test_media_containment_and_formats(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'project'
            root.mkdir()
            (root / 'media').mkdir()
            image = root / 'media' / 'image.png'
            image.write_bytes(b'image')
            video = root / 'media' / 'video.mp4'
            video.write_bytes(b'video')
            outside = Path(directory) / 'private.png'
            outside.write_bytes(b'private')
            scope['folder_paths'] = types.SimpleNamespace(get_input_directory=lambda: str(root), get_output_directory=lambda: str(root))
            resolve = scope['reference_media_path']
            self.assertEqual(resolve(str(root), {'file': 'media/image.png', 'kind': 'image'}), str(image))
            self.assertEqual(resolve(str(root), {'file': 'media/video.mp4', 'kind': 'video'}), str(video))
            for name in ['../private.png', str(outside), 'missing.png', 'project.json']:
                self.assertIsNone(resolve(str(root), {'file': name, 'kind': 'image'}))
            self.assertIsNone(resolve(str(root), {'file': 'media/video.mp4', 'kind': 'image'}))


if __name__ == '__main__':
    unittest.main()
