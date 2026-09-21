import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
let serial = 0;
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('genAudioUid', 'genVideoUid', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(() => 'copy-' + serial++, () => 'video-copy-' + serial++);
}
const original = { id: 'audio', track_id: 'original-track', file: 'voice.wav', edit_start_sec: 2, source_offset: 3, duration: 4,
    source_duration: 20, muted: true, volume: 0.7, from_gen_id: 'video', volume_points: [{ source_ms: 3000, gain: 0.5 }] };
const state = { draft: [], clipMap: new Map(), audioDraft: [original, { ...structuredClone(original), id: 'second', edit_start_sec: 8 }],
    audioMap: new Map([['clip', 'audio'], ['clip2', 'second']]),
    timeline: { currentTime: 12, tracks: [{ id: 'original-track', type: 'audio', muted: true }],
        getSelectedClips: () => [{ id: 'clip' }, { id: 'clip2' }, { id: 'video' }] } };
let saved = 0;
const app = { _genEditState: state, genEditModal: { hidden: false },
    _overlay: { classList: { contains: () => true } },
    _shortcutModKey: method('_shortcutModKey'), handleGenEditKey: method('handleGenEditKey'),
    _copyGenEditClips: method('_copyGenEditClips'), _pasteGenEditClips: method('_pasteGenEditClips'),
    _pullGenEditDraftFromTimeline() {}, _applyGenEditChanges() { saved++; },
    _syncGenEditInspector() {}, _scheduleGenEditPreview() {},
    _buildGenEditTimeline() {
        state.audioMap = new Map(state.audioDraft.map(row => [row.id, row.id]));
        const tracks = [...new Set(state.audioDraft.map(row => row.track_id))].map(id => ({ id, type: 'audio', muted: true,
            clips: state.audioDraft.filter(row => row.track_id === id).map(row => ({ id: row.id })) }));
        state.timeline = { currentTime: 0, tracks, selected: [],
            getSelectedClips() { return this.selected; }, selectClip(clip) { this.selected.push(clip); },
            setCurrentTime(time) { this.currentTime = time; } };
    },
    _copySelectedClips() { assert.fail('Must not copy the main timeline'); },
    _pasteClips() { assert.fail('Must not paste into the main timeline'); },
};
const shortcut = method('handleShortcutKey');
const event = key => ({ key, ctrlKey: true, preventDefault() { this.prevented = true; }, stopPropagation() {} });
assert.equal(app._pasteGenEditClips(), false);
assert.equal(shortcut.call(app, event('c')), true);
original.volume_points[0].gain = 2;
assert.equal(shortcut.call(app, event('v')), true);
assert.equal(saved, 1);
const pasted = state.audioDraft.slice(2);
assert.deepEqual(pasted.map(row => row.edit_start_sec), [12, 18]);
assert(pasted.every(row => row.track_id === original.track_id), 'Free space at the end reuses the original track');
assert.equal(state.timeline.currentTime, 12);
assert.deepEqual(state.timeline.selected.map(clip => clip.id), pasted.map(row => row.id));
for (const row of pasted) {
    assert.equal(row.source_offset, 3);
    assert.equal(row.duration, 4);
    assert.equal(row.muted, true);
    assert.equal(row.volume, 0.7);
    assert.equal(row.volume_points[0].gain, 0.5);
    assert.equal(row.from_gen_id, null);
}
pasted[0].volume_points[0].gain = 3;
app._pasteGenEditClips();
assert.equal(state.audioDraft[4].volume_points[0].gain, 0.5);
assert.notEqual(state.audioDraft[4].track_id, original.track_id, 'An overlap needs another track');
assert.equal(new Set(state.audioDraft.map(row => row.id)).size, state.audioDraft.length);
const typing = { ...event('v'), target: { closest: () => ({}) } };
assert.equal(shortcut.call(app, typing), false);
assert.equal(typing.prevented, undefined);
const repeat = { ...event('v'), repeat: true };
const count = state.audioDraft.length;
app.handleGenEditKey(repeat);
assert.equal(state.audioDraft.length, count);
state.clipClipboard = [{ ...structuredClone(original), duration: 2 }];
state.timeline.currentTime = 6;
app._pasteGenEditClips();
assert.equal(state.audioDraft.at(-1).track_id, original.track_id, 'An exact gap between clips is usable');
state.timeline.currentTime = 40;
for (const track of state.timeline.tracks) track.locked = true;
app._pasteGenEditClips();
assert.notEqual(state.audioDraft.at(-1).track_id, original.track_id, 'Locked tracks cannot receive pasted clips');
console.log('Trim audio clipboard: shortcut isolation, relative timing, independent curves, repeated paste and native input paste passed');

