import ast
import importlib.util
from pathlib import Path
import unittest
from types import SimpleNamespace

spec = importlib.util.spec_from_file_location("prompt_text", Path(__file__).parents[1] / "backend" / "prompt_text.py")
prompt_text = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prompt_text)


source = Path(__file__).parents[1] / "backend" / "cap_clip_prompt_vl.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
functions = [node for node in tree.body if isinstance(node, ast.FunctionDef) and node.name == "with_prompt_skill"]
scope = {"strip_comment_lines": prompt_text.strip_comment_lines}
exec(compile(ast.Module(body=functions, type_ignores=[]), str(source), "exec"), scope)
with_prompt_skill = scope["with_prompt_skill"]


class PromptTextTests(unittest.TestCase):
    def test_comments_preserve_markdown_urls_and_inline_slashes(self):
        text = "# Heading\r\n  // note\rtext // inline\nhttps://example.com\n/one\n\t// hidden"
        self.assertEqual(prompt_text.strip_comment_lines(text), "# Heading\ntext // inline\nhttps://example.com\n/one")

    def test_agent_and_skill_comments(self):
        result = with_prompt_skill("# Agent\n// private note\nAct", "# Skill\r\n  // disabled\r\nFollow")
        self.assertTrue(result.startswith("# Agent\nAct"))
        self.assertTrue(result.endswith("# Skill\nFollow"))
        self.assertNotIn("private note", result)
        self.assertNotIn("disabled", result)
        self.assertEqual(with_prompt_skill("# Agent", "// only comment"), "# Agent")

    def test_generated_node_output_filters_comments(self):
        node = next(node for node in tree.body if isinstance(node, ast.ClassDef) and node.name == "CAP_ClipPromptVL")
        execute = next(method for method in node.body if isinstance(method, ast.FunctionDef) and method.name == "execute")
        namespace = {
            "DEFAULT_OUTPUT_LANGUAGE": "English",
            "strip_comment_lines": prompt_text.strip_comment_lines,
            "_images_from_tensor": lambda value: [],
            "with_output_language": lambda text, language: text,
            "_ENGINE": SimpleNamespace(generate=lambda **kwargs: "// model note\n# Shot\nAction\n  // disabled"),
        }
        exec(compile(ast.Module(body=[execute], type_ignores=[]), str(source), "exec"), namespace)
        self.assertEqual(namespace["execute"](None, "model", "system", "skill", "user"), ("# Shot\nAction",))

    def test_empty_and_comment_only(self):
        for text in [None, "", "//note\n  //note"]:
            self.assertEqual(prompt_text.strip_comment_lines(text), "")


if __name__ == "__main__":
    unittest.main()
