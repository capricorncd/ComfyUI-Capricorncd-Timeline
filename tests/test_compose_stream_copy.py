import importlib.util
from pathlib import Path
import subprocess
import tempfile
import unittest

spec = importlib.util.spec_from_file_location(
    "compose_stream_copy", (Path(__file__).resolve().parents[1] / "backend") / "compose_stream_copy.py")
copy = importlib.util.module_from_spec(spec)
spec.loader.exec_module(copy)


def run(cmd):
    subprocess.run(cmd, check=True, capture_output=True)


class StreamCopyTests(unittest.TestCase):
    def test_copy_and_exact_cut(self):
        with tempfile.TemporaryDirectory() as directory:
            path = str(Path(directory) / "source.mp4")
            out = str(Path(directory) / "out.mp4")
            run(["ffmpeg", "-y", "-f", "lavfi", "-i", "testsrc2=s=160x96:r=24:d=3",
                 "-c:v", "libx264", "-g", "24", "-bf", "0", "-sc_threshold", "0", path])
            seg = dict(path=path, kind="video", layer="director", start_sec=0,
                       end_sec=1, source_in_sec=1, duration_sec=1, muted=True, volume=1)
            plan = dict(width=160, height=96, fps=24, total_sec=2,
                        video_segs=[seg, dict(seg, start_sec=1, end_sec=2)],
                        audio_segs=[], subtitle_segs=[])
            rows, reason = copy.stream_copy_plan(plan, False)
            self.assertEqual(reason, "")
            self.assertEqual(len(rows), 2)
            copy.copy_segments(rows, out, run)
            data = copy._probe(out)
            video = data["streams"][0]
            self.assertEqual(int(video["nb_frames"]), 48)
            self.assertAlmostEqual(float(video["duration"]), 2, places=3)
            def hashes(file, filters):
                result = subprocess.run(["ffmpeg", "-v", "error", "-i", file,
                    *filters, "-f", "framemd5", "-"], check=True, capture_output=True, text=True)
                return [line.split(",")[-1].strip() for line in result.stdout.splitlines()
                        if line and not line.startswith("#")]
            expected = hashes(path, ["-vf", "trim=start=1:end=2,setpts=PTS-STARTPTS"])
            self.assertEqual(hashes(out, []), expected + expected)
            seg["source_in_sec"] = 0.5
            self.assertEqual(copy.stream_copy_plan(plan, False)[1], "cut")
            self.assertEqual(copy.stream_copy_plan(plan, True)[1], "overlays")
            plan["audio_segs"] = [{}]
            self.assertEqual(copy.stream_copy_plan(plan, False)[1], "audio_mix")


if __name__ == "__main__":
    unittest.main()
