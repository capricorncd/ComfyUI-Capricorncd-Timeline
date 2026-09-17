import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
let serial = 0;
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('genAudioUid', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(() => 'copy-' + serial++);
}
const original = { id: 'audio', file: 'voice.wav', edit_start_sec: 2, source_offset: 3, duration: 4,
    source_duration: 20, muted: true, volume: 0.7, from_gen_id: 'video', volume_points: [{ source_ms: 3000, gain: 0.5 }] };
const state = { audioDraft: [original, { ...structuredClone(original), id: 'second', edit_start_sec: 8 }],
    audioMap: new Map([['clip', 'audio'], ['clip2', 'second']]),
    timeline: { currentTime: 12, getSelectedClips: () => [{ id: 'clip' }, { id: 'clip2' }, { id: 'video' }] } };
let saved = 0;
const app = { _genEditState: state, genEditModal: { hidden: false },
    _overlay: { classList: { contains: () => true } },
    _shortcutModKey: method('_shortcutModKey'), handleGenEditKey: method('handleGenEditKey'),
    _copyGenEditAudioClips: method('_copyGenEditAudioClips'), _pasteGenEditAudioClips: method('_pasteGenEditAudioClips'),
    _pullGenEditDraftFromTimeline() {}, _applyGenEditChanges() { saved++; },
    _syncGenEditInspector() {}, _scheduleGenEditPreview() {},
    _buildGenEditTimeline() {
        state.audioMap = new Map(state.audioDraft.map(row => [row.id, row.id]));
        state.timeline = { currentTime: 0, tracks: state.audioDraft.map(row => ({ clips: [{ id: row.id }] })), selected: [],
            getSelectedClips() { return this.selected; }, selectClip(clip) { this.selected.push(clip); },
            setCurrentTime(time) { this.currentTime = time; } };
    },
    _copySelectedClips() { assert.fail('Must not copy the main timeline'); },
    _pasteClips() { assert.fail('Must not paste into the main timeline'); },
};
const shortcut = method('handleShortcutKey');
const event = key => ({ key, ctrlKey: true, preventDefault() { this.prevented = true; }, stopPropagation() {} });
assert.equal(app._pasteGenEditAudioClips(), false);
assert.equal(shortcut.call(app, event('c')), true);
original.volume_points[0].gain = 2;
assert.equal(shortcut.call(app, event('v')), true);
assert.equal(saved, 1);
const pasted = state.audioDraft.slice(2);
assert.deepEqual(pasted.map(row => row.edit_start_sec), [12, 18]);
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
app._pasteGenEditAudioClips();
assert.equal(state.audioDraft[4].volume_points[0].gain, 0.5);
assert.equal(new Set(state.audioDraft.map(row => row.id)).size, state.audioDraft.length);
const typing = { ...event('v'), target: { closest: () => ({}) } };
assert.equal(shortcut.call(app, typing), false);
assert.equal(typing.prevented, undefined);
const repeat = { ...event('v'), repeat: true };
const count = state.audioDraft.length;
app.handleGenEditKey(repeat);
assert.equal(state.audioDraft.length, count);
console.log('Trim audio clipboard: shortcut isolation, relative timing, independent curves, repeated paste and native input paste passed');
