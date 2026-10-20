"""Local-only browser fixture; uses synthetic previews produced by test_character.py."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit, parse_qs

ROOT = Path(__file__).resolve().parents[1]
TEMP = ROOT.parents[1] / 'temp'
ROWS = [
    {'name':'短剧A/角色/女主_上半身','description':'同一角色的上半身参考。','has_preview':True,'preview_type':'image'},
    {'name':'短剧A/角色/女主_全身','description':'同一角色的全身参考。','has_preview':True,'preview_type':'video'},
    {'name':'打斗/近身/回旋踢','description':'人物转身后踢腿。','has_preview':True,'preview_type':'video'},
    {'name':'特效/爆炸/火球','description':'明亮火焰、烟雾与冲击波。','has_preview':False,'preview_type':'video'},
    {'name':'大招/觉醒/<test>&很长的目录名称很长的目录名称','description':'纯文本名称，无预览。','has_preview':False,'preview_type':'image'},
]


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == '/refmods/library':
            data = json.dumps(ROWS, ensure_ascii=False).encode()
            self.send_response(200); self.send_header('Content-Type','application/json'); self.end_headers(); self.wfile.write(data)
            return
        if url.path == '/refmods/preview':
            name = parse_qs(url.query).get('name',[''])[0]
            video = '上半身' not in name
            pattern = 'h3_refmod_preview_*.mp4' if video else 'h3_character_*.png'
            files = sorted(TEMP.glob(pattern), key=lambda path:path.stat().st_mtime)
            if not files:
                self.send_error(404); return
            self.send_response(200); self.send_header('Content-Type', 'video/mp4' if video else 'image/png'); self.end_headers(); self.wfile.write(files[-1].read_bytes())
            return
        super().do_GET()


if __name__ == '__main__':
    ThreadingHTTPServer(('127.0.0.1',8768), Handler).serve_forever()
