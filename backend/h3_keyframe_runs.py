"""Expand selected timeline intervals into bounded H3 continuation passes."""
import copy
import math


def expand_keyframe_runs(data):
    requests = {str(run["clip_id"]): run for run in (data.get("h3_generation") or {}).get("keyframe_runs", [])}
    materials = {str(row["id"]): row for row in data.get("materials", [])}
    expanded = []
    for clip in data["clips"]:
        parent = str(clip.get("source_clip_id") or clip["id"])
        fps = float(data["fps"])
        start_ms = clip.get("preview_start_ms", clip["start_ms"])
        end_ms = clip.get("preview_end_ms", clip["end_ms"])
        duration_frames = round((end_ms - start_ms) * fps / 1000)
        request = requests.get(parent)
        if request is None and (clip.get("clip_role") != "video_ref" or duration_frames <= 10 * fps):
            expanded.append(clip)
            continue
        request = request or {"fps": fps, "clip_start_ms": start_ms,
                              "intervals": [{"start_frame": 0, "end_frame": duration_frames, "prompt": ""}]}
        if abs(float(request["fps"]) - fps) > 1e-6:
            raise ValueError("Keyframe run frame rate changed. Confirm the intervals again.")
        origin = int(request["clip_start_ms"])
        intervals = request["intervals"]
        previous_end = -1
        for interval_index, interval in enumerate(intervals):
            interval_number = int(interval.get("number", interval_index + 1))
            first, last = int(interval["start_frame"]), int(interval["end_frame"])
            if first < 0 or last <= first or first < previous_end:
                raise ValueError("Keyframe intervals must be ordered, non-overlapping frame ranges.")
            previous_end = last
            local_start = origin + round(first * 1000 / fps)
            local_end = origin + round(last * 1000 / fps)
            if local_start < start_ms - 1 or local_end > end_ms + 1:
                raise ValueError("Keyframe interval is outside the Clip. Confirm the intervals again.")
            count = math.ceil((last - first) / max(1, math.floor(10 * fps)))
            keyframe_prompt = interval.get("prompt") or ""
            prompt = keyframe_prompt if keyframe_prompt.strip() else clip.get("prompt", "")
            previous_id = None
            carry = 0
            for part in range(count):
                begin = first + round((last - first) * part / count)
                end = first + round((last - first) * (part + 1) / count)
                row = copy.deepcopy(clip)
                cid = f"{parent}__kf{interval_number}_{part + 1}"
                row.update(id=cid, source_clip_id=cid, start_ms=origin + round(begin * 1000 / fps),
                           end_ms=origin + round(end * 1000 / fps), h3_drafts=copy.deepcopy(clip.get("h3_drafts", [])), save_latent=part + 1 < count,
                           h3_motion_context_length=22 if part else 0)
                row["preview_start_ms"], row["preview_end_ms"] = row["start_ms"], row["end_ms"]
                row.pop("playback_spans", None)
                row.pop("previous_output_video", None)
                context = 22 if part else 0
                frames = end - begin
                raw = max(5, frames + context - carry)
                raw += (5 - raw) % 17
                row["h3_timing"] = dict(version=2, fps=fps, context_frames=context, context_carry_frames=carry, raw_frames=raw,
                    head_frames=0, tail_frames=raw - context + carry - frames, play_frames=frames,
                    save_latent=row["save_latent"], previous_source_clip_id=previous_id)
                stem, extension = clip["output_video"].rsplit(".", 1)
                row["output_video"] = f"{stem}__kf{interval_number}_{part + 1}.{extension}"
                row["prompt"] = prompt
                row["auto_prompt"] = False
                row.pop("h3_generated_prompt", None)
                row["keyframe_segment"] = dict(clip_id=parent, start_frame=begin, end_frame=end, fps=fps,
                    interval=interval_number, part=part + 1, parts=count, prompt=prompt)
                offset_start = row["start_ms"] - start_ms
                offset_end = row["end_ms"] - start_ms
                row["audios"] = []
                for audio in clip.get("audios", []):
                    source_start = int(audio.get("source_start_ms", 0))
                    audio_start = int(audio.get("clip_offset_ms", 0))
                    audio_rate = float(audio.get("playback_rate", 1))
                    audio_end = audio_start + round((int(audio["source_end_ms"]) - source_start) / audio_rate)
                    left, right = max(offset_start, audio_start), min(offset_end, audio_end)
                    if right > left:
                        sliced = dict(audio, source_start_ms=source_start + round((left - audio_start) * audio_rate),
                                      source_end_ms=source_start + round((right - audio_start) * audio_rate), clip_offset_ms=left - offset_start,
                                      host_local_start_ms=int(audio.get("host_local_start_ms", 0)) + left - audio_start)
                        row["audios"].append(sliced)
                reference = request.get("reference")
                for ref in row.get("images", []):
                    material = materials.get(str(ref.get("id")))
                    if material and (material.get("reference_timeline") or material.get("kind") == "video") and (
                            not reference or str(ref.get("id")) != str(reference["id"])):
                        sliced = copy.deepcopy(material)
                        sliced["id"] = f"{material['id']}__{cid}"
                        trim = material.get("video_trim") or {}
                        rate = float(trim.get("rate", 1))
                        sliced["video_trim"] = dict(trim, file=trim.get("file") or material["file"],
                            start=float(trim.get("start", 0)) + begin / fps * rate,
                            duration=frames / fps * rate, rate=rate)
                        data["materials"].append(sliced)
                        ref["id"] = sliced["id"]
                if reference:
                    material = copy.deepcopy(materials[str(reference["id"])])
                    source = material.get("video_trim") or {}
                    material_id = f"{material['id']}__{cid}"
                    rate = float(reference["rate"])
                    material.update(id=material_id, video_trim=dict(file=source.get("file") or material["file"],
                        start=float(reference["start"]) + begin / fps * rate, duration=frames / fps * rate, rate=rate))
                    data["materials"].append(material)
                    row["images"] = [dict(ref, id=material_id) if str(ref.get("id")) == str(reference["id"]) else ref
                                     for ref in row.get("images", [])]
                expanded.append(row)
                previous_id = cid
                carry = row["h3_timing"]["tail_frames"]
    if not expanded:
        raise ValueError("Select at least one keyframe interval to run.")
    data["clips"] = expanded
    return any(row.get("keyframe_segment") for row in expanded)
