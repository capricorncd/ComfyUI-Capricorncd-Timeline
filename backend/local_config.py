"""Local interface settings stored in the plugin's config.local.yml."""
import os
from pathlib import Path
import tempfile
import threading
import yaml


CONFIG_PATH = Path(__file__).resolve().parents[1] / 'config.local.yml'
_LOCK = threading.RLock()


def _read_document(path):
    if not path.exists():
        return {}
    try:
        result = yaml.safe_load(path.read_text(encoding='utf-8-sig'))
    except yaml.YAMLError:
        raise ValueError('Invalid YAML in local interface settings.') from None
    if result is None:
        return {}
    if not isinstance(result, dict):
        raise ValueError('Local interface settings must be a YAML mapping.')
    return result


def read_config(path, name, default):
    with _LOCK:
        result = _read_document(path).get(name, default)
        if not isinstance(result, type(default)):
            raise ValueError(f'Invalid local configuration: {name}')
        return result


def write_config(path, name, config):
    with _LOCK:
        document = _read_document(path)
        document[name] = config
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, temporary = tempfile.mkstemp(dir=path.parent, prefix='config.local.yml.', suffix='.tmp')
        try:
            with os.fdopen(fd, 'w', encoding='utf-8') as stream:
                stream.write('# Local interface settings. Do not commit this file.\n')
                yaml.safe_dump(document, stream, allow_unicode=True, sort_keys=False)
            os.replace(temporary, path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)
