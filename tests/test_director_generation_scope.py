import ast
from pathlib import Path
from types import SimpleNamespace
import unittest


source = (Path(__file__).resolve().parents[1] / "backend") / "cap_timeline_editor.py"
tree = ast.parse(source.read_text(encoding="utf-8"))
execute = next(n for n in ast.walk(tree) if isinstance(n, ast.FunctionDef) and n.name == "execute")
start = next(i for i, n in enumerate(execute.body) if isinstance(n, ast.AnnAssign) and n.target.id == "visual_clips")
end = next(i for i, n in enumerate(execute.body) if isinstance(n, ast.Assign)
           and isinstance(n.targets[0], ast.Name) and n.targets[0].id == "segments")
selection = compile(ast.Module(body=execute.body[start:end], type_ignores=[]), str(source), "exec")


def select(tracks):
    env = {
        "project": {"tracks": tracks},
        "self": SimpleNamespace(
            _track_active=lambda t: t.get("enabled", True) and t.get("visible", True),
            _audio_track_active=lambda t: t.get("enabled", True), _source=lambda c: {}),
        "_is_subtitle_clip": lambda c, t: c.get("type") in ("subtitle", "text"),
        "source_clip_timing": lambda c: c,
        "resolve_clip_media": lambda p, c: [],
    }
    exec(selection, env)
    return [c[1]["id"] for c in env["visual_clips"]], [c["id"] for c in env["audio_clips"]]


class DirectorGenerationScopeTests(unittest.TestCase):
    def test_full_length_voiceover_is_not_second_video(self):
        first = dict(id="clip_ep02_long_01", type="clip", start_ms=0, duration_ms=8000)
        second = dict(first, id="clip_ep02_long_02", start_ms=8000)
        bgm = dict(id="bgm_ep02_long", type="voiceover", start_ms=0, duration_ms=120000, prompt="BGM")
        visuals, audio = select([
            dict(type="director", clips=[first, second]), dict(type="voiceover", clips=[bgm]),
            dict(type="media", clips=[dict(first, id="logo")]),
            dict(type="unknown", clips=[dict(first, id="unknown")]),
            dict(type="subtitle", clips=[dict(first, id="subtitle")]),
        ])
        self.assertEqual(visuals, [first["id"], second["id"]])
        self.assertEqual(audio, [bgm["id"]])

    def test_muted_disabled_hidden_and_misplaced_audio(self):
        c = dict(id="clip", type="clip")
        visuals, audio = select([
            dict(type="director", visible=False, clips=[c]),
            dict(type="director", clips=[dict(c, enabled=False), dict(c, visible=False),
                                          dict(c, id="voice", type="voiceover")]),
            dict(type="voiceover", muted=True, clips=[dict(c, id="muted")]),
            dict(type="audio", enabled=False, clips=[dict(c, id="disabled")]),
            dict(type="audio", visible=False, clips=[dict(c, id="audio")]),
        ])
        self.assertEqual(visuals, [])
        self.assertEqual(audio, ["voice", "audio"])


if __name__ == "__main__":
    unittest.main()