let split;
app._splitGenEditClip = clip => { split = clip; };
const selected = { id: 'selected' };
state.timeline.getSelectedClips = () => [selected];
assert.equal(shortcut.call(app, event('x')), true);
assert.equal(split, selected, 'Ctrl+X splits the selected trim clip');
split = null;
assert.equal(shortcut.call(app, { ...event('x'), target: { closest: () => ({}) } }), false);
assert.equal(split, null, 'Text field cutting remains native');

const audio = {id: 'audio-state', muted: false, enabled: true};
const neighbor = {id: 'neighbor', muted: false, enabled: true};
const video = {id: 'video-state', muted: false, enabled: true};
const editor = {_genEditState: {audioDraft: [audio, neighbor], draft: [video],
    timeline: {currentTime: 3, tracks: [], setCurrentTime(time) { this.currentTime = time; }},
    audioMap: new Map([['a', audio.id]]), clipMap: new Map([['v', video.id]])},
    _pullGenEditDraftFromTimeline() {}, _applyGenEditChanges() {}, _buildGenEditTimeline() {},
    _syncGenEditInspector() {}, _scheduleGenEditPreview() {}};
const toggle = method('_toggleGenEditClipState');
toggle.call(editor, {id: 'a', track: {}}, 'muted');
assert.equal(audio.muted, true);
assert.equal(neighbor.muted, false, 'Clip mute must not mute neighboring audio');
toggle.call(editor, {id: 'a', track: {}}, 'enabled');
assert.equal(audio.enabled, false);
toggle.call(editor, {id: 'v', track: {}}, 'enabled');
assert.equal(video.enabled, false);
toggle.call(editor, {id: 'v', track: {locked: true}}, 'enabled');
assert.equal(video.enabled, false);
console.log('Trim clip state and Ctrl+X routing passed');
app._toggleGenEditClipState = (clip, field) => { split = {clip, field}; };
selected.track = {type: 'audio'};
shortcut.call(app, event('b'));
assert.equal(split.field, 'muted');
selected.track.type = 'video';
shortcut.call(app, event('b'));
assert.equal(split.field, 'enabled');

state.draft = [{id: 'video', file: 'movie.mp4', edit_start_sec: 3, trim_in_sec: 7,
    trim_out_sec: 13, playback_rate: 2, enabled: false, muted: true}];
state.clipMap = new Map([['video-clip', 'video']]);
state.timeline.getSelectedClips = () => [{id: 'video-clip'}, {id: original.id}];
state.audioMap.set(original.id, original.id);
app._copyGenEditClips();
assert.equal(state.clipClipboard.length, 2);
state.timeline.currentTime = 20;
app._pasteGenEditClips();
const videoCopy = state.draft.at(-1);
assert.notEqual(videoCopy.id, 'video');
assert.equal(videoCopy.edit_start_sec, 21);
assert.equal(videoCopy.trim_in_sec, 7);
assert.equal(videoCopy.trim_out_sec, 13);
assert.equal(videoCopy.playback_rate, 2);
assert.equal(videoCopy.enabled, false);
assert.equal(videoCopy.clipboardType, undefined);
console.log('Mixed audio/video clipboard and Ctrl+B behavior passed');
