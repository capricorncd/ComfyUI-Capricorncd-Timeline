"""CPU-only contract tests for the KJNodes adapter and ComfyUI loop ID mapping."""
import ast
from pathlib import Path
import runpy
import sys
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch


ROOT = Path(__file__).resolve().parents[1]
graph_source = ROOT.parents[1] / "comfy_execution" / "graph.py"
graph_class = next(n for n in ast.parse(graph_source.read_text(encoding="utf-8")).body
                   if isinstance(n, ast.ClassDef) and n.name == "DynamicPrompt")
graph_namespace = {}
exec(compile(ast.Module(body=[graph_class], type_ignores=[]), str(graph_source), "exec"), graph_namespace)
DynamicPrompt = graph_namespace["DynamicPrompt"]


class PreviewOverrideTests(unittest.TestCase):
    def setUp(self):
        self.clones = []
        clones = self.clones

        class Upstream:
            hidden = SimpleNamespace(unique_id="untouched")

            @classmethod
            def PREPARE_CLASS_CLONE(cls, data):
                clone = type("ExecutionPreview", (cls,), {"hidden": SimpleNamespace(**data["hidden_inputs"])})
                clones.append(clone)
                return clone

            @classmethod
            def execute(cls, *args):
                cls.received = args
                return SimpleNamespace(args=(args[0],))

        self.upstream = Upstream
        self.nodes = SimpleNamespace(NODE_CLASS_MAPPINGS={"ModelPreviewOverrideKJ": Upstream})
        self.cli_args = SimpleNamespace(disable_comfy_compiler=False)
        with patch.dict(sys.modules, {
            "comfy.cli_args": SimpleNamespace(args=self.cli_args),
            "comfy.patcher_extension": SimpleNamespace(WrappersMP=SimpleNamespace(OUTER_SAMPLE="outer_sample")),
            "folder_paths": SimpleNamespace(get_filename_list=lambda _: ["taeh3.safetensors"]),
            "nodes": self.nodes,
            "comfy_api.latest": SimpleNamespace(io=SimpleNamespace(Hidden=SimpleNamespace(unique_id="unique_id"))),
        }):
            self.module = runpy.run_path(str(ROOT / "backend" / "cap_model_preview.py"))
        self.node = self.module["CAP_ModelPreviewOverride"]()
        self.args = (Mock(), 512, 85, True, 9, 12, object(), "taeh3.safetensors")

    def run_preview(self, node_id, graph=None):
        result = self.node.patch(*self.args, unique_id=node_id, dynprompt=graph)
        self.assertEqual(result, (self.args[0],))
        self.assertEqual(self.clones[-1].received, self.args)
        return self.clones[-1].hidden.unique_id

    def test_normal_and_missing_dynamic_prompt(self):
        self.assertEqual(self.run_preview("686", DynamicPrompt({"686": {}})), "686")
        self.assertEqual(self.run_preview("686"), "686")

    def test_second_and_third_loop_resolve_to_display_not_loop_owner(self):
        graph = DynamicPrompt({"686": {}, "584": {}})
        graph.add_ephemeral_node("584.0.0.686", {}, "584", "686")
        graph.add_ephemeral_node("584.1.0.686", {}, "584.0.0.686", "584.0.0.686")
        for node_id in ("686", "584.0.0.686", "584.1.0.686"):
            self.assertEqual(self.run_preview(node_id, graph), "686")

    def test_subgraphs_keep_qualified_ids(self):
        graph = DynamicPrompt({"638:686": {}, "639:686": {}})
        graph.add_ephemeral_node("loop.0.686", {}, "584", "638:686")
        graph.add_ephemeral_node("loop.1.686", {}, "584", "639:686")
        self.assertEqual(self.run_preview("loop.0.686", graph), "638:686")
        self.assertEqual(self.run_preview("loop.1.686", graph), "639:686")

    def test_execution_clones_do_not_mutate_upstream_or_retain_graph(self):
        self.run_preview("686", DynamicPrompt({"686": {}}))
        self.run_preview("700", DynamicPrompt({"700": {}}))
        self.assertIsNot(self.clones[0], self.clones[1])
        self.assertEqual(vars(self.clones[0].hidden), {"unique_id": "686"})
        self.assertEqual(self.upstream.hidden.unique_id, "untouched")
        self.assertFalse(hasattr(self.upstream, "received"))

    def test_missing_dependency_is_actionable_and_schema_still_available(self):
        self.nodes.NODE_CLASS_MAPPINGS.clear()
        schema = self.node.INPUT_TYPES()
        self.assertEqual(schema["required"]["model"], ("MODEL",))
        self.assertIn("taeh3.safetensors", schema["optional"]["tiny_vae"][0])
        self.assertEqual(schema["hidden"]["dynprompt"], "DYNPROMPT")
        with self.assertRaisesRegex(RuntimeError, "Install/update KJNodes and restart"):
            self.run_preview("686")

    def test_compiler_guard_only_attached_for_tiny_preview(self):
        model = self.args[0]
        self.run_preview("686")
        model.add_wrapper_with_key.assert_called_once_with(
            "outer_sample", "cap_tiny_preview_no_compiler", self.module["_sample_without_compiler"])
        model.reset_mock()
        self.node.patch(*self.args[:-1], tiny_vae="none")
        model.remove_wrappers_with_key.assert_called_once_with("outer_sample", "cap_tiny_preview_no_compiler")
        model.add_wrapper_with_key.assert_not_called()

    def test_compiler_setting_restored_on_success_error_and_interrupt(self):
        class Interrupt(BaseException):
            pass

        guard = self.module["_sample_without_compiler"]
        for previous in (False, True):
            for failure in (None, RuntimeError, Interrupt):
                with self.subTest(previous=previous, failure=failure):
                    self.cli_args.disable_comfy_compiler = previous

                    def sample(value, *, seed):
                        self.assertTrue(self.cli_args.disable_comfy_compiler)
                        self.assertEqual(seed, 42)
                        if failure:
                            raise failure()
                        return value

                    if failure:
                        with self.assertRaises(failure):
                            guard(sample, "result", seed=42)
                    else:
                        self.assertEqual(guard(sample, "result", seed=42), "result")
                    self.assertEqual(self.cli_args.disable_comfy_compiler, previous)


if __name__ == "__main__":
    unittest.main()
