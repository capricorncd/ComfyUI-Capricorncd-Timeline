"""Frame selection for visual prompt inspection, independent of H3 conditioning."""
import heapq
import re

import av
import numpy as np

import comfy.model_management


def select_prompt_frames(path, start, duration, mode, frame_numbers, count):
    requested = set()
    if mode == "manual":
        parts = re.split(r"[,，\s]+", frame_numbers.strip())
        if not parts or any(not part.isdecimal() or int(part) < 1 for part in parts):
            raise ValueError("Enter positive frame numbers, e.g. 1, 25, 73 (first trimmed frame = 1).")
        requested = {int(part) for part in parts}
    elif mode != "scene":
        raise ValueError(f"Unknown prompt frame selection mode: {mode}")

    selected, changes = [], []
    previous = None
    last_change = -1.0
    index = 0
    with av.open(path) as container:
        stream = container.streams.video[0]
        origin = float((stream.start_time or 0) * stream.time_base)
        container.seek(int((start + origin) / stream.time_base), stream=stream)
        for frame in container.decode(stream):
            comfy.model_management.throw_exception_if_processing_interrupted()
            time = float(frame.pts * stream.time_base) - origin
            if time < start:
                continue
            if duration > 0 and time >= start + duration:
                break
            index += 1
            if mode == "manual":
                if index in requested:
                    selected.append((index, time - start, frame.to_image()))
                if index >= max(requested):
                    break
                continue

            # Small RGB histograms reduce sensitivity to motion within the same shot.
            small = frame.reformat(width=64, height=64, format="rgb24").to_ndarray()
            histogram = np.concatenate([np.bincount((small[:, :, channel] // 16).ravel(), minlength=16)
                                        for channel in range(3)]) / (64 * 64 * 3)
            if previous is None:
                selected.append((index, time - start, frame.to_image()))
            else:
                score = float(np.abs(histogram - previous).sum() / 2)
                if score >= 0.35 and time - last_change >= 0.5 and count > 1:
                    last_change = time
                    if len(changes) < count - 1 or score > changes[0][0]:
                        item = (score, index, time - start, frame.to_image())
                        if len(changes) < count - 1:
                            heapq.heappush(changes, item)
                        else:
                            heapq.heapreplace(changes, item)
            previous = histogram
    if mode == "manual":
        missing = requested - {item[0] for item in selected}
        if missing:
            raise ValueError(f"Requested frames outside trimmed video ({index} frames): {sorted(missing)}")
    selected.extend((index, time, image) for _, index, time, image in changes)
    return sorted(selected, key=lambda item: item[0])
