import asyncio
import copy
import hashlib
import json
import os
import subprocess
import sys
import uuid

from aiohttp import web
import folder_paths

from .timecode import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS
from .cap_timeline_project_io import migrate_project, iter_project_generated_videos, _import_media_bytes, _import_generated_bytes


def pick_reference_project():
    if sys.platform == "win32":
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-STA", "-ExecutionPolicy", "Bypass", "-File",
             os.path.join(os.path.dirname(__file__), "pick_reference_project.ps1")],
            capture_output=True, creationflags=subprocess.CREATE_NO_WINDOW, check=True,
        )
        return result.stdout.decode("utf-8-sig").strip()
    # Tk is optional on non-Windows installations; report its absence to the caller.
    import tkinter
    from tkinter import filedialog
    root = tkinter.Tk()
    root.withdraw()
    try:
        return filedialog.askopenfilename(title="project.json", filetypes=[("project.json", "project.json")])
    finally:
        root.destroy()


def reference_media_path(directory, row):
    name = str(row.get("file") or "")
    extensions = {"image": IMAGE_EXTENSIONS, "video": VIDEO_EXTENSIONS, "audio": AUDIO_EXTENSIONS}
    if os.path.splitext(name)[1].lower() not in extensions.get(row.get("kind"), ()):
        return None
    roots = [directory]
    if row.get("location") == "input":
        roots.append(folder_paths.get_input_directory())
    elif row.get("location") == "output":
        roots.append(folder_paths.get_output_directory())
    for root in roots:
        root = os.path.realpath(root)
        path = os.path.realpath(os.path.join(root, name))
        try:
            contained = os.path.commonpath([root, path]) == root
        except ValueError:
            contained = False
        if contained and os.path.isfile(path):
            return path
    return None


def prepare_reference_merge(project, directory, current_media):
    project = migrate_project(copy.deepcopy(project))
    known, media_ids, imported = {}, {}, []

    def identity(path, kind):
        with open(path, "rb") as stream:
            return kind, hashlib.file_digest(stream, "sha256").hexdigest()

    for row in current_media:
        path = reference_media_path(folder_paths.get_input_directory(), row)
        if path:
            known[identity(path, row["kind"])] = row["id"]
    resolved = []
    for row in project.get("media", []):
        path = reference_media_path(directory, row)
        if not path:
            raise ValueError(f"Source media not found: {row.get('file', '')}")
        resolved.append((row, path))
    generated = {}
    for name in iter_project_generated_videos(project):
        path = reference_media_path(directory, {"kind": "video", "file": name, "location": "output"})
        if not path:
            raise ValueError(f"Generated video not found: {name}")
        generated[name] = path
    for row, path in resolved:
        key = identity(path, row["kind"])
        if key not in known:
            with open(path, "rb") as stream:
                file = _import_media_bytes(row["kind"], os.path.basename(path), stream.read())
            known[key] = "md_" + uuid.uuid4().hex
            imported.append({**row, "id": known[key], "file": file, "location": "input"})
        media_ids[row["id"]] = known[key]
    for name, path in generated.items():
        output_root = os.path.realpath(folder_paths.get_output_directory())
        if os.path.splitdrive(path)[0] == os.path.splitdrive(output_root)[0] and os.path.commonpath([output_root, path]) == output_root:
            generated[name] = os.path.relpath(path, output_root).replace(os.sep, "/")
            continue
        with open(path, "rb") as stream:
            generated[name] = _import_generated_bytes(os.path.basename(path), stream.read())
    for track in project["tracks"]:
        for clip in track.get("clips", []):
            for video in clip.get("generated_videos", []):
                if video.get("file") in generated:
                    video["file"] = generated[video["file"]]
    project["media"] = imported
    return {"project": project, "media_ids": media_ids}


def register_reference_project_routes(routes):
    projects = {}
    documents = {}
    picker_lock = asyncio.Lock()

    @routes.post("/audio_keyframe_timeline/reference_project")
    async def load(request):
        if request.remote not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"} or request.content_type != "application/json":
            return web.json_response({"error": "Local JSON requests only"}, status=403)
        if picker_lock.locked():
            return web.json_response({"error": "Project picker is already open"}, status=409)
        try:
            async with picker_lock:
                path = await asyncio.to_thread(pick_reference_project)
            if not path:
                return web.json_response({"cancelled": True})
            if os.path.basename(path).lower() != "project.json":
                raise ValueError("Select project.json")
            with open(path, encoding="utf-8-sig") as stream:
                project = json.load(stream)
            if not isinstance(project, dict) or not isinstance(project.get("tracks"), list):
                raise ValueError("Invalid project.json")
            if any(not isinstance(track, dict) or not isinstance(track.get("clips", []), list)
                   or any(not isinstance(clip, dict) for clip in track.get("clips", [])) for track in project["tracks"]):
                raise ValueError("Invalid project tracks")
            token = uuid.uuid4().hex
            media = project.get("media", project.get("resources", []))
            if not isinstance(media, list) or any(not isinstance(row, dict) for row in media) or not isinstance(project.get("settings", {}), dict):
                raise ValueError("Invalid project media or settings")
            files = {}
            for index, row in enumerate(media):
                resolved = reference_media_path(os.path.dirname(path), row)
                if resolved:
                    files[str(index)] = resolved
            projects[token] = files
            documents[token] = (project, os.path.dirname(path))
            while len(projects) > 32:
                oldest = next(iter(projects))
                del projects[oldest]
                del documents[oldest]
            return web.json_response({"project": project, "token": token, "available": list(files)})
        except (OSError, ValueError, subprocess.SubprocessError, ImportError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.post("/audio_keyframe_timeline/reference_project_merge")
    async def merge(request):
        if request.remote not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"} or request.content_type != "application/json":
            return web.json_response({"error": "Local JSON requests only"}, status=403)
        try:
            data = await request.json()
            document = documents.get(data.get("token"))
            if not document:
                raise ValueError("Reference project expired. Load it again.")
            current_media = data.get("media", [])
            if not isinstance(current_media, list) or any(not isinstance(row, dict) for row in current_media):
                raise ValueError("Invalid media catalog")
            result = await asyncio.to_thread(prepare_reference_merge, *document, current_media)
            return web.json_response(result)
        except (OSError, ValueError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/audio_keyframe_timeline/reference_project_media")
    async def media(request):
        path = projects.get(request.query.get("token"), {}).get(request.query.get("index"))
        if not path or not os.path.isfile(path):
            raise web.HTTPNotFound()
        return web.FileResponse(path)
