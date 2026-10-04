import ast
import heapq
from pathlib import Path
import re
import tempfile
from types import SimpleNamespace
import unittest

import av
import numpy as np


class PromptFrameTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        source = Path(__file__).resolve().parents[1] / 'backend/h3_prompt_frames.py'
        tree = ast.parse(source.read_text(encoding='utf-8'))
        scope = dict(av=av, np=np, re=re, heapq=heapq,
                     comfy=SimpleNamespace(model_management=SimpleNamespace(
                         throw_exception_if_processing_interrupted=lambda: None)))
        exec(compile(ast.Module(body=[n for n in tree.body if isinstance(n, ast.FunctionDef)],
                                type_ignores=[]), str(source), 'exec'), scope)
        cls.select = staticmethod(scope['select_prompt_frames'])
        cls.temp = tempfile.TemporaryDirectory()
        cls.path = str(Path(cls.temp.name) / 'cuts.mkv')
        with av.open(cls.path, 'w') as container:
            stream = container.add_stream('ffv1', rate=12)
            stream.width = stream.height = 32
            stream.pix_fmt = 'bgr0'
            for i in range(36):
                pixels = np.zeros((32, 32, 3), dtype=np.uint8)
                pixels[:, :, i // 12] = 255
                for packet in stream.encode(av.VideoFrame.from_ndarray(pixels, format='rgb24')):
                    container.mux(packet)
            for packet in stream.encode():
                container.mux(packet)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def test_manual_exact_trimmed_frames_sorted_and_deduplicated(self):
        frames = self.select(self.path, 0.5, 1, 'manual', '7, 1, 7', 1)
        self.assertEqual([f[0] for f in frames], [1, 7])
        self.assertEqual([f[2].getpixel((0, 0)) for f in frames], [(255, 0, 0), (0, 255, 0)])
        self.assertAlmostEqual(frames[1][1], 0.5, places=2)

    def test_invalid_and_out_of_range(self):
        for numbers in ['', '0', '-1', '1.5', 'abc', '13']:
            with self.subTest(numbers=numbers), self.assertRaises(ValueError):
                self.select(self.path, 0.5, 1, 'manual', numbers, 8)

    def test_scene_changes_and_budget(self):
        frames = self.select(self.path, 0, 0, 'scene', '', 8)
        self.assertEqual([f[0] for f in frames], [1, 13, 25])
        self.assertEqual(len(self.select(self.path, 0, 0, 'scene', '', 2)), 2)
        self.assertEqual(len(self.select(self.path, 0, 0, 'scene', '', 1)), 1)

    def test_static_trim(self):
        frames = self.select(self.path, 1, 0.5, 'scene', '', 8)
        self.assertEqual(len(frames), 1)
        self.assertEqual(frames[0][2].getpixel((0, 0)), (0, 255, 0))


if __name__ == '__main__':
    unittest.main()
