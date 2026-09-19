"""User-authored local Agent prompt templates."""
from pathlib import Path

from .local_config import CONFIG_PATH, read_config, write_config


PROMPT_DIR = Path(__file__).resolve().parents[1] / "agent_prompts"


def prompt_directory():
    directory = read_config(CONFIG_PATH, "agent_prompt_directory", "")
    return Path(directory).resolve() if directory else PROMPT_DIR.resolve()


def prompt_settings():
    return {"directory": read_config(CONFIG_PATH, "agent_prompt_directory", ""),
            "default_directory": str(PROMPT_DIR.resolve())}


def save_prompt_settings(payload):
    if not isinstance(payload, dict) or not isinstance(payload.get("directory"), str):
        raise ValueError("Directory must be a string.")
    directory = payload["directory"].strip()
    if directory:
        path = Path(directory)
        if not path.is_absolute() or not path.is_dir():
            raise ValueError("Enter the absolute path of an existing directory.")
        directory = str(path.resolve())
    write_config(CONFIG_PATH, "agent_prompt_directory", directory)
    return prompt_settings()


def prompt_path(name):
    root = prompt_directory()
    path = (root / name).resolve()
    if not name or any(char in name for char in "/\\:") or Path(name).name != name or path.parent != root or path.suffix.lower() not in {".md", ".txt"}:
        raise ValueError("Select a .md or .txt file from the Agent prompt directory.")
    return path


def list_prompts():
    root = prompt_directory()
    if not root.is_dir():
        return []
    names = []
    for entry in root.iterdir():
        if entry.suffix.lower() not in {".md", ".txt"}:
            continue
        try:
            path = prompt_path(entry.name)
        except ValueError:
            continue
        if path.is_file():
            names.append(entry.name)
    return sorted(names, key=str.casefold)


def read_prompt(name):
    return prompt_path(name).read_text(encoding="utf-8-sig")
