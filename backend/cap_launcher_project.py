"""Directory-backed editing sessions for the desktop launcher."""

import asyncio
import hashlib
import json
import os
import shutil
import tempfile
import uuid
from datetime import datetime

from aiohttp import web

from .cap_reference_project import reference_media_path
from .cap_reveal_file import reveal_file
from .cap_timeline_project_io import (
    _import_generated_bytes, _import_media_bytes, _remap_project_files,
    build_export_entries, iter_project_generated_videos, iter_project_media,
    migrate_project, parse_storyboard_document,
)


def project_path(directory, relative):
    path = os.path.abspath(os.path.join(directory, relative))
    if os.path.commonpath([directory, os.path.realpath(path)]) != directory:
        raise ValueError("Project path leaves the selected directory")
    return path


def atomic_json(path, value):
    fd, temporary = tempfile.mkstemp(prefix=".timeline-", dir=os.path.dirname(path))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def media_digest(path, cache):
    stat = os.stat(path)
    signature = (stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns)
    cached = cache.get(path)
    if cached and cached[0] == signature:
        return cached[1]
    with open(path, "rb") as stream:
        digest = hashlib.file_digest(stream, "sha256").hexdigest()
    cache[path] = (signature, digest)
    return digest


def existing_project_media(directory, sizes, cache):
    by_content = {}
    for folder in ("media", "images", "videos", "audios", "generated"):
        root = project_path(directory, folder)
        for current, dirs, files in os.walk(root, followlinks=False):
            dirs[:] = sorted(name for name in dirs if not os.path.islink(os.path.join(current, name)))
            for name in sorted(files):
                path = os.path.join(current, name)
                if os.path.islink(path) or not os.path.isfile(path) or os.path.getsize(path) not in sizes:
                    continue
                relative = os.path.relpath(path, directory).replace(os.sep, "/")
                project_path(directory, relative)
                key = (os.path.splitext(name)[1].lower(), media_digest(path, cache))
                by_content.setdefault(key, relative)
    return by_content


def project_filename(filename):
    if not isinstance(filename, str) or not filename.startswith("project") or not filename.endswith(".json") or any(c in filename for c in '/\\:'):
        raise ValueError("Invalid project filename")
    return filename


def storyboard_filename(filename):
    return "storyboard" + project_filename(filename)[len("project"):]


def project_versions(directory):
    versions = []
    for name in os.listdir(directory):
        if name.startswith("project") and name.endswith(".json"):
            path = project_path(directory, project_filename(name))
            if os.path.isfile(path):
                versions.append({"filename": name, "modified": os.path.getmtime(path) * 1000})
    return sorted(versions, key=lambda row: row["modified"], reverse=True)


def open_project_directory(directory, filename="project.json"):
    if not os.path.isabs(directory) or directory.startswith(("\\\\", "//")):
        raise ValueError("Select an absolute local project directory")
    directory = os.path.realpath(directory)
    if directory.startswith(("\\\\", "//")):
        raise ValueError("Select a local project directory")
    with open(project_path(directory, project_filename(filename)), encoding="utf-8-sig") as stream:
        project = json.load(stream)
    if not isinstance(project, dict) or not isinstance(project.get("tracks"), list):
        raise ValueError("Invalid project.json")
    project = migrate_project(project)
    history_path = project_path(directory, "prompt_history.json")
    project["prompt_history"] = {"schema_version": 1, "items": []}
    if os.path.isfile(history_path):
        with open(history_path, encoding="utf-8-sig") as stream:
            project["prompt_history"] = json.load(stream)
    storyboard_path = project_path(directory, storyboard_filename(filename))
    if os.path.isfile(storyboard_path):
        with open(storyboard_path, encoding="utf-8-sig") as stream:
            storyboard = parse_storyboard_document(json.load(stream))
    else:
        storyboard = parse_storyboard_document(legacy_shots=project.get("storyboards"))
    mapping, generated, warnings = {}, {}, []
    for row in iter_project_media(project):
        path = reference_media_path(directory, row)
        if not path:
            warnings.append(row["file"])
            continue
        with open(path, "rb") as stream:
            mapping[(row["kind"], row["file"])] = _import_media_bytes(row["kind"], os.path.basename(path), stream.read())
    for file in iter_project_generated_videos(project):
        path = reference_media_path(directory, {"kind": "video", "file": file, "location": "output"})
        if not path:
            warnings.append(file)
            continue
        with open(path, "rb") as stream:
            generated[file] = _import_generated_bytes(os.path.basename(path), stream.read())
    return directory, _remap_project_files(project, mapping, generated), storyboard, warnings


