"""Frame-boundary checks and real ffmpeg dataset export, no ComfyUI/GPU required."""
import asyncio
import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import sys
import tempfile
import threading
import types
import unittest

from aiohttp import FormData, web
from aiohttp.test_utils import TestClient, TestServer

ROOT = Path(__file__).resolve().parents[1]
package = types.ModuleType('training_test_backend')
package.__path__ = [str(ROOT / 'backend')]
sys.modules[package.__name__] = package
spec = importlib.util.spec_from_file_location('training_test_backend.cap_training_dataset', ROOT / 'backend/cap_training_dataset.py')
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class BoundaryTests(unittest.TestCase):
    def test_short_scenes_cannot_borrow_frames(self):
        for row in [dict(start=0,end=5), dict(start=0,end=6,offset=1), dict(start=.01,end=124/24),
                    dict(start=0,end=10,offset=float('nan')),dict(start=-1,end=10),dict(start=0,end=11)]:
            with self.assertRaises(ValueError): module.validate_clip(row,10,124)

    def test_exact_length_and_inward_quantization(self):
        self.assertEqual(module.validate_clip(dict(start=0,end=124/24),124/24,124),(0,''))
        self.assertEqual(module.validate_clip(dict(start=.01,end=6,offset=1/24,caption=' test '),10,124),(1/24,'test'))

    def test_h3_geometry(self):
        for settings in [dict(frames=120),dict(frames=125),dict(width=513),dict(height=0),dict(fit='stretch')]:
            with self.assertRaises(ValueError): module.validate_settings(settings)

    def test_invalid_crop_is_rejected(self):
        for crop in [{'zoom':0}, {'zoom':5}, {'x':-1}, {'y':2}, {'zoom':float('nan')}]:
            with self.assertRaises(ValueError): module.validate_settings({'crop':crop})


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'),'ffmpeg required')
class ExportTests(unittest.IsolatedAsyncioTestCase):
    async def test_crop_position_changes_actual_export_pixels(self):
        source=self.root/'bands.mp4'
        module.run_media(['ffmpeg','-v','error','-f','lavfi','-i','color=red:size=160x96:rate=24',
                          '-vf','drawbox=x=0:y=48:w=160:h=48:color=blue:t=fill',
                          '-t','6','-c:v','libx264',str(source)])
        for y, channel in [(0,0),(1,2)]:
            dest=self.root/f'crop-{y}.mp4'
            settings=module.validate_settings({'width':128,'height':64,'crop':{'zoom':2,'x':.5,'y':y}})
            await asyncio.to_thread(module.encode_clip,source,dest,0,settings,threading.Event())
            data=module.subprocess.run(['ffmpeg','-v','error','-i',str(dest),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True,check=True).stdout
            averages=[sum(data[c::3])/len(data[c::3]) for c in range(3)]
            self.assertGreater(averages[channel],200)
            self.assertLess(averages[2-channel],30)

    async def asyncSetUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.root=Path(self.temp.name)
        self.video=self.root/'source.mp4'
        module.run_media(['ffmpeg','-v','error','-f','lavfi','-i','testsrc2=size=160x96:rate=30',
                          '-t','7','-c:v','libx264','-pix_fmt','yuv420p',str(self.video)])
        routes=web.RouteTableDef()
        module.register_training_dataset_routes(routes,str(self.root),str(self.root/'output'))
        app=web.Application();app.add_routes(routes)
        self.client=TestClient(TestServer(app));await self.client.start_server()
        response=await self.client.post('/cap/training_dataset/source',json={'path':str(self.video)})
        self.source=await response.json()

    async def asyncTearDown(self):
        await self.client.close();self.temp.cleanup()

    async def upload_bytes(self, payload, name='9月29日.mp4'):
        data = FormData(quote_fields=False)
        data.add_field('file', payload, filename=name, content_type='video/mp4')
        response = await self.client.post('/cap/training_dataset/upload', data=data)
        self.assertEqual(response.status, 200, await response.text())
        return await response.json()

    async def test_preflight_finds_existing_uuid_by_content(self):
        original = self.video.read_bytes()
        digest = hashlib.sha256(hashlib.sha256(original).digest()).hexdigest()
        old_path = self.root / ('a' * 32 + '.mp4')
        self.video.rename(old_path)
        response = await self.client.post('/cap/training_dataset/lookup', json={'size':len(original), 'fingerprint':digest})
        self.assertEqual(response.status, 200)
        self.assertEqual(Path((await response.json())['source']['path']), old_path)
        uploaded = await self.upload_bytes(original)
        self.assertEqual(Path(uploaded['path']), old_path)
        self.assertEqual(len(list(self.root.rglob('*.mp4'))), 1)

    async def test_upload_preserves_name_and_deduplicates_concurrent_uploads(self):
        original = self.video.read_bytes() + b'first'
        one, two = await asyncio.gather(self.upload_bytes(original), self.upload_bytes(original))
        self.assertEqual(one['path'], two['path'])
        self.assertEqual(Path(one['path']).name, '9月29日.mp4')
        other = await self.upload_bytes(self.video.read_bytes() + b'second')
        self.assertNotEqual(one['path'], other['path'])
        self.assertEqual(Path(other['path']).name, '9月29日 (1).mp4')
        self.assertEqual(Path(one['path']).read_bytes(), original)
        self.assertFalse(list(self.root.rglob('*.part')))

    async def test_export_verifies_frames_dimensions_captions_and_no_audio(self):
        row={'token':self.source['token'],'start':0,'end':7,'offset':1,'caption':'A test pattern.', 'crop':{'zoom':1.5,'x':.25,'y':0}}
        response=await self.client.post('/cap/training_dataset/export',json={'width':128,'height':64,'clips':[row]})
        self.assertEqual(response.status,200)
        token=(await response.json())['job']
        for _ in range(100):
            status=await (await self.client.get('/cap/training_dataset/jobs/'+token)).json()
            if status['state']!='running':break
            await asyncio.sleep(.1)
        self.assertEqual(status['state'],'complete',status)
        dest=Path(status['result']['directory'])
        info=module.probe_video(dest/'clip_0001.mp4',count=True)
        self.assertEqual(int(info['nb_read_frames']),124)
        self.assertEqual((info['width'],info['height']),(128,64))
        self.assertEqual(info['avg_frame_rate'],'24/1')
        self.assertEqual((dest/'clip_0001.txt').read_text(),'A test pattern.')
        manifest=json.loads((dest/'manifest.json').read_text())
        self.assertEqual(manifest['status'],'complete')
        self.assertEqual(manifest['clips'][0]['start'],1)
        self.assertEqual(manifest['clips'][0]['crop'],row['crop'])
        streams=json.loads(module.run_media(['ffprobe','-v','error','-show_streams','-of','json',str(dest/'clip_0001.mp4')]))['streams']
        self.assertEqual([s['codec_type'] for s in streams],['video'])

    async def test_rejects_short_tampered_and_missing_selection(self):
        for rows in [[],[dict(token=self.source['token'],start=0,end=5)],[dict(token='bad',start=0,end=7)]]:
            response=await self.client.post('/cap/training_dataset/export',json={'clips':rows})
            self.assertEqual(response.status,400)

    async def test_cancel_prevents_encode(self):
        cancelled=threading.Event();cancelled.set()
        with self.assertRaises(InterruptedError):
            await asyncio.to_thread(module.encode_clip,self.video,self.root/'cancel.mp4',0,module.validate_settings({}),cancelled)

    async def test_scene_detection_job(self):
        response=await self.client.post('/cap/training_dataset/detect',json={'token':self.source['token']})
        self.assertEqual(response.status,200)
        token=(await response.json())['job']
        for _ in range(100):
            status=await (await self.client.get('/cap/training_dataset/jobs/'+token)).json()
            if status['state']!='running':break
            await asyncio.sleep(.1)
        self.assertEqual(status['state'],'complete',status)
        self.assertTrue(all(0<=p<7.01 for p in status['result']['points']))

    async def test_selected_detection_ranges(self):
        from unittest.mock import patch
        calls=[]
        def detect(path,start,duration,cancel=None):
            calls.append((start,duration))
            return [start+0.5]
        with patch.object(module,'detect_video_scenes',detect):
            response=await self.client.post('/cap/training_dataset/detect',json={'token':self.source['token'],'ranges':[{'start':1,'end':2},{'start':4,'end':6}]})
            self.assertEqual(response.status,200)
            token=(await response.json())['job']
            for _ in range(100):
                status=await (await self.client.get('/cap/training_dataset/jobs/'+token)).json()
                if status['state']!='running':break
                await asyncio.sleep(.01)
            self.assertEqual(status['result']['points'],[1.5,4.5])
            self.assertEqual(calls,[(1,1),(4,2)])
        for ranges in [[],[None],[{'start':-1,'end':3}],[{'start':2,'end':99}]]:
            response=await self.client.post('/cap/training_dataset/detect',json={'token':self.source['token'],'ranges':ranges})
            self.assertEqual(response.status,400)

    async def test_caption_receives_only_exported_window(self):
        agent=types.ModuleType('training_test_backend.cap_clip_prompt_vl')
        seen=[]
        def generate(payload):
            path=self.root/payload['files'][0]['file']
            seen.append(module.probe_video(path,count=True))
            return 'Observed test pattern.'
        agent.generate_from_payload=generate
        sys.modules[agent.__name__]=agent
        try:
            response=await self.client.post('/cap/training_dataset/caption',json={
                'token':self.source['token'],'start':0,'end':7,'offset':1,'model':'stub','width':128,'height':64})
            token=(await response.json())['job']
            for _ in range(100):
                status=await (await self.client.get('/cap/training_dataset/jobs/'+token)).json()
                if status['state']!='running':break
                await asyncio.sleep(.1)
            self.assertEqual(status['state'],'complete',status)
            self.assertEqual(status['result']['caption'],'Observed test pattern.')
            self.assertEqual(int(seen[0]['nb_read_frames']),124)
            self.assertFalse(list((self.root/'capricorncd-timeline/training-caption').glob('*.mp4')))
        finally:
            del sys.modules[agent.__name__]


if __name__=='__main__':unittest.main()
