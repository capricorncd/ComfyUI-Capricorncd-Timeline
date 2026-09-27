"""On-demand scene boundaries for the timeline's existing video shot markers."""
import math


def detect_video_scenes(path, start, duration):
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
