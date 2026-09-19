import ast
import hashlib
import json
import logging
import math
from pathlib import Path
import secrets
from types import SimpleNamespace
import unittest
from unittest.mock import Mock

BACKEND = Path(__file__).resolve().parents[1] / "backend"


def load_definitions(name, scope):
    path = BACKEND / name
    tree = ast.parse(path.read_text(encoding="utf-8"))
    tree.body = [n for n in tree.body if not isinstance(n, (ast.Import, ast.ImportFrom))]
    exec(compile(tree, str(path), "exec"), scope)
    return scope


class GeneratorTests(unittest.TestCase):
    def setUp(self):
        self.calls = []
        self.prepared = []
        self.saved = []
        self.events = []
        self.composed = []
        owner = self

        class Prepare:
            @staticmethod
            def INPUT_TYPES():
                return {"optional": {"strict_keyframes": (None, {"tooltip": "strict"})}}

            def execute(self, clip, vae, audio_vae, width, height, ref_size, data_json, index, **kw):
                data = json.loads(data_json)
                row = data["clips"][index]
                owner.prepared.append((width, height, row, kw))
                latent = owner.digital_latent if row.get("clip_role") == "digital_human" else "empty"
                audio = owner.digital_audio if row.get("clip_role") == "digital_human" else None
                return ("positive", latent, 124, "clip prompt", None, None, audio, "",
                        (row.get("h3_timing") or {}).get("context_frames", 0), row.get("save_latent", False), row["seed"])

        class Save:
            def execute(self, frames_dir, fps, output, **kw):
                owner.saved.append((output, kw))
                return {"result": (output,), "ui": {"video": [{"filename": output, "type": "output"}]}}

        class Compose:
            def execute(self, data_json, **kw):
                owner.composed.append((json.loads(data_json), kw))
                return {"result": ("compose/final.mp4",), "ui": {"video": [{"filename": "final.mp4", "subfolder": "compose", "type": "output"}]}}

        scope = dict(json=json, hashlib=hashlib, math=math, secrets=secrets,
                     folder_paths=SimpleNamespace(get_full_path_or_raise=lambda *a: "valid"),
                     nodes=SimpleNamespace(), comfy=SimpleNamespace(model_management=SimpleNamespace(throw_exception_if_processing_interrupted=lambda: None)),
                     CAP_MiniMaxH3ReferenceToVideo=Prepare, CAP_SeqToVideo=Save, CAP_ComposeClipVideos=Compose,
                     CAP_SizeFromMegapixels=lambda: SimpleNamespace(execute=lambda *a: (608, 352, .2, 32)),
                     CAP_H3MotionContextRefine=lambda: SimpleNamespace(apply=lambda *a: (a[0],)),
                     EVENT_CLIP_RUNNING="running", notify_timeline=lambda event, **k: owner.events.append((event, k, len(owner.prepared))),
                     execution_graph=lambda *a: {}, timing_filename=lambda path, timing: path)
        self.scope = load_definitions("cap_h3_video_generator.py", scope)
        scope["_node_class"] = lambda name: object

        def call(name, records, **kw):
            owner.calls.append((name, kw))
            records[str(len(records))] = {"class_type": name, "inputs": {k: v for k, v in kw.items() if isinstance(v, (str, int, float, bool))}}
            if name == "SamplerCustomAdvanced":
                return "sampled", "denoised"
            if name == "LTXVSeparateAVLatent":
                return "video", "audio"
            if name == "MiniMaxH3MotionContextSaveLatent":
                return (kw["filename_prefix"] + ".safetensors",)
            if name == "MiniMaxH3MotionContextLoadLatent":
                return ({"samples": kw["latent_path"]},)
            return (name + "_output",)
        scope["_call"] = call
        self.node = scope["CAP_H3VideoGenerator"]()

    def run_node(self, rows=None, **kw):
        rows = rows or [{"id": "a", "start_ms": 0, "end_ms": 5000, "seed": -1}]
        rows = [{"output_video": f"project/{row['id']}.mp4", **row} for row in rows]
        data = {"width": 1376, "height": 768, "fps": 24, "clips": rows}
        kw.setdefault("sampling_preview", False)
        kw.setdefault("base_model", "base")
        return self.node.generate("base", "clip", "vae", "audio_vae", json.dumps(data), **kw)

    def selflift_config(self):
        folders = SimpleNamespace(folder_names_and_paths={"latent_upscale_models": []},
            get_filename_list=lambda name: ["h3_up.safetensors"], get_full_path_or_raise=lambda *args: "valid")
        config_scope = load_definitions("cap_h3_selflift.py", dict(math=math, folder_paths=folders))
        self.scope["validate_selflift_config"] = config_scope["validate_selflift_config"]
        return {key: options["default"] for key, (_, options) in config_scope["CAP_H3SelfLiftConfig"].INPUT_TYPES()["required"].items()}

    def test_selflift_replaces_two_pass_and_keeps_target_dimensions(self):
        config = self.selflift_config()
        self.run_node(sampling_mode="selflift", selflift_config=config, second_sampling=True,
                      upscaler_model="none", refine_sigmas="invalid")
        names = [name for name, _ in self.calls]
        self.assertIn("SelfLiftH3Sampler", names)
        self.assertNotIn("SamplerCustomAdvanced", names)
        self.assertNotIn("MinimaxH3LatentUpscaler3D", names)
        call = next(kw for name, kw in self.calls if name == "SelfLiftH3Sampler")
        self.assertEqual(call["transition_step"], 6)
        self.assertEqual(call["cfg"], 1.0)
        self.assertFalse(call["highres_tiling"])
        self.assertEqual(next(kw for name, kw in self.calls if name == "BasicScheduler")["scheduler"], "beta")
        self.assertTrue(self.saved)
        self.assertEqual(self.prepared[0][:2], (1376, 768))

    def test_selflift_postprocessing_receives_seeded_noise(self):
        for deblur, face in ((True, False), (False, True), (True, True)):
            with self.subTest(deblur=deblur, face=face):
                self.setUp()
                config = self.selflift_config()
                self.enable_face_refine()
                registered = self.scope["nodes"].NODE_CLASS_MAPPINGS.copy()
                self.enable_motion_deblur()
                self.scope["nodes"].NODE_CLASS_MAPPINGS.update(registered)
                self.run_node(rows=[{"id": "a", "start_ms": 0, "end_ms": 5000, "seed": 42}],
                              sampling_mode="selflift", selflift_config=config, motion_deblur=deblur,
                              face_refine=face, face_refine_config={"configured": True})
                self.assertEqual([kw["noise_seed"] for name, kw in self.calls if name == "RandomNoise"], [42])
                if deblur:
                    self.assertEqual(self.node._deblur_clip.call_args.args[7], "RandomNoise_output")
                if face:
                    self.assertEqual(self.node._refine_faces.call_args.args[5], "RandomNoise_output")
                self.assertEqual(self.saved[0][1]["images"], "face-images" if face else "recovered-images")

    def test_selflift_rejects_incompatible_inputs_before_sampling(self):
        config = self.selflift_config()
        for row in ({"clip_role": "digital_human"}, {"h3_motion_context_length": 22},
                    {"h3_timing": {"context_frames": 22}}):
            with self.subTest(row=row), self.assertRaisesRegex(ValueError, "SelfLift"):
                self.run_node(rows=[{"id": "a", "start_ms": 0, "end_ms": 5000, **row}],
                              sampling_mode="selflift", selflift_config=config)
        for invalid in (None, {**config, "transition_step": 8}, {**config, "rho": float("nan")},
                        {**config, "w_min": 1, "w_max": 0.5}, {**config, "upscaler_model": "../outside"},
                        {**config, "upscaler_model": "none"}):
            with self.subTest(config=invalid), self.assertRaises(ValueError):
                self.run_node(sampling_mode="selflift", selflift_config=invalid)
        with self.assertRaisesRegex(ValueError, "less than 4"):
            self.run_node(steps="4", sampling_mode="selflift", selflift_config=config)
        self.assertFalse(self.calls)

    def test_selflift_four_steps_first_last_and_standard_config_ignored(self):
        config = self.selflift_config()
        config["transition_step"] = 3
        self.run_node(rows=[{"id": "a", "start_ms": 0, "end_ms": 5000, "clip_role": "first_last"}],
                      steps="4", sampling_mode="selflift", selflift_config=config)
        self.assertEqual(next(kw for name, kw in self.calls if name == "SelfLiftH3Sampler")["transition_step"], 3)
        self.calls.clear()
        self.run_node(selflift_config={"invalid": True})
        self.assertNotIn("SelfLiftH3Sampler", [name for name, _ in self.calls])

    def test_digital_human_locks_both_passes_and_saves_source_audio(self):
        source = {"waveform": "original", "sample_rate": 44100}
        self.digital_audio = source
        self.digital_latent = {"samples": SimpleNamespace(unbind=lambda: ("video", "encoded_source"))}
        self.scope["_lock_audio"] = Mock(return_value="locked_refine")
        self.run_node(rows=[{"id": "a", "start_ms": 0, "end_ms": 5000, "seed": 1,
                             "clip_role": "digital_human"}], second_sampling=True, upscaler_model="upscaler",
                      audio_refine=True, motion_deblur=True, face_refine=True)
        sampled = [kw["latent_image"] for name, kw in self.calls if name == "SamplerCustomAdvanced"]
        self.assertEqual(sampled, [self.digital_latent, "locked_refine"])
        self.assertIs(self.saved[0][1]["audio"], source)
        names = [name for name, _ in self.calls]
        self.assertNotIn("VAEDecodeAudio", names)
        self.assertNotIn("H3AudioRefineSampler", names)
        self.assertNotIn("H3JerkOracle", names)


    def test_lora_is_external_and_audio_repair_uses_separate_base(self):
        data = {"width": 1376, "height": 768, "fps": 24,
                "clips": [{"id": "a", "start_ms": 0, "end_ms": 5000, "output_video": "project/a.mp4"}]}
        self.node.generate("with-lora", "clip", "vae", "audio_vae", json.dumps(data),
                           base_model="unpatched", sampling_preview=False, audio_refine=True,
                           second_sampling=True, upscaler_model="up")
        shifts = [kw["model"] for name, kw in self.calls if name == "MiniMaxH3SigmaShift"]
        self.assertEqual(shifts, ["with-lora", "unpatched"])
        self.assertEqual(next(kw["model"] for name, kw in self.calls if name == "BasicScheduler"), "unpatched")
        self.assertFalse(any(name == "LoraLoaderModelOnly" for name, _ in self.calls))

    def test_audio_repair_defaults_to_incoming_lora_model(self):
        data = {"width": 1376, "height": 768, "fps": 24,
                "clips": [{"id": "a", "start_ms": 0, "end_ms": 5000, "output_video": "project/a.mp4"}]}
        self.node.generate("with-lora", "clip", "vae", "audio_vae", json.dumps(data),
                           sampling_preview=False, audio_refine=True,
                           second_sampling=True, upscaler_model="up")
        shifts = [kw["model"] for name, kw in self.calls if name == "MiniMaxH3SigmaShift"]
        self.assertEqual(shifts, ["with-lora", "with-lora"])
        self.assertEqual(next(kw["model"] for name, kw in self.calls if name == "BasicScheduler"), "with-lora")
        self.assertTrue(any(name == "H3AudioRefineSampler" for name, _ in self.calls))

    def test_silent_mode_still_skips_repair_without_base(self):
        self.run_node(audio_refine=True, generate_audio=False, base_model=None)
        self.assertFalse(any(name == "H3AudioRefineSampler" for name, _ in self.calls))
        self.assertEqual(next(kw["model"] for name, kw in self.calls if name == "BasicScheduler"), "base")

    def test_schema_has_no_internal_lora_controls(self):
        self.scope["folder_paths"] = SimpleNamespace(folder_names_and_paths={}, get_filename_list=lambda _: [])
        schema = self.node.INPUT_TYPES()
        self.assertNotIn("lora_name", schema["required"])
        self.assertNotIn("lora_strength", schema["required"])
        self.assertNotIn("filename_prefix", schema["required"])
        self.assertNotIn("first_pass_steps", schema["required"])
        self.assertEqual(schema["optional"]["base_model"][0], "MODEL")
        self.assertFalse(schema["optional"]["motion_deblur"][1]["default"])
        self.assertFalse(schema["optional"]["face_refine"][1]["default"])

    def test_motion_deblur_disabled_does_not_require_mainodes(self):
        lookup = Mock(return_value=object)
        self.scope["_node_class"] = lookup
        self.node._deblur_clip = Mock(side_effect=AssertionError("disabled"))
        self.run_node()
        self.node._deblur_clip.assert_not_called()
        self.assertFalse(set(self.scope["MOTION_NODES"]) & {c.args[0] for c in lookup.call_args_list})
        self.assertFalse(json.loads(self.saved[0][1]["metadata"])["motion_deblur"])

    def test_motion_deblur_missing_requirements_fail_before_sampling(self):
        with self.assertRaisesRegex(ValueError, "base_model"):
            self.run_node(motion_deblur=True, base_model=None)
        self.scope["nodes"].NODE_CLASS_MAPPINGS = {}
        with self.assertRaisesRegex(RuntimeError, "ComfyUI-MAINodes"):
            self.run_node(motion_deblur=True)
        self.assertEqual(self.calls, [])
        self.assertEqual(self.prepared, [])

    def enable_motion_deblur(self):
        self.scope["nodes"].NODE_CLASS_MAPPINGS = dict.fromkeys((*self.scope["MOTION_NODES"], "H3AudioSmear"), object)
        self.node._deblur_clip = Mock(return_value="recovered-images")

    def enable_face_refine(self):
        self.scope["FACE_NODES"] = ("H3FaceTrackCrop", "H3PerFrameDenoise", "H3FaceStitch")
        self.scope["nodes"].NODE_CLASS_MAPPINGS = dict.fromkeys(self.scope["FACE_NODES"], object)
        self.scope["validate_face_config"] = lambda config: config or (_ for _ in ()).throw(ValueError("config required"))
        self.node._refine_faces = Mock(return_value="face-images")

    def test_face_disabled_ignores_connected_config(self):
        self.scope["validate_face_config"] = Mock(side_effect=AssertionError("must not validate"))
        self.run_node(face_refine_config={"invalid": True})
        self.scope["validate_face_config"].assert_not_called()
        self.assertFalse(json.loads(self.saved[0][1]["metadata"])["face_refine"])

    def test_face_missing_config_or_plugin_fails_before_sampling(self):
        self.enable_face_refine()
        with self.assertRaisesRegex(ValueError, "config"):
            self.run_node(face_refine=True)
        self.scope["nodes"].NODE_CLASS_MAPPINGS = {}
        with self.assertRaisesRegex(RuntimeError, "H3-FaceRefine"):
            self.run_node(face_refine=True, face_refine_config={"configured": True})
        self.assertEqual(self.calls, [])

    def test_face_uses_repaired_audio_and_final_context_pixels(self):
        self.enable_face_refine()
        self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True}],
                      face_refine=True, face_refine_config={"configured": True}, audio_refine=True)
        self.assertEqual(self.node._refine_faces.call_args.args[2], "H3AudioRefineSampler_output")
        self.assertEqual([kw["pixels"] for n, kw in self.calls if n == "VAEEncode"], ["face-images"])
        self.assertEqual(self.saved[0][1]["images"], "face-images")
        self.assertEqual(self.saved[0][1]["audio"], "VAEDecodeAudio_output")
        self.assertTrue(json.loads(self.saved[0][1]["metadata"])["face_refine"])

    def test_face_after_deblur_and_silent_two_size_context(self):
        self.enable_face_refine()
        registered = self.scope["nodes"].NODE_CLASS_MAPPINGS.copy()
        self.enable_motion_deblur()
        self.scope["nodes"].NODE_CLASS_MAPPINGS.update(registered)
        self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True}],
                      face_refine=True, face_refine_config={"configured": True}, motion_deblur=True,
                      generate_audio=False, second_sampling=True, upscaler_model="up")
        self.assertEqual(self.node._refine_faces.call_args.args[3], "recovered-images")
        self.assertEqual([kw["pixels"] for n, kw in self.calls if n == "VAEEncode"], ["face-images", "ImageScale_output"])
        self.assertFalse(any(n == "VAEDecodeAudio" for n, _ in self.calls))

    def test_motion_deblur_short_clip_fails_before_sampling(self):
        self.enable_motion_deblur()
        prepare = self.scope["CAP_MiniMaxH3ReferenceToVideo"].execute
        def short_clip(*args, **kwargs):
            result = list(prepare(*args, **kwargs))
            result[2] = 5
            return tuple(result)
        self.scope["CAP_MiniMaxH3ReferenceToVideo"].execute = short_clip
        with self.assertRaisesRegex(ValueError, "22 frames"):
            self.run_node(motion_deblur=True)
        self.assertFalse(any(name == "SamplerCustomAdvanced" for name, _ in self.calls))
        self.assertEqual(self.saved, [])

    def test_motion_deblur_preserves_audio_timing_and_runs_after_decode(self):
        self.enable_motion_deblur()
        self.run_node(motion_deblur=True, audio_refine=True, normalize_audio=True)
        repair = self.node._deblur_clip.call_args.args
        self.assertEqual(repair[0], "base")
        self.assertEqual(repair[3:5], ("VAEDecode_output", "VAEDecodeAudio_output"))
        self.assertEqual(self.saved[0][1]["images"], "recovered-images")
        self.assertEqual(self.saved[0][1]["audio"], "NormalizeAudioLoudness_output")
        phases = [d["phase"] for n, d, _ in self.events if n == "cat_h3_progress"]
        self.assertEqual(phases, ["prepare", "sample", "audio", "decode", "deblur", "save", "compose", "done"])
        self.assertTrue(json.loads(self.saved[0][1]["metadata"])["motion_deblur"])

    def test_motion_deblur_silent_context_uses_repaired_pixels_at_both_sizes(self):
        self.enable_motion_deblur()
        del self.scope["nodes"].NODE_CLASS_MAPPINGS["H3AudioSmear"]
        rows = [{"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True},
                {"id": "b", "start_ms": 5000, "end_ms": 10000,
                 "h3_timing": {"context_frames": 22, "previous_source_clip_id": "a"}}]
        self.run_node(rows, motion_deblur=True, generate_audio=False, second_sampling=True, upscaler_model="up")
        self.assertTrue(all(c.args[4] is None for c in self.node._deblur_clip.call_args_list))
        encoded = [kw["pixels"] for n, kw in self.calls if n == "VAEEncode"]
        self.assertEqual(encoded, ["recovered-images", "ImageScale_output"])
        resize = next(kw for n, kw in self.calls if n == "ImageScale")
        self.assertEqual((resize["image"], resize["width"], resize["height"]), ("recovered-images", 608, 352))
        saved = [kw for n, kw in self.calls if n == "MiniMaxH3MotionContextSaveLatent"]
        self.assertEqual([kw["latent"] for kw in saved], ["LTXVConcatAVLatent_output"] * 2)
        loaded = [kw["latent_path"] for n, kw in self.calls if n == "MiniMaxH3MotionContextLoadLatent"]
        self.assertEqual(loaded, [saved[1]["filename_prefix"] + ".safetensors", saved[0]["filename_prefix"] + ".safetensors"])
        self.assertFalse(any(n in ("H3AudioSmear", "VAEEncodeAudio", "VAEDecodeAudio") for n, _ in self.calls))

    def test_motion_deblur_single_pass_saves_only_repaired_context(self):
        self.enable_motion_deblur()
        self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True}], motion_deblur=True)
        self.assertEqual([kw["pixels"] for n, kw in self.calls if n == "VAEEncode"], ["recovered-images"])
        self.assertEqual([kw["latent"] for n, kw in self.calls if n == "MiniMaxH3MotionContextSaveLatent"], ["LTXVConcatAVLatent_output"])

    def test_output_path_is_required_before_any_clip_is_sampled(self):
        for path in (None, "", "   ", 123):
            with self.subTest(path=path), self.assertRaisesRegex(ValueError, "Clip b.*output_video"):
                self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000},
                               {"id": "b", "start_ms": 5000, "end_ms": 10000, "output_video": path}])
        self.assertEqual(self.prepared, [])
        self.assertEqual(self.saved, [])

    def test_uses_data_json_output_path_without_a_fallback(self):
        result = self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000,
                                 "output_video": "项目/指定片段.mp4"}])
        self.assertEqual(self.saved[0][0], "项目/指定片段.mp4")
        self.assertEqual(result["result"][0], ["项目/指定片段.mp4"])

    def test_internal_preview_uses_current_frames_and_same_clone_for_both_passes(self):
        preview = Mock()
        preview.patch.side_effect = lambda model, *a, **kw: (model,)
        models = []
        class Model:
            def clone(self):
                clone = SimpleNamespace(remove_wrappers_with_key=Mock())
                models.append(clone)
                return clone
        model = Model()
        call = self.scope["_call"]
        self.scope["_call"] = lambda name, records, **kw: (model,) if name == "MiniMaxH3SigmaShift" else call(name, records, **kw)
        self.scope["CAP_ModelPreviewOverride"] = lambda: preview
        self.scope["WrappersMP"] = SimpleNamespace(OUTER_SAMPLE="outer")
        prepare = self.scope["CAP_MiniMaxH3ReferenceToVideo"].execute
        def varying_frames(*args, **kw):
            result = list(prepare(*args, **kw))
            result[2] = 124 + args[8] * 17
            return tuple(result)
        self.scope["CAP_MiniMaxH3ReferenceToVideo"].execute = varying_frames
        rows = [{"id": "a", "start_ms": 0, "end_ms": 5000}, {"id": "b", "start_ms": 5000, "end_ms": 11000}]
        self.run_node(rows, sampling_preview=True, preview_tiny_vae="taeh3.safetensors", unique_id="execution",
                      dynprompt=SimpleNamespace(get_display_node_id=lambda _: "12:34"),
                      second_sampling=True, upscaler_model="up", audio_refine=True)
        self.assertEqual([c.args[4] for c in preview.patch.call_args_list], [124, 141])
        self.assertEqual([c.args[5] for c in preview.patch.call_args_list], [24, 24])
        ids = [c.kwargs["unique_id"] for c in preview.patch.call_args_list]
        self.assertNotEqual(ids[0], ids[1])
        self.assertTrue(all(i.startswith("12:34::h3:") for i in ids))
        self.assertTrue(all(c.kwargs["tiny_vae"] == "taeh3.safetensors" for c in preview.patch.call_args_list))
        for clone in models:
            clone.remove_wrappers_with_key.assert_called_once_with("outer", "kj_preview_override")
        guiders = [kw["model"] for name, kw in self.calls if name == "BasicGuider"]
        self.assertEqual(guiders, [models[0], models[0], models[1], models[1]])
        self.assertTrue(all(kw["model"] is model for name, kw in self.calls if name == "H3FrozenVideoCache"))
        starts = [e for e in self.events if e[0] == "cat_h3_preview_started"]
        self.assertEqual([e[1]["preview_id"] for e in starts], ids)
        self.assertEqual([e[1]["node_id"] for e in starts], ["12:34", "12:34"])
        self.assertEqual([e[1]["clip_id"] for e in starts], ["a", "b"])

    def test_preview_off_does_not_require_kj(self):
        lookup = Mock(return_value=object)
        self.scope["_node_class"] = lookup
        self.run_node(sampling_preview=False)
        self.assertNotIn("ModelPreviewOverrideKJ", [c.args[0] for c in lookup.call_args_list])
        self.assertFalse(any(e[0] == "cat_h3_preview_started" for e in self.events))

    def test_single_pass_seed_and_output_contract(self):
        result = self.run_node(steps="4")
        row = json.loads(result["result"][1])["clips"][0]
        self.assertEqual((row["start_ms"], row["end_ms"]), (0, 5000))
        self.assertGreaterEqual(row["seed"], 0)
        self.assertEqual(self.saved[0][1]["seed"], row["seed"])
        self.assertEqual(result["result"][0], [row["output_video"]])
        self.assertEqual(self.node.OUTPUT_IS_LIST, (True, False, False))
        self.assertFalse(any(n == "MinimaxH3LatentUpscaler3D" for n, _ in self.calls))
        self.assertEqual(next(k["steps"] for n, k in self.calls if n == "BasicScheduler"), 4)

    def test_two_pass_reuses_noise_and_full_schedule_denoised_output(self):
        self.run_node(second_sampling=True, steps="8", upscaler_model="up.safetensors",
                      audio_refine=True, normalize_audio=True)
        samples = [kw for n, kw in self.calls if n == "SamplerCustomAdvanced"]
        self.assertEqual(len(samples), 2)
        self.assertEqual(samples[0]["noise"], samples[1]["noise"])
        self.assertEqual(next(k["av_latent"] for n, k in self.calls if n == "LTXVSeparateAVLatent"), "denoised")
        self.assertEqual(next(k["steps"] for n, k in self.calls if n == "BasicScheduler"), 8)
        self.assertEqual(samples[0]["sigmas"], "BasicScheduler_output")
        self.assertFalse(any(n == "SplitSigmas" for n, _ in self.calls))
        seed = self.saved[0][1]["seed"]
        self.assertEqual(next(k["seed"] for n, k in self.calls if n == "H3AudioRefineSampler"), seed)

    def test_single_pass_ignores_first_pass_megapixels(self):
        size = Mock()
        self.scope["CAP_SizeFromMegapixels"] = size
        self.run_node(second_sampling=False, steps="4", first_pass_megapixels=0.01)
        size.assert_not_called()
        self.assertEqual([(w, h) for w, h, _, _ in self.prepared], [(1376, 768)])
        self.assertEqual(next(k["steps"] for n, k in self.calls if n == "BasicScheduler"), 4)
        self.assertEqual(sum(n == "SamplerCustomAdvanced" for n, _ in self.calls), 1)

    def test_two_pass_uses_low_resolution_then_project_dimensions(self):
        size = Mock(return_value=SimpleNamespace(execute=Mock(return_value=(608, 352, .2, 32))))
        self.scope["CAP_SizeFromMegapixels"] = size
        self.run_node(second_sampling=True, upscaler_model="up", first_pass_megapixels=0.2, steps="4")
        size.return_value.execute.assert_called_once_with(1376, 768, 0.2, 32)
        self.assertEqual([(w, h) for w, h, _, _ in self.prepared], [(608, 352)])
        upscale = next(k for n, k in self.calls if n == "MinimaxH3LatentUpscaler3D")
        self.assertEqual((upscale["mode"]["width"], upscale["mode"]["height"]), (1376, 768))
        self.assertEqual(next(k["steps"] for n, k in self.calls if n == "BasicScheduler"), 4)

    def test_silent_video_skips_audio_work_and_dependencies(self):
        lookup = Mock(return_value=object)
        self.scope["_node_class"] = lookup
        rows = [{"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True},
                {"id": "b", "start_ms": 5000, "end_ms": 10000,
                 "h3_timing": {"context_frames": 22, "previous_source_clip_id": "a"}}]
        result = self.run_node(rows, generate_audio=False, audio_refine=True, normalize_audio=True,
                               second_sampling=True, upscaler_model="up")
        skipped = {"H3FrozenVideoCache", "H3AudioRefineSampler", "VAEDecodeAudio", "NormalizeAudioLoudness"}
        self.assertTrue(skipped.isdisjoint(name for name, _ in self.calls))
        self.assertTrue(skipped.isdisjoint(c.args[0] for c in lookup.call_args_list))
        self.assertTrue(all(kw["audio"] is None for _, kw in self.saved))
        self.assertFalse(self.composed[0][1]["use_original_audio"])
        for _, kw in self.saved:
            metadata = json.loads(kw["metadata"])
            self.assertFalse(metadata["generate_audio"])
            self.assertFalse(metadata["audio_refine"])
            self.assertFalse(metadata["normalize_audio"])
        self.assertEqual(sum(n == "SamplerCustomAdvanced" for n, _ in self.calls), 4)
        self.assertEqual(sum(n == "MiniMaxH3MotionContextLoadLatent" for n, _ in self.calls), 2)
        self.assertEqual(sum(n == "LTXVConcatAVLatent" for n, _ in self.calls), 2)
        self.assertFalse(any(n == "cat_h3_progress" and d["phase"] == "audio" for n, d, _ in self.events))
        self.assertEqual(result["ui"]["h3_progress"][0]["percent"], 100)

    def test_audio_generation_without_repair(self):
        self.run_node(generate_audio=True, audio_refine=False)
        self.assertTrue(any(n == "VAEDecodeAudio" for n, _ in self.calls))
        self.assertFalse(any(n in ("H3AudioRefineSampler", "H3FrozenVideoCache") for n, _ in self.calls))
        self.assertEqual(self.saved[0][1]["audio"], "VAEDecodeAudio_output")
        self.assertTrue(self.composed[0][1]["use_original_audio"])

    def test_silent_single_pass_without_compose(self):
        self.run_node(generate_audio=False, compose_final=False, audio_refine=True)
        self.assertIsNone(self.saved[0][1]["audio"])
        self.assertEqual(self.composed, [])
        self.assertEqual(sum(n == "SamplerCustomAdvanced" for n, _ in self.calls), 1)

    def test_exact_context_owner_even_with_interleaved_track(self):
        rows = [
            {"id": "a", "start_ms": 0, "end_ms": 5000, "save_latent": True},
            {"id": "other", "start_ms": 0, "end_ms": 5000, "save_latent": True, "z_index": 1},
            {"id": "b", "start_ms": 5000, "end_ms": 10000,
             "h3_timing": {"context_frames": 22, "previous_source_clip_id": "a"}},
        ]
        self.run_node(rows, second_sampling=True, upscaler_model="up.safetensors")
        saves = [k["filename_prefix"] for n, k in self.calls if n == "MiniMaxH3MotionContextSaveLatent"]
        loads = [k["latent_path"] for n, k in self.calls if n == "MiniMaxH3MotionContextLoadLatent"]
        self.assertEqual(loads, [saves[0] + ".safetensors", saves[1] + ".safetensors"])
        self.assertNotIn(saves[2] + ".safetensors", loads)

    def test_missing_chain_fails_before_sampling(self):
        with self.assertRaisesRegex(ValueError, "preceding Clip a"):
            self.run_node([{"id": "b", "start_ms": 5000, "end_ms": 10000,
                            "h3_timing": {"context_frames": 22, "previous_source_clip_id": "a"}}])
        self.assertEqual(self.calls, [])

    def test_strict_second_pass_reencodes_high_resolution_anchors(self):
        self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "clip_role": "first_last"}],
                      second_sampling=True, upscaler_model="up.safetensors")
        self.assertEqual([(w, h) for w, h, _, _ in self.prepared], [(608, 352), (1376, 768)])
        self.assertTrue(all(kw["strict_keyframes"] for _, _, _, kw in self.prepared))

    def test_frame_mode_is_selected_per_clip(self):
        self.assertNotIn("strict_keyframes", self.node.generate.__code__.co_varnames[:self.node.generate.__code__.co_argcount])
        self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "clip_role": "first_last"},
                       {"id": "b", "start_ms": 5000, "end_ms": 10000, "clip_role": "multi_ref"}])
        self.assertEqual([kw["strict_keyframes"] for _, _, _, kw in self.prepared], [True, False])

    def test_first_last_clip_rejects_motion_context(self):
        with self.assertRaisesRegex(ValueError, "Motion Context"):
            self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000, "clip_role": "first_last",
                            "h3_motion_context_length": 22}])
        self.assertEqual(self.calls, [])

    def test_validation(self):
        for kw in ({"steps": "6"}, {"second_sampling": True},
                   {"second_sampling": True, "upscaler_model": "up", "refine_sigmas": "0.3,0.8,0"}):
            with self.subTest(kw=kw), self.assertRaises(ValueError):
                self.run_node(**kw)
        with self.assertRaisesRegex(ValueError, "director"):
            self.run_node([{"id": "a", "clip_type": "video", "start_ms": 0, "end_ms": 5000}])

    def test_each_video_is_sent_before_next_clip_and_final_compose_is_default(self):
        rows = [{"id": "a", "start_ms": 0, "end_ms": 5000}, {"id": "b", "start_ms": 5000, "end_ms": 10000}]
        dynamic = SimpleNamespace(get_display_node_id=lambda uid: "12:34")
        result = self.run_node(rows, unique_id="execution-id", dynprompt=dynamic)
        ready = [e for e in self.events if e[0] == "cat_h3_video_ready"]
        self.assertEqual([e[2] for e in ready], [1, 2, 2])
        self.assertEqual([e[1]["video"].get("clip_id") for e in ready], ["a", "b", None])
        self.assertTrue(all(e[1]["node_id"] == "12:34" for e in ready))
        self.assertEqual(result["result"][2], "compose/final.mp4")
        self.assertEqual(result["ui"]["video"], [ready[-1][1]["video"]])
        self.assertEqual(len(result["result"][0]), 2, "composition does not replace the per-clip filename list")
        self.assertEqual(len(self.composed), 1, "compose once for the entire data_json, not once per Clip")
        data, options = self.composed[0]
        self.assertTrue(options["trim_extends"])
        self.assertTrue(options["use_original_audio"])
        self.assertEqual([r["output_video"] for r in data["clips"]], result["result"][0])

    def test_compose_off_keeps_latest_clip_and_stable_completion_preview(self):
        result = self.run_node(compose_final=False)
        ready = [e for e in self.events if e[0] == "cat_h3_video_ready"]
        self.assertEqual(len(ready), 1)
        self.assertEqual(result["ui"]["video"], [ready[0][1]["video"]])
        self.assertEqual(result["result"][2], "")
        self.assertEqual(self.composed, [])

    def test_progress_counts_actual_clips_and_enabled_stages(self):
        rows = [{"id": "a", "start_ms": 0, "end_ms": 5000}, {"id": "b", "start_ms": 5000, "end_ms": 10000}]
        result = self.run_node(rows, second_sampling=True, upscaler_model="up", audio_refine=True,
                               unique_id="execution", dynprompt=SimpleNamespace(get_display_node_id=lambda _: "12:34"))
        updates = [data for name, data, _ in self.events if name == "cat_h3_progress"]
        phases = ["prepare", "sample", "upscale", "refine", "audio", "decode", "save"]
        self.assertEqual([u["phase"] for u in updates], phases * 2 + ["compose", "done"])
        self.assertEqual([u["clip_index"] for u in updates], [1] * 7 + [2] * 9)
        self.assertTrue(all(u["clip_total"] == 2 and u["node_id"] == "12:34" for u in updates))
        percentages = [u["percent"] for u in updates]
        self.assertEqual(percentages, sorted(percentages))
        self.assertEqual(percentages[0], 0)
        self.assertTrue(all(p < 100 for p in percentages[:-1]))
        self.assertEqual(percentages[-1], 100)
        self.assertEqual(result["ui"]["h3_progress"], [updates[-1]])

    def test_progress_without_preview_or_compose_still_completes(self):
        self.run_node(sampling_preview=False, compose_final=False)
        updates = [data for name, data, _ in self.events if name == "cat_h3_progress"]
        self.assertEqual([u["phase"] for u in updates], ["prepare", "sample", "decode", "save", "done"])
        self.assertEqual([u["percent"] for u in updates], [0, 25, 50, 75, 100])

    def test_generator_events_include_workflow_identity(self):
        self.run_node(extra_pnginfo={"workflow": {"id": "workflow-a"}})
        updates = [data for name, data, _ in self.events if name in ("cat_h3_progress", "cat_h3_video_ready")]
        self.assertTrue(updates)
        self.assertTrue(all(data["workflow_id"] == "workflow-a" for data in updates))

    def test_compose_preserves_timing_and_explicit_disabled_run_scope(self):
        row = {"id": "a", "start_ms": 0, "end_ms": 5000, "enabled": False,
               "h3_timing": {"context_frames": 0, "raw_frames": 124, "tail_frames": 4},
               "playback_spans": [{"source_clip_id": "a", "start_frame": 0, "frame_count": 120}]}
        result = self.run_node([row])
        rendered = self.composed[0][0]["clips"][0]
        self.assertTrue(rendered["enabled"])
        self.assertEqual(rendered["h3_timing"], row["h3_timing"])
        self.assertEqual(rendered["playback_spans"][0]["frame_count"], 120)
        self.assertFalse(json.loads(result["result"][1])["clips"][0]["enabled"])

    def test_second_clip_failure_leaves_first_preview_without_composing(self):
        generate = self.node._generate_clip
        def fail_second(*args):
            if args[6] == 1:
                raise RuntimeError("sampling interrupted")
            return generate(*args)
        self.node._generate_clip = fail_second
        with self.assertRaisesRegex(RuntimeError, "sampling interrupted"):
            self.run_node([{"id": "a", "start_ms": 0, "end_ms": 5000}, {"id": "b", "start_ms": 5000, "end_ms": 10000}])
        self.assertEqual(len([e for e in self.events if e[0] == "cat_h3_video_ready"]), 1)
        self.assertEqual(self.composed, [])

        self.assertFalse(any(name == "cat_h3_progress" and data["phase"] == "done"
                             for name, data, _ in self.events))


