import ast
import copy
import json
from pathlib import Path
import shutil
import tempfile
from types import SimpleNamespace
import unittest

import numpy as np
from PIL import Image, ImageOps
import torch

from test_compose_range_audio import scope, run
from test_compose_stream_copy import copy as stream_copy
from test_h3_previous_video import load_definitions


class ReferenceFlipTests(unittest.TestCase):
    def test_parser_mirrors_reference_width_without_changing_source(self):
        definitions = load_definitions("cap_data_json_parser.py", {"_load_reference_image"}, {})
        image = torch.tensor([[[[1., 0., 0.], [0., 0., 1.]]]])
        parser = SimpleNamespace(_load_image=lambda path:image, _ref_file=lambda ref,materials:"image.png",
                                 _ref_id=lambda ref:ref.get("id", "") if isinstance(ref,dict) else ref)
        load = definitions["_load_reference_image"]
        materials = {"image":{"flip_horizontal":True}}
        torch.testing.assert_close(load(parser,"image",materials),image.flip([2]))
        self.assertIs(load(parser,{"id":"image","flip_horizontal":False},materials),image)
        self.assertIs(load(parser,"image",{}),image)
        self.assertEqual(image[0,0,0,0],1)

    def test_vl_mirrors_image_and_video_references(self):
        picture = Image.new("RGB",(2,1))
        picture.putdata([(255,0,0),(0,0,255)])
        definitions = load_definitions("cap_clip_prompt_vl.py", {"media_from_payload"}, {
            "Image":Image,"resolve_media_path":lambda path,**kwargs:path,
            "_kind_of":lambda row,path:row["kind"],"MAX_REF_VIDEOS":8,"MAX_REF_IMAGES":8,
            "_load_still":lambda path:picture,"_load_video_frames":lambda path:[picture]})
        images,videos = definitions["media_from_payload"]({"files":[
            {"file":"image.png","kind":"image","flip_horizontal":True},
            {"file":"video.mp4","kind":"video","flip_horizontal":True}]})
        self.assertEqual(images[0].getpixel((0,0)),(0,0,255))
        self.assertEqual(videos[0][0].getpixel((0,0)),(0,0,255))
        self.assertEqual(picture.getpixel((0,0)),(255,0,0))

    def test_auto_prompt_receives_mirrored_reference_pictures(self):
        picture = Image.new("RGB",(32,16),"red")
        picture.paste("blue",(16,0,32,16))
        definitions = load_definitions("cap_h3_prompt_generator.py", {"prompt_materials"}, {
            "Image":Image,"ImageOps":ImageOps,"np":np,"torch":torch,"json":json,
            "read_image_metadata":lambda path:{"raw":'{"info":{}}'},
            "asset_name":lambda entry:entry["name"],
            "select_prompt_frames":lambda *args:[(0,0,picture)]})
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)/"image.png"
            picture.save(path)
            for kind in ("image","video"):
                with self.subTest(kind=kind):
                    material = dict(id="ref",file=str(path),name="Reference",kind=kind,flip_horizontal=True)
                    parser = SimpleNamespace(_materials_by_id=lambda data:{"ref":material},
                        _ref_list=lambda refs:refs or [],_ref_id=lambda ref:ref["id"],
                        _visual_ref_entry=lambda ref,materials:dict(materials[ref["id"]]))
                    _,_,batch,_ = definitions["prompt_materials"]({},dict(images=[{"id":"ref"}]),parser,
                        video_frame_mode="manual")
                    self.assertGreater(batch[0,384,192,2],.9)
                    self.assertGreater(batch[0,384,576,0],.9)

    def test_reference_timeline_applies_asset_and_segment_flip_once(self):
        projects = []
        definitions = load_definitions("reference_timeline.py", {"compose_reference_timeline"}, {
            "copy":copy,"uuid":SimpleNamespace(uuid4=lambda:SimpleNamespace(hex="test")),
            "compose_to_output":lambda project,**kwargs:projects.append(project) or {"output_path":"ref.mp4"}})
        project = {"settings":{"fps":24},"media":[{"id":"video","kind":"video","file":"original.mp4","flip_horizontal":True}]}
        clip = {"id":"clip","duration_ms":1000,"reference_timeline":{"videos":[{"id":"segment","media_id":"video"}]}}
        original = copy.deepcopy(project)
        definitions["compose_reference_timeline"](project,clip,lambda path:path)
        self.assertTrue(projects[-1]["tracks"][0]["clips"][0]["generated_videos"][0]["flip_horizontal"])
        clip["reference_timeline"]["videos"][0]["flip_horizontal"] = True
        definitions["compose_reference_timeline"](project,clip,lambda path:path)
        self.assertFalse(projects[-1]["tracks"][0]["clips"][0]["generated_videos"][0]["flip_horizontal"])
        self.assertEqual(project,original)


@unittest.skipUnless(shutil.which("ffmpeg"),"ffmpeg required")
class ComposeFlipTests(unittest.TestCase):
    def test_asymmetric_image_and_subtrack_video_export(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            pixels = np.zeros((16,32,3),dtype=np.uint8)
            pixels[:,:16,0] = 255
            pixels[:,16:,2] = 255
            image = root / "source.png"
            Image.fromarray(pixels).save(image)
            video = root / "source.mp4"
            run(["ffmpeg","-v","error","-loop","1","-i",str(image),"-t","0.5",
                 "-r","24","-c:v","libx264","-pix_fmt","yuv420p",str(video)])
            cases = [("image",True),("video",True),("image",False)]
            for index,(kind,flip) in enumerate(cases):
                with self.subTest(kind=kind,flip=flip):
                    clip = dict(start_ms=0,duration_ms=500,flip_horizontal=flip,
                        media_ids=["image"] if kind=="image" else [],
                        generated_videos=[] if kind=="image" else [dict(file=str(video),duration_sec=.5,flip_horizontal=flip)])
                    project = dict(settings=dict(width=32,height=16,fps=24),media=[dict(id="image",kind="image",file=str(image))],
                        tracks=[dict(type="media" if kind=="image" else "director",muted=True,clips=[clip])])
                    plan = scope["_collect_plan"](project)
                    self.assertEqual(plan["video_segs"][0]["flip_horizontal"],flip)
                    if kind=="video":
                        self.assertEqual(stream_copy.stream_copy_plan(plan,False),(None,"overlays"))
                    output = root / f"output{index}.mp4"
                    scope["compose_timeline_project"](project,str(output))
                    result = run(["ffmpeg","-v","error","-i",str(output),"-frames:v","1","-pix_fmt","rgb24","-f","rawvideo","pipe:1"])
                    frame = np.frombuffer(result,dtype=np.uint8).reshape(16,32,3)
                    left = frame[4:12,4:12].mean(axis=(0,1))
                    right = frame[4:12,20:28].mean(axis=(0,1))
                    self.assertGreater(left[2] if flip else left[0],200)
                    self.assertGreater(right[0] if flip else right[2],200)
            np.testing.assert_array_equal(np.asarray(Image.open(image)),pixels)


if __name__ == "__main__":
    unittest.main()
