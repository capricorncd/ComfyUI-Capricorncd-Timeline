"""On-demand scene boundaries for the timeline's existing video shot markers."""
import math
import json
import subprocess
import sys
import tempfile


def detect_video_scenes(path, start, duration, cancel=None):
    if cancel is not None:
        if cancel.is_set():
            raise InterruptedError('Cancelled')
        with tempfile.TemporaryFile() as output, tempfile.TemporaryFile() as errors:
            process = subprocess.Popen([sys.executable, '-X', 'utf8', __file__, str(path), str(start), str(duration)],
                                       stdout=output, stderr=errors,
                                       creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            try:
                while process.poll() is None:
                    if cancel.wait(.1):
                        raise InterruptedError('Cancelled')
                if cancel.is_set():
                    raise InterruptedError('Cancelled')
                if process.returncode:
                    errors.seek(0)
                    raise RuntimeError(errors.read().decode('utf-8', 'replace')[-2000:])
                output.seek(0)
                return json.loads(output.read().decode('utf-8'))
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)
    try:
        from scenedetect import detect, VideoOpenFailure
        from scenedetect.detectors import AdaptiveDetector
    except ImportError as exc:
        raise RuntimeError("Install PySceneDetect in the ComfyUI Python environment: python -m pip install scenedetect") from exc
    start, duration = float(start), float(duration)
    if not math.isfinite(start) or not math.isfinite(duration) or start < 0 or duration <= 0:
        raise ValueError("Invalid video time range.")
    try:
        scenes = detect(path, AdaptiveDetector(), start_time=start, end_time=start + duration,
                        start_in_scene=True, show_progress=False)
    except VideoOpenFailure as exc:
        raise ValueError("Could not open the reference video for scene detection.") from exc
    return [scene_start.seconds for scene_start, _ in scenes]


if __name__ == '__main__':
    print(json.dumps(detect_video_scenes(sys.argv[1], float(sys.argv[2]), float(sys.argv[3]))))
