import ast
import os
from pathlib import Path
import tempfile
import types
import unittest


source = Path(__file__).resolve().parents[1] / 'backend' / 'cap_reference_project.py'
tree = ast.parse(source.read_text(encoding='utf-8'))
scope = {'os': os, 'IMAGE_EXTENSIONS': {'.png'}, 'VIDEO_EXTENSIONS': {'.mp4'}, 'AUDIO_EXTENSIONS': {'.wav'}}
exec(compile(ast.Module(body=[node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == 'reference_media_path'], type_ignores=[]), str(source), 'exec'), scope)


class ReferenceProjectTest(unittest.TestCase):
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