def save_project_directory(directory, project, storyboard, backup, cache, workflow=None, filename="project.json"):
    if os.path.realpath(directory) != directory or not os.path.isdir(directory):
        raise ValueError("Project directory changed or no longer exists; open it again")
    filename = project_filename(filename)
    storyboard = parse_storyboard_document(storyboard, project.get("storyboards"))
    exported, entries, missing = build_export_entries(project)
    if workflow is not None and not isinstance(workflow, dict):
        raise ValueError("Invalid workflow")
    # Reuse package folders without replacing assets referenced by the formal save.
    mapping, generated = {}, {}
    hashes = cache.setdefault("hashes", {})
    by_content = existing_project_media(directory, {os.path.getsize(entry["src_path"]) for entry in entries}, hashes)
    for entry in entries:
        source = entry["src_path"]
        digest = media_digest(source, hashes)
        content_key = (os.path.splitext(source)[1].lower(), digest)
        relative = by_content.get(content_key)
        if relative is None:
            relative = entry["arcname"]
            target = project_path(directory, relative)
            stem, extension = os.path.splitext(relative)
            collision = 0
            while os.path.isfile(target):
                if media_digest(target, hashes) == digest:
                    break
                collision += 1
                suffix = f"_{collision}" if collision > 1 else ""
                relative = f"{stem}_{digest}{suffix}{extension}"
                target = project_path(directory, relative)
            os.makedirs(os.path.dirname(target), exist_ok=True)
            if not os.path.isfile(target):
                fd, temporary = tempfile.mkstemp(prefix=".media-", dir=os.path.dirname(target))
                os.close(fd)
                try:
                    shutil.copyfile(source, temporary)
                    os.replace(temporary, target)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            by_content[content_key] = relative
        if entry["location"] == "output":
            generated[entry["arcname"]] = relative
        else:
            mapping[(entry["kind"], entry["arcname"])] = relative
    exported = _remap_project_files(exported, mapping, generated)
    exported.pop("storyboards", None)
    exported["project_directory"] = directory
    suffix = ".bak" if backup else ""
    if not backup and workflow is not None:
        atomic_json(project_path(directory, "workflow.json"), workflow)
    atomic_json(project_path(directory, storyboard_filename(filename) + suffix), storyboard)
    atomic_json(project_path(directory, filename + suffix), exported)
    return missing


def project_revision(directory, filename="project.json"):
    digest = hashlib.sha256()
    for name in (project_filename(filename), storyboard_filename(filename)):
        path = project_path(directory, name)
        digest.update(name.encode())
        if os.path.isfile(path):
            with open(path, "rb") as stream:
                digest.update(stream.read())
        else:
            digest.update(b"missing")
    return digest.hexdigest()


