"""Local BGM connection settings. No model loading or outbound requests."""
import math
from urllib.parse import urlsplit


from .local_config import CONFIG_PATH, read_config, write_config


def _path():
    return CONFIG_PATH


def _read():
    return read_config(_path(), "audio", {})


def public_bgm_settings():
    config = _read()
    result = {key: value for key, value in config.items() if key not in ("api_key", "services")}
    result['has_key'] = bool(config.get('api_key'))
    result['services'] = {name: {**{key: value for key, value in row.items() if key != 'api_key'}, 'has_key': bool(row.get('api_key'))}
                          for name, row in config.get('services', {}).items()}
    return result


def save_bgm_settings(payload):
    if not isinstance(payload, dict):
        raise ValueError("Expected BGM configuration object.")
    connection = payload.get("connection")
    if connection not in ("comfyui", "standalone"):
        raise ValueError("Unsupported connection type.")
    url = str(payload.get("url") or "").strip().rstrip("/")
    parsed = urlsplit(url)
    if url and (parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment):
        raise ValueError("Use an HTTP(S) service URL without credentials, query or fragment.")
    if connection == "standalone" and parsed.path in ("/v1/music/generate", "/v1/denoise", "/v1/denoise/file", "/v1/sfx/generate", "/v1/separate/file"):
        url = f"{parsed.scheme}://{parsed.netloc}"
    old = _read()
    key = str(payload.get("api_key") or "").strip()
    if payload.get("clear_key") is True:
        key = ""
    elif not key and old.get("connection") == connection and old.get("url") == url:
        key = old.get("api_key", "")
    config = {"connection": connection, "url": url, "api_key": key}
    services = payload.get('services', old.get('services', {}))
    if not isinstance(services, dict):
        raise ValueError('Expected audio service overrides.')
    config['services'] = {}
    for name in ('music', 'sfx', 'denoise', 'separation', 'vc', 'tts'):
        row = services.get(name, {})
        if not isinstance(row, dict):
            raise ValueError('Invalid audio service override.')
        endpoint = str(row.get('url') or '').strip()
        parsed_endpoint = urlsplit(endpoint)
        if endpoint and (endpoint.startswith('//') or parsed_endpoint.username or parsed_endpoint.password
                         or parsed_endpoint.query or parsed_endpoint.fragment
                         or (parsed_endpoint.scheme and (parsed_endpoint.scheme not in ('http', 'https') or not parsed_endpoint.hostname))):
            raise ValueError('Use a relative endpoint or an HTTP(S) URL without credentials, query or fragment.')
        service_key = str(row.get('api_key') or '').strip()
        previous = old.get('services', {}).get(name, {})
        if row.get('keep_key') and previous.get('url', '') == endpoint:
            service_key = previous.get('api_key', '')
        config['services'][name] = {'url': endpoint, 'api_key': service_key}
    for service, name, default, minimum, maximum in (
        ('sfx', 'num_inference_steps', 100, 1, 200), ('sfx', 'cfg_scale', 4, 1, 20),
        ('separation', 'segment_seconds', 2, 0.001, float('inf')),
    ):
        value = float(services.get(service, {}).get(name, old.get('services', {}).get(service, {}).get(name, default)))
        if not math.isfinite(value) or not minimum <= value <= maximum:
            raise ValueError(f'{name} must be between {minimum} and {maximum}.')
        if name == 'num_inference_steps' and not value.is_integer():
            raise ValueError(f'{name} must be an integer.')
        config['services'][service][name] = int(value) if name == 'num_inference_steps' else value
    write_config(_path(), "audio", config)
    return public_bgm_settings()
