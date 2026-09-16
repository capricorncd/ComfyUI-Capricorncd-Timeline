import importlib.util
from pathlib import Path
import tempfile
import unittest
from concurrent.futures import ThreadPoolExecutor

spec = importlib.util.spec_from_file_location('local_config', Path(__file__).parents[1] / 'backend/local_config.py')
config = importlib.util.module_from_spec(spec)
spec.loader.exec_module(config)


class LocalConfigTests(unittest.TestCase):
    def test_roundtrip_and_independent_sections(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.local.yml'
            self.assertEqual(config.read_config(path, 'A', {}), {})
            path.write_text('# Keep section\nOTHER: value\n', encoding='utf-8')
            value = {'api_key': 'a#"\'\\${DO_NOT_EXPAND}\n中文', 'url': 'http://localhost', 'workflow': {'1': {'inputs': {}}}}
            with ThreadPoolExecutor() as pool:
                list(pool.map(lambda name: config.write_config(path, name, value), ['A', 'B', 'C']))
            for name in ['A', 'B', 'C']:
                self.assertEqual(config.read_config(path, name, {}), value)
            self.assertIn('OTHER: value', path.read_text(encoding='utf-8'))
            config.write_config(path, 'A', {})
            self.assertEqual(config.read_config(path, 'A', {}), {})
            self.assertEqual(config.read_config(path, 'B', {}), value)
            self.assertEqual(list(Path(directory).glob('config.local.yml.*.tmp')), [])

    def test_invalid_value_does_not_expose_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config.local.yml'
            path.write_text('A: secret-invalid', encoding='utf-8')
            with self.assertRaisesRegex(ValueError, '^Invalid local configuration: A$'):
                config.read_config(path, 'A', {})


if __name__ == '__main__':
    unittest.main()