class StrictKeyframeTests(unittest.TestCase):
    def setUp(self):
        path = BACKEND / "cap_minimax_h3.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        tree.body = [n for n in tree.body if isinstance(n, (ast.ClassDef, ast.FunctionDef)) and n.name in ("CAP_MiniMaxH3ReferenceToVideo", "_snap_h3_grid")]
        self.native = Mock(return_value=SimpleNamespace(args=("positive", "latent")))
        self.reference = Mock(return_value=SimpleNamespace(args=("positive", "latent")))
        self.scope = dict(nodes=SimpleNamespace(MAX_RESOLUTION=16384), H3_FPS=24, align_frame_count=lambda x: x,
                          os=SimpleNamespace(path=SimpleNamespace(isfile=lambda p: True)),
                          CAP_DataJsonClipParser=object, torch=SimpleNamespace(Tensor=object, zeros=lambda *a: "blank"), MAX_REF_IMAGES=9, MAX_REF_VIDEOS=3, MAX_REF_AUDIOS=3,
                          _kind_of=lambda row, path: row.get("kind", "image"),
                          MiniMaxH3ImageToVideo=SimpleNamespace(execute=self.native),
                          MiniMaxH3ReferenceToVideo=SimpleNamespace(execute=self.reference))
        exec(compile(tree, str(path), "exec"), self.scope)
        self.node = self.scope["CAP_MiniMaxH3ReferenceToVideo"]()
        self.node._stack_frames = lambda frames, blank: frames
        self.node._visual_refs = lambda row, parser: row.get("images", [])
        self.node._material_for_ref = lambda ref, materials, parser: (ref["file"], ref)
        self.parser = SimpleNamespace(_load_image=lambda path: path, _compose_prompt=lambda *a, **kw: "prompt",
                                      _uses_master_audio=lambda *a: False, _clip_audio_from_audios=lambda *a, **kw: None)

    def prepare(self, images, strict=True, **extra):
        row = {"start_ms": 0, "end_ms": 5000, "images": images, **extra}
        self.node._parse_clip = lambda *a: ({"fps": 24}, row, {}, self.parser)
        return self.node.execute("clip", "vae", "audio_vae", 864, 480, "match", "{}", 0, strict_keyframes=strict)

    def test_ordered_anchors_and_default_reference_mode(self):
        images = [{"file": "first"}, {"file": "last"}]
        self.prepare(images)
        self.assertEqual(self.native.call_args.kwargs, {"first_frame": "first", "last_frame": "last"})
        self.reference.assert_not_called()
        self.prepare(images, strict=False)
        self.assertEqual(self.reference.call_count, 1)

    def test_single_first_frame(self):
        self.prepare([{"file": "first"}])
        self.assertIsNone(self.native.call_args.kwargs["last_frame"])

    def test_standalone_digital_human_returns_locked_latent_and_aligned_audio(self):
        self.parser._uses_master_audio = lambda *a: True
        self.parser._clip_audio_from_master = lambda *a: "source_audio"
        lock = Mock(return_value=("locked_latent", "aligned_source", "encoded"))
        self.scope["_digital_human_audio"] = lock
        result = self.prepare([{"file": "portrait"}], strict=False, clip_role="digital_human")
        self.assertEqual(result[1], "locked_latent")
        self.assertEqual(result[6], "aligned_source")
        lock.assert_called_once_with("latent", "source_audio", "audio_vae", result[2], 0)
        self.assertIn("vocal pauses", result[3])

    def test_standalone_digital_human_rejects_missing_audio(self):
        with self.assertRaisesRegex(ValueError, "requires an audio clip"):
            self.prepare([{"file": "portrait"}], strict=False, clip_role="digital_human")

    def test_rejects_mixed_refs_empty_refs_and_context(self):
        for images, extra in (([], {}), ([{"file": "v", "kind": "video"}], {}),
                              ([{"file": str(i)} for i in range(3)], {}),
                              ([{"file": "i"}], {"audios": [{"file": "a"}]}),
                              ([{"file": "i"}], {"h3_motion_context_length": 22})):
            with self.subTest(images=images, extra=extra), self.assertRaises(ValueError):
                self.prepare(images, **extra)
        self.native.assert_not_called()

    def test_existing_widget_order_is_preserved(self):
        optional = list(self.node.INPUT_TYPES()["optional"])
        self.assertEqual(optional, ["clip_json", "context_latent", "strict_keyframes"])


