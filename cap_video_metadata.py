"""Local generation provenance stored in MP4 comment metadata without re-encoding."""
import json
import os
import subprocess
import sys
import tempfile

from .cap_save_sidecar import extract_from_prompt


PARAMETERS = ("seed", "noise_seed", "steps", "cfg", "sampler_name", "scheduler", "denoise",
              "sigmas", "split_step", "shift_video", "shift_audio", "audio_denoise", "video_denoise")
COMPONENTS = {"RandomNoise", "BasicGuider", "CFGGuider", "KSamplerSelect", "BasicScheduler",
              "ManualSigmas", "SplitSigmas", "MiniMaxH3SigmaShift"}


def execution_graph(prompt, dynprompt=None, unique_id=None):
    graph = prompt if isinstance(prompt, dict) else {}
    if dynprompt is not None:
        graph = {key: dynprompt.get_node(key) for key in dynprompt.all_node_ids()}
    if unique_id is None or str(unique_id) not in graph:
        return graph
    selected = {}
    pending = [str(unique_id)]
    while pending:
        key = pending.pop()
        if key in selected or key not in graph:
            continue
        selected[key] = graph[key]
        for value in graph[key].get("inputs", {}).values():
            if isinstance(value, list) and len(value) == 2 and isinstance(value[0], str) and isinstance(value[1], int):
                pending.append(value[0])
    return selected


def generation_record(graph, clip_id="", seed=-1):
    models = extract_from_prompt(graph)["models"]
    components = []
    seeds = []
    unknown_seed = False
    for key, node in graph.items():
        kind = node.get("class_type", "")
        if "Sampler" not in kind and kind not in COMPONENTS:
            continue
        inputs = node.get("inputs", {})
        values = {name: inputs[name] for name in PARAMETERS
                  if name in inputs and isinstance(inputs[name], (str, int, float, bool))}
        unresolved = [name for name in PARAMETERS if name in inputs and isinstance(inputs[name], list)]
        unknown_seed |= any(name in unresolved for name in ("seed", "noise_seed"))
        connections = {name: inputs[name] for name in ("noise", "guider", "sampler", "sigmas", "model")
                       if isinstance(inputs.get(name), list)}
        for name in ("seed", "noise_seed"):
            if isinstance(values.get(name), int):
                values[name] = str(values[name])
        if values or unresolved or connections:
            components.append({"node_id": str(key), "node_type": kind, "parameters": values,
                               "connections": connections,
                               **({"unresolved_inputs": unresolved} if unresolved else {})})
        for name in ("seed", "noise_seed"):
            value = inputs.get(name)
            if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                seeds.append({"node_id": str(key), "seed": str(value)})
    actual = int(seed) if seed is not None and int(seed) >= 0 else None
    distinct = {item["seed"] for item in seeds}
    if actual is None and len(distinct) == 1 and not unknown_seed:
        actual = next(iter(distinct))
    return {"schema": "capricorncd.video.generation.v1", "clip_id": str(clip_id or "") or None,
            "seed": str(actual) if actual is not None else None, "seed_source": "input" if seed is not None and int(seed) >= 0
            else "execution_prompt" if actual is not None else "unavailable",
            "seeds": seeds, "models": models, "sampling": components}


def _run(command):
    kwargs = {"capture_output": True, "text": True, "encoding": "utf-8", "errors": "replace", "timeout": 600}
    if sys.platform == "win32":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    result = subprocess.run(command, **kwargs)
    if result.returncode:
        raise RuntimeError(f"Video metadata: {result.stderr[-1500:]}")
    return result.stdout


def read_video_generation(path):
    raw = _run(["ffprobe", "-v", "error", "-show_entries", "format_tags=comment", "-of", "json", path])
    tags = json.loads(raw).get("format", {}).get("tags", {})
    try:
        record = json.loads(tags.get("comment", ""))
    except json.JSONDecodeError:
        return None
    if isinstance(record, dict) and record.get("schema") == "capricorncd.video.generation.v1":
        return record
    return None


def embed_video_generation(path, record):
    raw = _run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", path])
    tags = json.loads(raw).get("format", {}).get("tags", {})
    tags["comment"] = json.dumps(record, ensure_ascii=False, separators=(",", ":"))
    # A metadata file avoids Windows command-line limits on multi-clip records.
    lines = [";FFMETADATA1"]
    for key, value in tags.items():
        for char in ("\\", "=", ";", "#", "\n"):
            key = key.replace(char, "\\" + char)
            value = value.replace(char, "\\" + char)
        lines.append(key + "=" + value)
    parent = os.path.dirname(os.path.abspath(path))
    with tempfile.TemporaryDirectory(prefix="cap_video_meta_", dir=parent) as temp:
        metadata = os.path.join(temp, "metadata.txt")
        output = os.path.join(temp, "tagged.mp4")
        with open(metadata, "w", encoding="utf-8", newline="\n") as stream:
            stream.write("\n".join(lines) + "\n")
        _run(["ffmpeg", "-v", "error", "-y", "-i", path, "-f", "ffmetadata", "-i", metadata,
              "-map", "0", "-c", "copy", "-map_metadata", "1", output])
        if read_video_generation(output) != record:
            raise RuntimeError("Video metadata verification failed; original video retained.")
        os.replace(output, path)
