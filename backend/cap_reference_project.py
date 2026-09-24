import asyncio
import json
import os
import subprocess
import sys
import uuid

from aiohttp import web
import folder_paths

from .timecode import IMAGE_EXTENSIONS, VIDEO_EXTENSIONS, AUDIO_EXTENSIONS


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


def register_reference_project_routes(routes):
    projects = {}
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
            while len(projects) > 32:
                del projects[next(iter(projects))]
            return web.json_response({"project": project, "token": token, "available": list(files)})
        except (OSError, ValueError, subprocess.SubprocessError, ImportError) as exc:
            return web.json_response({"error": str(exc)}, status=400)

    @routes.get("/audio_keyframe_timeline/reference_project_media")
    async def media(request):
        path = projects.get(request.query.get("token"), {}).get(request.query.get("index"))
        if not path or not os.path.isfile(path):
            raise web.HTTPNotFound()
        return web.FileResponse(path)
