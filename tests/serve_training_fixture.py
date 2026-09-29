"""Local isolated browser fixture; never starts or modifies ComfyUI."""
import importlib.util
import json
from pathlib import Path
import sys
import types
from aiohttp import web

ROOT=Path(__file__).resolve().parents[1]
package=types.ModuleType('training_fixture_backend');package.__path__=[str(ROOT/'backend')]
sys.modules[package.__name__]=package
spec=importlib.util.spec_from_file_location(package.__name__+'.cap_training_dataset',ROOT/'backend/cap_training_dataset.py')
module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
routes=web.RouteTableDef()
work=ROOT/'.test-output';work.mkdir(exist_ok=True)
module.register_training_dataset_routes(routes,str(work),str(work))

@routes.get('/scripts/app.js')
async def app_stub(request):
    return web.Response(text="export const app={ui:{settings:{getSettingValue:()=> 'zh'}}};",content_type='text/javascript')

@routes.get('/audio_keyframe_timeline/vl_models')
async def agents(request):
    return web.json_response({'models':[],'agents':[]})

@routes.get('/fixture-config')
async def fixture(request):
    return web.json_response({'sources':[{'path':sys.argv[1], 'segments':[
        {'id':'one','start':0,'end':6,'offset':0,'selected':False,'caption':'','caption_origin':'manual'},
        {'id':'short','start':6,'end':9,'offset':6,'selected':False,'caption':'','caption_origin':'manual'},
        {'id':'three','start':9,'end':15,'offset':9,'selected':False,'caption':'','caption_origin':'manual'},
    ]}]})

app=web.Application(client_max_size=8*1024**3);app.add_routes(routes)
app.router.add_static('/extensions/ComfyUI-Capricorncd-Timeline/',ROOT/'js')
app.router.add_static('/js/',ROOT/'js')
app.router.add_static('/tests/',ROOT/'tests')
web.run_app(app,host='127.0.0.1',port=8745)
