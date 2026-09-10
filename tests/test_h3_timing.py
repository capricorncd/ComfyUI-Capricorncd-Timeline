import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("h3_timing", (Path(__file__).resolve().parents[1] / "backend") / "h3_timing.py")
h3 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(h3)


def clips():
    return [dict(source_clip_id=f"clip_{i}", start_ms=i * 5000, end_ms=(i + 1) * 5000,
                 preview_start_ms=i * 5000, preview_end_ms=(i + 1) * 5000, z_index=0,
                 agent="MiniMaxH3", save_latent=i < 2, h3_motion_context_length=39,
                 output_video=f"CapTimelineEditor/test/20260910-120000_clip_{i}.mp4") for i in range(3)]


class H3TimingTests(unittest.TestCase):
    def test_padding_carry_keeps_every_frame_through_final_clip(self):
        for lengths in ([120, 120, 120], [124, 136, 131], [124, 136, 111], [100, 131, 75], [41, 52, 63]):
            rows = clips()
            frame = 0
            for row, length in zip(rows, lengths):
                row.update(start_ms=round(frame * 1000 / 24), preview_start_ms=round(frame * 1000 / 24),
                           end_ms=round((frame + length) * 1000 / 24), preview_end_ms=round((frame + length) * 1000 / 24),
                           h3_motion_context_length=22)
                frame += length
            h3.plan_h3_clips(rows, 24)
            by_id = {r["source_clip_id"]: r for r in rows}
            cursor = 0
            for row, length in zip(rows, lengths):
                timing = row["h3_timing"]
                self.assertEqual((timing["raw_frames"] - 5) % 17, 0)
                self.assertEqual(timing["play_frames"], length)
                for span in row["playback_spans"]:
                    source = by_id[span["source_clip_id"]]["h3_timing"]
                    origin = source["play_start_frame"] - source["context_frames"] + source["context_carry_frames"]
                    self.assertEqual(origin + span["start_frame"], cursor)
                    self.assertLessEqual(span["start_frame"] + span["frame_count"], source["raw_frames"])
                    cursor += span["frame_count"]
                snapshot = h3.timing_from_filename(row["output_video"])
                self.assertEqual(snapshot["context_carry_frames"], timing["context_carry_frames"])
                self.assertEqual(h3.trim_h3_video(snapshot, snapshot["raw_frames"], 24)[1], length / 24)
            self.assertEqual(cursor, sum(lengths))
            self.assertEqual(rows[-1]["h3_timing"]["play_end_frame"], sum(lengths))

    def test_context_chooses_grid_value_inside_visible_interval(self):
        short = dict(raw_frames=22, context_frames=0, head_frames=17, tail_frames=0)
        self.assertEqual(h3.choose_h3_context(short), 5)
        extended = dict(raw_frames=90, context_frames=0, head_frames=0, tail_frames=25)
        self.assertEqual(h3.choose_h3_context(extended), 39)
        normal = dict(raw_frames=124, context_frames=0, head_frames=0, tail_frames=4)
        self.assertEqual(h3.choose_h3_context(normal), 22)
        self.assertEqual(h3.choose_h3_context(normal, 39), 39)
        self.assertEqual(h3.choose_h3_context(normal, 192), 124)
        with self.assertRaisesRegex(ValueError, "visible frames"):
            h3.choose_h3_context(dict(raw_frames=39, context_frames=22, head_frames=0, tail_frames=16))

    def test_adjustment_uses_final_padding_before_planning_next_clip(self):
        rows = clips()[:2]
        rows[0].update(end_ms=6000, preview_end_ms=5000)
        rows[1]["h3_motion_context_length"] = 22
        h3.plan_h3_clips(rows, 24)
        previous, next_clip = rows
        self.assertEqual(next_clip["h3_motion_context_length"], 39)
        self.assertEqual(next_clip["h3_timing"]["requested_context_frames"], 22)
        timing = previous["h3_timing"]
        cut = timing["raw_frames"] - next_clip["h3_timing"]["context_frames"]
        self.assertGreaterEqual(cut, timing["context_frames"] + timing["head_frames"])
        self.assertLess(cut, timing["raw_frames"] - timing["tail_frames"])
        self.assertEqual(sum(span["frame_count"] for span in previous["playback_spans"]), 120)
        self.assertEqual(h3.timing_from_filename(next_clip["output_video"])["context_frames"], 39)

    def test_context_replaces_tail_and_defaults_to_22(self):
        rows = clips()
        for row in rows:
            row["h3_motion_context_length"] = 0
        h3.plan_h3_clips(rows, 24)
        self.assertEqual([row["h3_timing"]["context_frames"] for row in rows], [0, 22, 22])
        for row in rows:
            self.assertEqual(sum(span["frame_count"] for span in row["playback_spans"]), 120)
        prior = rows[0]["h3_timing"]
        replacement = rows[0]["playback_spans"][1]
        self.assertEqual(replacement["source_clip_id"], "clip_1")
        self.assertEqual(replacement["start_frame"], 0)
        self.assertEqual(replacement["frame_count"], 22 - prior["tail_frames"])
        self.assertEqual(rows[1]["playback_spans"][0]["start_frame"], 18)

    def test_chain(self):
        rows = clips()
        h3.plan_h3_clips(rows, 24)
        plans = [row["h3_timing"] for row in rows]
        self.assertEqual([p["raw_frames"] for p in plans], [124, 158, 158])
        self.assertEqual([p["context_frames"] for p in plans], [0, 39, 39])
        self.assertEqual([p["play_frames"] for p in plans], [120, 120, 120])
        self.assertEqual([p["play_start_frame"] for p in plans], [0, 120, 240])
        self.assertEqual(plans[-1]["play_end_frame"], 360)
        self.assertEqual([row["end_ms"] - row["start_ms"] for row in rows], [5000] * 3)

    def test_confirmed_layout_preserves_total_and_does_not_expand_again(self):
        rows = clips()
        bounds = [0, 5167, 10833, 15000]
        for i, row in enumerate(rows):
            row.update(start_ms=bounds[i], preview_start_ms=bounds[i],
                       end_ms=bounds[i + 1], preview_end_ms=bounds[i + 1])
        h3.plan_h3_clips(rows, 24)
        plans = [r["h3_timing"] for r in rows]
        self.assertEqual([p["raw_frames"] for p in plans], [124, 175, 141])
        self.assertEqual([p["play_frames"] for p in plans], [124, 136, 100])
        self.assertEqual([p["tail_frames"] for p in plans], [0, 0, 2])
        self.assertEqual(sum(p["play_frames"] for p in plans), 360)
        self.assertEqual(plans[-1]["play_end_frame"], 360)
        last = h3.timing_from_filename(rows[-1]["output_video"])
        self.assertEqual(h3.trim_h3_video(last, 141, 24), (39 / 24, 100 / 24))
        self.assertEqual(h3.trim_h3_video(last, 102, 24), (0, 100 / 24))
        self.assertEqual(h3.trim_h3_video(last, 100, 24), (0, 100 / 24))
        files = [r["output_video"] for r in rows]
        h3.plan_h3_clips(rows, 24)
        self.assertEqual([r["output_video"] for r in rows], files)

    def test_other_track_does_not_break_chain(self):
        rows = clips()
        unrelated = dict(rows[0], source_clip_id="other", z_index=1, save_latent=False, h3_motion_context_length=0)
        rows.insert(1, unrelated)
        h3.plan_h3_clips(rows, 24)
        self.assertEqual(rows[2]["h3_timing"]["context_frames"], 39)

    def test_nearest_boundary_layout_matches_runtime_frames(self):
        for context, expected_raw in ((22, [124, 141, 141]), (39, [124, 158, 158])):
            rows = clips()
            bounds = [0, 5167, 10125, 15000]
            for i, row in enumerate(rows):
                row.update(start_ms=bounds[i], preview_start_ms=bounds[i],
                           end_ms=bounds[i + 1], preview_end_ms=bounds[i + 1],
                           h3_motion_context_length=context)
            h3.plan_h3_clips(rows, 24)
            self.assertEqual([r["h3_timing"]["raw_frames"] for r in rows], expected_raw)
            self.assertEqual([r["h3_timing"]["play_frames"] for r in rows], [124, 119, 117])
            self.assertEqual([r["h3_timing"]["tail_frames"] for r in rows], [0, 0, 2])
            self.assertEqual(rows[-1]["h3_timing"]["play_end_frame"], 360)

    def test_snapshot_survives_setting_changes(self):
        rows = clips()
        h3.plan_h3_clips(rows, 24)
        row = rows[1]
        row["h3_motion_context_length"] = 5
        row["save_latent"] = False
        plan = h3.timing_from_filename(row["output_video"])
        self.assertEqual(plan["context_frames"], 39)
        self.assertTrue(plan["save_latent"])
        self.assertEqual(h3.trim_h3_video(plan, 158, 24), (35 / 24, 120 / 24))
        with self.assertRaises(ValueError):
            h3.trim_h3_video(plan, 119, 24)
        self.assertEqual(h3.trim_h3_video(plan, 120, 24), (0, 120 / 24))
        with self.assertRaises(ValueError):
            h3.trim_h3_video(plan, 136, 25)
        self.assertEqual(h3.timing_filename(row["output_video"], plan), row["output_video"])
        self.assertEqual(h3.H3_SUFFIX.sub("", row["output_video"]), "CapTimelineEditor/test/20260910-120000_clip_1.mp4")

    def test_no_cross_track_gap_or_unsaved_context(self):
        for change in (dict(save_latent=False), dict(z_index=1), dict(preview_end_ms=4990)):
            rows = clips()
            rows[0].update(change)
            h3.plan_h3_clips(rows, 24)
            self.assertEqual(rows[1]["h3_timing"]["context_frames"], 0)
        rows = clips()[1:]
        h3.plan_h3_clips(rows, 24)
        self.assertEqual(rows[0]["h3_timing"]["context_frames"], 0)

    def test_layout_is_not_regenerated_at_expanded_duration(self):
        row = dict(start_ms=5167, duration_ms=5666, end_ms=10833,
                   h3_layout=dict(start_sec=124/24, duration_sec=136/24,
                                  source_start_sec=5, source_duration_sec=5))
        restored = h3.source_clip_timing(row)
        self.assertEqual((restored["start_ms"], restored["end_ms"]), (5000, 10000))
        row["duration_ms"] = 6000
        restored = h3.source_clip_timing(row)
        self.assertEqual((restored["start_ms"], restored["duration_ms"]), (5000, 6000))
        self.assertNotIn("h3_layout", restored)


if __name__ == "__main__":
    unittest.main()
