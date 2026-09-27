import importlib.util
from pathlib import Path
import tempfile
import unittest

import cv2
import numpy as np

spec = importlib.util.spec_from_file_location("scene_detection", Path(__file__).resolve().parents[1] / "backend/scene_detection.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SceneDetectionTests(unittest.TestCase):
    def test_detects_cuts_inside_requested_source_range(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = str(Path(temporary) / "cuts.avi")
            writer = cv2.VideoWriter(path, cv2.VideoWriter_fourcc(*"MJPG"), 24, (64, 64))
            self.assertTrue(writer.isOpened())
            for color in [(0, 0, 0), (255, 255, 255), (0, 0, 0)]:
                for _ in range(48):
                    writer.write(np.full((64, 64, 3), color, dtype=np.uint8))
            writer.release()
            times = module.detect_video_scenes(path, 1, 4)
            self.assertEqual(len(times), 3)
            for actual, expected in zip(times, [1, 2, 4]):
                self.assertAlmostEqual(actual, expected, delta=1/24)

    def test_invalid_range(self):
        for start, duration in [(0, 0), (-1, 2), (0, float("nan"))]:
            with self.assertRaises(ValueError):
                module.detect_video_scenes("unused", start, duration)


if __name__ == "__main__":
    unittest.main()
