import importlib
import json
from pathlib import Path
import shutil
import sys
import tempfile
import types
import unittest
import textwrap

ROOT = (Path(__file__).resolve().parents[1] / "backend")
package = types.ModuleType("cap_metadata_test")
package.__path__ = [str(ROOT)]
sys.modules[package.__name__] = package
metadata = importlib.import_module("cap_metadata_test.cap_video_metadata")


class GenerationMetadataTests(unittest.TestCase):
    def test_save_embeds_prompt_and_clip_details_without_sidecar(self):
        source = (ROOT / 'cap_seq_to_video.py').read_text(encoding='utf-8')
        block = source[source.index('        graph = execution_graph(prompt, dynprompt, unique_id)'):]
        block = block[:block.index('        if save_sidecar:')]
        records = []
        note = json.dumps({'h3_timing': {'context_frames': 22}, 'second_sampling': True})
        scope = dict(execution_graph=metadata.execution_graph, generation_record=metadata.generation_record,
                     prompt={'1': {'class_type': 'MiniMaxH3ReferenceToVideo', 'inputs': {'prompt': 'A speaking character'}}},
                     dynprompt=None, unique_id=None, clip_id='clip_opt_06', seed=123,
                     fps=24, frame_count=226, video_duration=226/24, metadata=note,
                     output_path='video.mp4', embed_video_generation=lambda path, record: records.append(record))
        exec(textwrap.dedent(block), scope)
        self.assertEqual(records[0]['prompts'][0]['text'], 'A speaking character')
        self.assertEqual(json.loads(records[0]['note'])['h3_timing']['context_frames'], 22)
        self.assertEqual(records[0]['frames'], 226)

    def test_scope_and_unknown_linked_seed(self):
        graph = {
            "1": {"class_type": "RandomNoise", "inputs": {"noise_seed": ["2", 10]}},
            "2": {"class_type": "CAP_MiniMaxH3", "inputs": {}},
            "3": {"class_type": "CAP_SeqToVideo", "inputs": {"images": ["1", 0]}},
            "4": {"class_type": "KSampler", "inputs": {"seed": 999}},
        }
        scoped = metadata.execution_graph(graph, unique_id="3")
        self.assertNotIn("4", scoped)
        self.assertIsNone(metadata.generation_record(scoped)["seed"])
        self.assertEqual(metadata.generation_record(scoped, "clip1", 0)["seed"], "0")

    def test_literal_seed_and_parameters(self):
        record = metadata.generation_record({"1": {"class_type": "KSampler", "inputs": {
            "seed": 18446744073709551615, "steps": 4, "cfg": 1.0, "sampler_name": "euler"}}})
        self.assertEqual(record["seed"], "18446744073709551615")
        self.assertEqual(record["sampling"][0]["parameters"]["steps"], 4)

    @unittest.skipUnless(shutil.which("ffmpeg") and shutil.which("ffprobe"), "FFmpeg required")
    def test_mp4_roundtrip_preserves_streams_and_tags(self):
        with tempfile.TemporaryDirectory() as temp:
            path = str(Path(temp) / "sample.mp4")
            metadata._run(["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "color=s=64x48:r=24:d=0.5",
                           "-f", "lavfi", "-i", "sine=frequency=440:duration=0.5", "-c:v", "libx264",
                           "-c:a", "aac", "-metadata", "title=Original title", path])
            def packets():
                return json.loads(metadata._run(["ffprobe", "-v", "error", "-show_packets",
                    "-show_data_hash", "sha256", "-show_entries", "packet=stream_index,pts,dts,duration,data_hash",
                    "-of", "json", path]))
            before = packets()
            self.assertIsNone(metadata.read_video_generation(path))
            record = metadata.generation_record({}, "中文#;=\\\n片段", 123)
            record.update(note=json.dumps({'h3_timing': {'context_frames': 22}}),
                          prompts=[{'text': '角色说话\n保持口型同步'}], fps=24, frames=12)
            metadata.embed_video_generation(path, record)
            self.assertEqual(metadata.read_video_generation(path), record)
            self.assertEqual(packets(), before)
            tags = json.loads(metadata._run(["ffprobe", "-v", "error", "-show_entries", "format_tags", "-of", "json", path]))
            self.assertEqual(tags["format"]["tags"]["title"], "Original title")


if __name__ == "__main__":
    unittest.main()
