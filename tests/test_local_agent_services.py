import ast
import copy
import json
from pathlib import Path
import threading
import unittest
from unittest.mock import Mock, patch
import urllib.error
import urllib.parse
import urllib.request
import uuid

source = Path(__file__).resolve().parents[1] / 'backend/cap_clip_prompt_vl.py'
names = {'list_agent_service_models', '_agent_base_url', 'public_agent_configs', 'save_agent_config', '_agent_config', '_post_agent_json', '_generate_with_agent'}
tree = ast.parse(source.read_text(encoding='utf-8'))
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name in names]
constants = [node for node in tree.body if isinstance(node, ast.Assign) and any(isinstance(target, ast.Name) and target.id in {'AGENT_PROVIDERS', '_AGENT_BASE_URLS', '_AGENT_ENDPOINTS'} for target in node.targets)]


class LocalAgentTests(unittest.TestCase):
    def setUp(self):
        self.rows = []
        def write(_path, _section, value):
            self.rows = copy.deepcopy(value)
        self.scope = {'urllib': urllib, 'json': json, 'uuid': uuid, '_AGENT_CONFIG_LOCK': threading.Lock(),
                      '_t': lambda key, *_args, **_kw: key, 'get_last_known_lang': lambda: 'en',
                      '_read_agent_configs': lambda: copy.deepcopy(self.rows), '_agent_config_path': lambda: None,
                      'write_config': write, 'DEFAULT_OUTPUT_LANGUAGE': 'English',
                      'agent_system_prompt': lambda *args: 'system', 'with_output_language': lambda prompt, _: prompt,
                      'with_prompt_skill': lambda prompt, _: prompt, 'h3_prompt_skill': lambda _: '',
                      'media_from_payload': lambda _: ([], []), '_remote_images': lambda *_: [],
                      'audio_from_payload': lambda _: [], 'build_user_prompt': lambda payload: payload['user_prompt']}
        exec(compile(ast.Module(body=constants + functions, type_ignores=[]), str(source), 'exec'), self.scope)

    def save(self, provider='ollama', **kwargs):
        return self.scope['save_agent_config']({'label': 'Local', 'provider': provider, 'model': 'qwen3:8b', **kwargs})

    def test_keyless_local_configs_are_selectable_and_persist_url(self):
        for provider, port in [('ollama', 11434), ('openai_compatible', 1234)]:
            agent = self.save(provider)
            self.assertEqual(agent['base_url'], f'http://localhost:{port}/v1')
            self.assertFalse(agent['has_key'])
            self.assertEqual(self.scope['_agent_config'](agent['id'])['model'], 'qwen3:8b')
        self.assertEqual(len(self.scope['public_agent_configs'](True)), 2)
        self.save(id=agent['id'], base_url='http://127.0.0.1:8080/', enabled=False)
        self.assertEqual(self.rows[-1]['base_url'], 'http://127.0.0.1:8080/v1')
        self.assertEqual(len(self.scope['public_agent_configs'](True)), 1)

    def test_keys_remain_private_and_cloud_keys_are_not_reused_for_local(self):
        for provider in ['openai', 'gemini']:
            with self.assertRaises(ValueError):
                self.save(provider)
        agent = self.save('openai', api_key='secret')
        self.assertNotIn('api_key', agent)
        self.save('openai', id=agent['id'])
        self.assertEqual(self.rows[0]['api_key'], 'secret')
        self.save('ollama', id=agent['id'])
        self.assertEqual(self.rows[0]['api_key'], '')

    def test_invalid_urls(self):
        for url in ['file:///tmp', 'http://', 'http://user:pass@localhost:11434/v1', 'http://localhost/v1?key=secret', 'http://localhost/v1#fragment']:
            with self.subTest(url=url), self.assertRaises(ValueError):
                self.save(base_url=url)

    def test_chat_request_and_multimodal_content(self):
        for provider in ['ollama', 'openai_compatible']:
            agent = self.save(provider, base_url='http://127.0.0.1:8080/v1/')
            post = Mock(return_value={'choices': [{'message': {'content': ' A sunny forest. '}}]})
            self.scope['_post_agent_json'] = post
            result = self.scope['_generate_with_agent']({'user_prompt': 'Forest', 'system_prompt': 'Be brief', 'max_new_tokens': 512}, agent['id'])
            self.assertEqual(result, 'A sunny forest.')
            url, key, body, actual_provider = post.call_args.args
            self.assertEqual(url, 'http://127.0.0.1:8080/v1/chat/completions')
            self.assertEqual(key, '')
            self.assertEqual(actual_provider, provider)
            self.assertEqual(body['messages'], [{'role': 'system', 'content': 'Be brief'}, {'role': 'user', 'content': 'Forest'}])
            self.assertFalse(body['stream'])
            self.assertEqual(body['max_tokens'], 512)
            self.scope['_remote_images'] = lambda *_: [('image/jpeg', 'image-data')]
            self.scope['audio_from_payload'] = lambda _: [('audio/wav', 'wav', 'audio-data')]
            self.scope['_generate_with_agent']({'user_prompt': 'Forest'}, agent['id'])
            content = post.call_args.args[2]['messages'][1]['content']
            self.assertEqual(content[1]['image_url']['url'], 'data:image/jpeg;base64,image-data')
            self.assertEqual(content[2]['input_audio']['format'], 'wav')
            self.scope['_remote_images'] = lambda *_: []
            self.scope['audio_from_payload'] = lambda _: []
            post.return_value = {'choices': []}
            with self.assertRaises(RuntimeError):
                self.scope['_generate_with_agent']({'user_prompt': 'Forest'}, agent['id'])

    def test_fetch_models_for_unsaved_and_authenticated_services(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = json.dumps({'data': [{'id': 'qwen3:8b'}, {'id': 'gemma'}, {'id': 'qwen3:8b'}, {}]}).encode()
        with patch.object(urllib.request, 'urlopen', return_value=response) as request:
            for provider in ['ollama', 'openai_compatible']:
                models = self.scope['list_agent_service_models']({'provider': provider, 'base_url': 'http://localhost:11434'})
                self.assertEqual(models, ['gemma', 'qwen3:8b'])
                self.assertEqual(request.call_args.args[0].full_url, 'http://localhost:11434/v1/models')
                self.assertNotIn('Authorization', request.call_args.args[0].headers)
                self.assertEqual(request.call_args.kwargs['timeout'], 15)
            agent = self.save('openai_compatible', api_key='saved-secret')
            payload = {'provider': 'openai_compatible', 'id': agent['id'], 'base_url': agent['base_url']}
            self.scope['list_agent_service_models'](payload)
            self.assertEqual(request.call_args.args[0].headers['Authorization'], 'Bearer saved-secret')
            self.scope['list_agent_service_models']({**payload, 'base_url': 'http://localhost:8000/v1'})
            self.assertNotIn('Authorization', request.call_args.args[0].headers, 'saved keys must not follow an unsaved URL change')
            self.scope['list_agent_service_models']({**payload, 'api_key': 'new-key'})
            self.assertEqual(request.call_args.args[0].headers['Authorization'], 'Bearer new-key')
            response.read.return_value = b'{"data": []}'
            self.assertEqual(self.scope['list_agent_service_models'](payload), [])
            response.read.return_value = b'{"unexpected": []}'
            with self.assertRaises(ValueError):
                self.scope['list_agent_service_models'](payload)
        with patch.object(urllib.request, 'urlopen', side_effect=urllib.error.URLError('refused')):
            with self.assertRaises(RuntimeError):
                self.scope['list_agent_service_models']({'provider': 'ollama'})
        with self.assertRaises(ValueError):
            self.scope['list_agent_service_models']({'provider': 'gemini'})

    def test_http_auth_headers(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{}'
        with patch.object(urllib.request, 'urlopen', return_value=response) as request:
            for provider, key in [('ollama', ''), ('openai_compatible', 'local-key'), ('openai', 'cloud-key'), ('gemini', 'gemini-key')]:
                self.scope['_post_agent_json']('http://localhost:8080/v1/chat/completions', key, {}, provider)
                headers = request.call_args.args[0].headers
                self.assertEqual(headers.get('Authorization'), f'Bearer {key}' if key and provider != 'gemini' else None)
                self.assertEqual(headers.get('X-goog-api-key'), key if provider == 'gemini' else None)


if __name__ == '__main__':
    unittest.main()
