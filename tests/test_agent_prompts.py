import importlib.util
from pathlib import Path
import tempfile
import sys
import types
import unittest


source = Path(__file__).resolve().parents[1] / "backend/agent_prompts.py"
package = types.ModuleType("_agent_prompt_tests")
package.__path__ = [str(source.parent)]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location("_agent_prompt_tests.agent_prompts", source)
prompts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prompts)


class AgentPromptsTest(unittest.TestCase):
    def setUp(self):
        self.configuration = tempfile.TemporaryDirectory()
        self.addCleanup(self.configuration.cleanup)
        prompts.CONFIG_PATH = Path(self.configuration.name) / "config.local.yml"

    def test_configured_directory_and_reset(self):
        root = Path(self.configuration.name)
        prompts.PROMPT_DIR = root / "default"
        prompts.PROMPT_DIR.mkdir()
        custom = root / "custom"
        custom.mkdir()
        (custom / "pv.md").write_text("Custom prompt", encoding="utf-8")
        self.assertEqual(prompts.prompt_directory(), prompts.PROMPT_DIR.resolve())
        prompts.save_prompt_settings({"directory": str(custom)})
        self.assertEqual(prompts.prompt_directory(), custom.resolve())
        self.assertEqual(prompts.list_prompts(), ["pv.md"])
        self.assertEqual(prompts.read_prompt("pv.md"), "Custom prompt")
        self.assertEqual(prompts.prompt_settings()["directory"], str(custom.resolve()))
        for value in ["relative/path", str(root / "missing"), str(custom / "pv.md")]:
            with self.assertRaises(ValueError):
                prompts.save_prompt_settings({"directory": value})
        self.assertEqual(prompts.prompt_directory(), custom.resolve(), "failed saves preserve configuration")
        prompts.save_prompt_settings({"directory": ""})
        self.assertEqual(prompts.prompt_directory(), prompts.PROMPT_DIR.resolve())
        self.assertEqual(prompts.list_prompts(), [])

    def test_list_read_and_refresh(self):
        with tempfile.TemporaryDirectory() as temporary:
            prompts.PROMPT_DIR = Path(temporary)
            self.assertEqual(prompts.list_prompts(), [])
            text = "# 角色 PV\n只输出提示词。\n"
            (prompts.PROMPT_DIR / "角色.md").write_text(text, encoding="utf-8-sig")
            (prompts.PROMPT_DIR / "notes.TXT").write_text("notes", encoding="utf-8")
            (prompts.PROMPT_DIR / "script.py").write_text("ignored", encoding="utf-8")
            self.assertEqual(prompts.list_prompts(), ["notes.TXT", "角色.md"])
            self.assertEqual(prompts.read_prompt("角色.md"), text)
            (prompts.PROMPT_DIR / "notes.TXT").unlink()
            self.assertEqual(prompts.list_prompts(), ["角色.md"])

    def test_reject_paths_and_non_template_files(self):
        with tempfile.TemporaryDirectory() as temporary:
            prompts.PROMPT_DIR = Path(temporary)
            for name in ["", "../secret.txt", "sub/file.md", "sub\\file.txt", "C:\\secret.md", "file.md:secret.txt", "config.local.yml", ".gitkeep"]:
                with self.subTest(name=name), self.assertRaises(ValueError):
                    prompts.read_prompt(name)
            with self.assertRaises(FileNotFoundError):
                prompts.read_prompt("missing.md")


if __name__ == "__main__":
    unittest.main()