def register_launcher_project_routes(routes):
    sessions = {}

    def bind(directory, filename="project.json"):
        directory = os.path.realpath(directory)
        if not os.path.isdir(directory):
            raise ValueError("Project directory does not exist")
        token = uuid.uuid4().hex
        sessions[token] = {"directory": directory, "filename": filename, "cache": {}, "lock": asyncio.Lock(), "revision": project_revision(directory, filename)}
        while len(sessions) > 128:
            del sessions[next(iter(sessions))]
        return token

    def local_json(request):
        if request.remote not in {"127.0.0.1", "::1", "::ffff:127.0.0.1"} or request.content_type != "application/json":
            raise web.HTTPForbidden(text="Local JSON requests only")
        origin = request.headers.get("Origin")
        if origin and origin != f"{request.scheme}://{request.host}":
            raise web.HTTPForbidden(text="Same-origin requests only")

    @routes.post("/audio_keyframe_timeline/launcher_project/associate")
    async def associate_directory(request):
        local_json(request)
        try:
            payload = await request.json()
            directory = str(payload.get("directory") or "")
            if not os.path.isabs(directory) or directory.startswith(("\\\\", "//")):
                raise ValueError("Select an absolute local project directory")
            directory = os.path.realpath(directory)
            if directory.startswith(("\\\\", "//")):
                raise ValueError("Select a local project directory")
            existing = os.path.exists(project_path(directory, "project.json"))
            token = bind(directory)
            return web.json_response({"token": token, "directory": directory, "existing": existing})
        except (OSError, ValueError, TypeError, AttributeError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.post("/audio_keyframe_timeline/launcher_project/open")
    async def open_directory(request):
        local_json(request)
        try:
            payload = await request.json()
            directory = str(payload.get("directory") or "")
            if not os.path.isabs(directory) or directory.startswith(("\\\\", "//")):
                raise ValueError("Select an absolute local project directory")
            directory = os.path.realpath(directory)
            if directory.startswith(("\\\\", "//")):
                raise ValueError("Select a local project directory")
            filename = payload.get("filename")
            if filename is None:
                versions = await asyncio.to_thread(project_versions, directory)
                if len(versions) > 1:
                    return web.json_response({"directory": directory, "versions": versions})
                filename = versions[0]["filename"] if versions else "project.json"
            directory, project, storyboard, warnings = await asyncio.to_thread(open_project_directory, directory, filename)
            token = bind(directory, filename)
            return web.json_response({"token": token, "directory": directory, "filename": filename, "project": project, "storyboard": storyboard, "warnings": warnings})
        except (OSError, ValueError, TypeError, AttributeError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.post("/audio_keyframe_timeline/launcher_project/save")
    async def save(request):
        local_json(request)
        try:
            payload = await request.json()
            session = sessions.get(payload.get("token"))
            if session is None:
                return web.json_response({"error": "Project session expired; open the project directory again"}, status=404)
            if not isinstance(payload.get("project"), dict) or type(payload.get("backup")) is not bool:
                raise ValueError("Invalid project save")
            async with session["lock"]:
                missing = await asyncio.to_thread(save_project_directory, session["directory"], payload["project"], payload.get("storyboard"), payload["backup"], session["cache"], payload.get("workflow"), session["filename"])
                if not payload["backup"]:
                    session["revision"] = await asyncio.to_thread(project_revision, session["directory"], session["filename"])
            return web.json_response({"missing": missing})
        except (OSError, ValueError, TypeError, AttributeError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.post("/audio_keyframe_timeline/launcher_project/status")
    async def status(request):
        local_json(request)
        payload = await request.json()
        session = sessions.get(payload.get("token"))
        if session is None:
            return web.json_response({"error": "Project session expired; open the project directory again"}, status=404)
        try:
            async with session["lock"]:
                revision = await asyncio.to_thread(project_revision, session["directory"], session["filename"])
                exists = os.path.isfile(project_path(session["directory"], session["filename"]))
                return web.json_response({"revision": revision, "changed": revision != session["revision"], "exists": exists})
        except (OSError, ValueError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.post("/audio_keyframe_timeline/launcher_project/snapshot")
    async def snapshot(request):
        local_json(request)
        try:
            payload = await request.json()
            session = sessions.get(payload.get("token"))
            if session is None:
                return web.json_response({"error": "Project session expired"}, status=404)
            if not isinstance(payload.get("project"), dict):
                raise ValueError("Invalid project save")
            filename = f"project.{datetime.now():%Y%m%d-%H%M%S-%f}.{uuid.uuid4().hex[:8]}.json"
            async with session["lock"]:
                missing = await asyncio.to_thread(save_project_directory, session["directory"], payload["project"], payload.get("storyboard"), False, session["cache"], None, filename)
            return web.json_response({"filename": filename, "missing": missing})
        except (OSError, ValueError, TypeError, AttributeError) as error:
            return web.json_response({"error": str(error)}, status=400)

    @routes.post("/audio_keyframe_timeline/launcher_project/reveal")
    async def reveal(request):
        local_json(request)
        payload = await request.json()
        session = sessions.get(payload.get("token"))
        if session is None:
            return web.json_response({"error": "Project session expired; open the project directory again"}, status=404)
        try:
            await asyncio.to_thread(reveal_file, project_path(session["directory"], "project.json"))
            return web.json_response({"ok": True})
        except Exception as error:
            return web.json_response({"error": str(error)}, status=400)

    return bind
