"""Compile a director Clip's editable reference tracks into model materials."""
import copy
import uuid

from .cap_compose_timeline_export import compose_to_output


def compose_reference_timeline(project, clip, resolve_media):
    timeline = clip.get("reference_timeline")
    if not timeline:
        return []
    catalog = {row["id"]: row for row in project.get("media", [])}
    videos, audios = [], []
    for kind, rows in (("video", videos), ("audio", audios)):
        for saved in timeline.get("videos" if kind == "video" else "audios", []):
            if saved.get("enabled") is False:
                continue
            media = catalog.get(saved.get("media_id"))
            if not media or media.get("kind") != kind:
                raise ValueError("Reference timeline media is missing from the project catalog")
            row = copy.deepcopy(saved)
            row["file"] = resolve_media(media["file"])
            row["location"] = "input"
            rows.append(row)
    groups = [(videos, audios)]
    if timeline.get("per_track") is True:
        video_tracks = {}
        for video in videos:
            video_tracks.setdefault(video.get("track_id") or video["id"], []).append(video)
        groups = [(track, []) for track in video_tracks.values()]
        tracks = {}
        for audio in audios:
            tracks.setdefault(audio.get("track_id") or audio["id"], []).append(audio)
        groups.extend(([], track) for track in tracks.values())
    result = []
    duration_ms = int(clip["duration_ms"])
    for index, (video_rows, audio_rows) in enumerate(groups):
        if not video_rows and not any(not row.get("muted") for row in audio_rows):
            continue
        media = [dict(id=row["media_id"], kind="video", file=row["file"]) for row in video_rows]
        subproject = dict(name=project.get("name", "Reference"), settings=project["settings"], media=media,
            tracks=[dict(type="director", clips=[dict(start_ms=0, duration_ms=duration_ms,
                generated_videos=video_rows, gen_edit_audios=audio_rows)])])
        has_video = bool(video_rows)
        composed = compose_to_output(subproject, filename_prefix="cap_reference_timelines/",
            filename=uuid.uuid4().hex, export_video=has_video, export_audio=not has_video,
            output_fps=project["settings"].get("fps", 24),
            export_range=dict(start_frame=0, end_frame=max(1, round(duration_ms * project["settings"].get("fps", 24) / 1000))))
        kind = "video" if has_video else "audio"
        row = dict(id=f"reference_{clip['id']}_{index}", kind=kind, file=composed["output_path"],
            name="Reference timeline", prompt="", media_type="other", location="output")
        if kind == "video":
            row["video_trim"] = dict(file=composed["output_path"], start=0, duration=duration_ms / 1000, rate=1)
            row["reference_timeline"] = True
        result.append(row)
    return result
