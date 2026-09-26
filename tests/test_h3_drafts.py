import copy
import json
import math
from pathlib import Path
import re
import secrets
import sys
import tempfile
from types import SimpleNamespace
import unittest

import torch
from safetensors.torch import load_file, save_file

from test_h3_video_generator import load_definitions

sys.path.insert(0, str(Path(__file__).resolve().parents[3]))
from comfy.nested_tensor import NestedTensor


class DraftStorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.scope = load_definitions('cap_h3_drafts.py', dict(
            copy=copy, json=json, math=math, Path=Path, re=re, secrets=secrets,
            folder_paths=SimpleNamespace(get_output_directory=lambda: self.temp.name),
            NestedTensor=NestedTensor, save_file=save_file, load_file=load_file))
        self.row = dict(id='clip-1', seed=17, prompt='Original prompt', start_ms=0, end_ms=5000, output_video='out.mp4')
        self.data = dict(width=1376, height=768, fps=24, clips=[self.row])

    def test_roundtrip_preserves_av_dtype_masks_and_input_snapshot(self):
        video = torch.arange(24, dtype=torch.float16).reshape(1, 2, 3, 2, 2)
        audio = torch.ones(1, 4, 7, dtype=torch.float32)
        latent = dict(samples=NestedTensor([video, audio]), noise_mask=NestedTensor([torch.ones_like(video), torch.zeros_like(audio)]))
        manifest = self.scope['save_draft'](latent, self.data, 0, 608, 352, 124, 'Original prompt', 8)
        self.row.update(prompt='Changed', seed=999)
        self.scope['finish_draft'](manifest, 'preview.mp4')
        read = self.scope['read_draft'](manifest['id'])
        loaded = self.scope['load_draft_latent'](read)
        for original, restored in zip(latent['samples'].unbind(), loaded['samples'].unbind()):
            self.assertEqual(original.dtype, restored.dtype)
            self.assertTrue(torch.equal(original, restored))
        self.assertEqual(loaded['noise_mask'].unbind()[1].sum(), 0)
        restored, _ = self.scope['restore_draft'](self.data, manifest['id'])
        self.assertEqual(restored['clips'][0]['prompt'], 'Original prompt')
        self.assertEqual(restored['clips'][0]['seed'], 17)
        self.assertEqual(restored['clips'][0]['output_video'], 'out.mp4')
        self.data['fps'] = 30
        with self.assertRaisesRegex(ValueError, 'fps changed'):
            self.scope['restore_draft'](self.data, manifest['id'])

    def test_latest_preview_skips_disabled_missing_and_incompatible_versions(self):
        latent = {"samples": torch.zeros(1, 2, 3)}
        older = self.scope['save_draft'](latent, self.data, 0, 608, 352, 124, 'older', 8)
        newer = self.scope['save_draft'](latent, self.data, 0, 608, 352, 124, 'newer', 8)
        self.row['h3_drafts'] = [{'id': newer['id']}, {'id': older['id']}]
        self.assertEqual(self.scope['latest_draft'](self.data, self.row)[1]['id'], newer['id'])
        self.row['h3_drafts'][0]['enabled'] = False
        self.row['h3_drafts'].insert(0, {'id': 'f' * 32})
        self.assertEqual(self.scope['latest_draft'](self.data, self.row)[1]['id'], older['id'])
        self.data['fps'] = 30
        self.assertIsNone(self.scope['latest_draft'](self.data, self.row))

    def test_bad_ids_and_missing_versions_fail_explicitly(self):
        for version in ('../outside', '/tmp/file', 'C:\\file', '', None):
            with self.subTest(version=version), self.assertRaises(ValueError):
                self.scope['read_draft'](version)
        with self.assertRaisesRegex(ValueError, 'missing'):
            self.scope['read_draft']('a' * 32)


if __name__ == '__main__':
    unittest.main()
