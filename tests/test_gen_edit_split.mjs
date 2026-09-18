import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _splitGenEditClip(');
const split = new Function('genAudioUid', 'normalizeVolumePoints', 'normalizePlaybackRate', 'genVideoUid', 'return ({' +
  source.slice(start, source.indexOf('\n    }', start) + 6) + '})._splitGenEditClip')(
  () => 'right', points => points.map(p => ({ ...p })), rate => rate || 1, () => 'video-right');
const points = [{ source_ms: 3000, gain: 2 }, { source_ms: 8000, gain: 0.5 }];
const state = { timeline: { currentTime: 7 }, audioMap: new Map([['clip', 'left']]),
  audioDraft: [{ id: 'left', file: 'audio.wav', edit_start_sec: 5, source_offset: 3,
    duration: 5, volume_points: points, muted: false }] };
const app = { _genEditState: state, _pullGenEditDraftFromTimeline() {},
  _applyGenEditChanges() {}, _buildGenEditTimeline() {}, _syncGenEditInspector() {}, _scheduleGenEditPreview() {} };
split.call(app, { id: 'clip', startTime: 5, endTime: 10, track: { locked: true } });
assert.equal(state.audioDraft.length, 1);
split.call(app, { id: 'clip', startTime: 5, endTime: 10, track: {} });
const [left, right] = state.audioDraft;
assert.equal(left.duration, 2);
assert.equal(right.duration, 3);
assert.equal(right.source_offset, 5);
assert.equal(right.edit_start_sec, 7);
assert.deepEqual(right.volume_points, points);
right.volume_points[0].gain = 0;
assert.equal(left.volume_points[0].gain, 2, 'split curves must be independently editable');
console.log('Trim audio split preserves positions and independent volume curves');
state.audioMap.clear();
state.clipMap = new Map([['clip', 'video']]);
state.draft = [{ id: 'video', file: 'video.mp4', edit_start_sec: 5, trim_in_sec: 1, trim_out_sec: 11, playback_rate: 2 }];
split.call(app, { id: 'clip', startTime: 5, endTime: 10, track: {} });
assert.equal(state.draft[0].trim_out_sec, 5);
assert.equal(state.draft[1].trim_in_sec, 5);
assert.equal(state.draft[1].trim_out_sec, 11);
assert.equal(state.draft[1].playback_rate, 2);
assert.equal(state.draft[1].edit_start_sec, 7);
console.log('Speed-adjusted video split maps timeline time to source time');