class DigitalHumanAudioTests(unittest.TestCase):
    def test_editor_export_preserves_digital_human_role(self):
        path = BACKEND / "cap_timeline_editor.py"
        tree = ast.parse(path.read_text(encoding="utf-8"))
        tree.body = [n for n in tree.body if
                     isinstance(n, ast.FunctionDef) and n.name == "_clip_role_fields" or
                     isinstance(n, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "_CLIP_ROLES" for t in n.targets)]
        scope = {}
        exec(compile(tree, str(path), "exec"), scope)
        self.assertEqual(scope["_clip_role_fields"]({"clip_role": "digital_human"}), ("digital_human", ""))

    def test_waveform_padding_and_audio_lock_preserve_pauses(self):
        import torch
        nested = lambda parts: SimpleNamespace(unbind=lambda: parts)
        scope = load_definitions("cap_minimax_h3.py", {
            "logging": logging, "torch": torch, "CAP_DataJsonClipParser": object, "comfy": SimpleNamespace(nested_tensor=SimpleNamespace(NestedTensor=nested)),
        })
        video = torch.zeros(1, 24, 2, 2, 2)
        template = torch.zeros(1, 32, 2, 40)
        source = {"waveform": torch.tensor([[[1., 0., 0., .5]]]), "sample_rate": 8}
        encode = Mock(return_value=torch.full((1, 32, 2, 39), 3.))
        vae = SimpleNamespace(audio_sample_rate=8, encode=encode)
        latent, fitted, encoded = scope["_digital_human_audio"](
            {"samples": nested((video, template))}, source, vae, 24, 6)
        self.assertEqual(fitted["waveform"].tolist(), [[[0., 0., 1., 0., 0., .5, 0., 0.]]])
        self.assertEqual(encoded.shape, template.shape)
        video_mask, audio_mask = latent["noise_mask"].unbind()
        self.assertTrue(torch.all(video_mask == 1))
        self.assertTrue(torch.all(audio_mask == 0))
        self.assertTrue(torch.all(encoded == 3))
        self.assertEqual(source["waveform"].shape[-1], 4)

    def test_missing_audio_fails_before_encoding(self):
        scope = load_definitions("cap_minimax_h3.py", {"logging": logging, "CAP_DataJsonClipParser": object, "torch": SimpleNamespace(Tensor=object)})
        with self.assertRaisesRegex(ValueError, "requires an audio clip"):
            scope["_digital_human_audio"]({}, None, None, 124, 0)



class NodeAdapterTests(unittest.TestCase):
    def test_normalizes_native_and_legacy_results_without_recording_tensors(self):
        class Native:
            @classmethod
            def execute(cls, seed, latent):
                return SimpleNamespace(args=(seed, latent))

        class Legacy:
            FUNCTION = "run"

            def run(self, seed, latent):
                return {"result": (seed, latent), "ui": {}}

        scope = load_definitions("cap_h3_video_generator.py", {
            "nodes": SimpleNamespace(NODE_CLASS_MAPPINGS={"native": Native, "legacy": Legacy}),
            "io": SimpleNamespace(ComfyNode=Native),
        })
        records, tensor = {}, object()
        for name in ("native", "legacy"):
            self.assertEqual(scope["_call"](name, records, seed=42, latent=tensor), (42, tensor))
        self.assertTrue(all(r["inputs"] == {"seed": 42} for r in records.values()))
        with self.assertRaisesRegex(RuntimeError, "requires the installed node"):
            scope["_call"]("missing", records)


if __name__ == "__main__":
    unittest.main()
