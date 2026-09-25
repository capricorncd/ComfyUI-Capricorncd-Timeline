import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('isMediaTrackType', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(type => type === 'video');
}
const meta = {};
const clip = { id: 'audio', track: { type: 'audio' } };
let undo = 0, saved = 0, playback = 0;
let selected = [clip];
const app = {
    _overlay: { classList: { contains: () => true } },
    _shortcutModKey: e => e.key,
    getSelectedClip: () => clip,
    _ensureClipMeta: clip => app._meta.get(clip.id) ?? {},
    _meta: new Map([[clip.id, meta]]),
    _recordUndo: () => undo++,
    _decorateClip() {},
    _saveToWidgets: () => saved++,
    _timeline: { _playing: true, getSelectedClips: () => selected },
    _startAudioPlayback: () => playback++,
    _setMediaClipMuted: method('_setMediaClipMuted'),
};
const key = method('handleShortcutKey');
const event = { key: 'b', ctrlKey: true, preventDefault() {}, stopPropagation() {} };
assert.equal(key.call(app, event), true);
assert.equal(meta.muted, true);
assert.equal(key.call(app, event), true);
assert.equal(meta.muted, false);
assert.equal(meta.disabled, undefined);
assert.equal(undo, 2);
assert.equal(saved, 2);
assert.equal(playback, 2);
clip.track.locked = true;
assert.equal(key.call(app, event), false);
assert.equal(undo, 2);
clip.track = { type: 'image' };
key.call(app, event);
assert.equal(meta.disabled, true);
const other = { id: 'other', track: { type: 'director' } };
const locked = { id: 'locked', track: { type: 'image', locked: true } };
const audio = { id: 'sound', track: { type: 'audio' } };
const untouched = { disabled: false };
app._meta.set('locked', { disabled: false });
app._meta.set('unselected', untouched);
app._meta.set('other', { disabled: false });
app._meta.set('sound', { muted: true });
selected = [clip, other, locked, audio];
const before = { undo, saved, playback, meta: structuredClone(app._meta) };
let snapshot;
app._recordUndo = () => { undo++; snapshot = structuredClone(app._meta); };
key.call(app, event);
assert.equal(meta.disabled, true, 'mixed selection disables all, rather than inverting each');
assert.equal(app._meta.get('other').disabled, true);
assert.equal(app._meta.get('sound').muted, true);
assert.equal(app._meta.get('sound').disabled, undefined);
assert.equal(app._meta.get('locked').disabled, false);
assert.equal(untouched.disabled, false);
assert.equal(undo, before.undo + 1);
assert.equal(saved, before.saved + 1);
assert.equal(playback, before.playback + 1);
assert.deepEqual(snapshot, before.meta, 'one undo snapshot preserves the complete original batch');
key.call(app, event);
assert.equal(meta.disabled, false);
assert.equal(app._meta.get('other').disabled, false);
assert.equal(app._meta.get('sound').muted, false);
const count = undo;
for (const extra of [{repeat: true}, {target: {closest: () => ({})}}, {shiftKey: true}]) {
    assert.equal(key.call(app, {...event, ...extra}), false);
}
app._blockingModal = true;
assert.equal(key.call(app, event), false);
app._blockingModal = false;
app._timeline._keyboardSuspended = true;
assert.equal(key.call(app, event), false);
app._timeline._keyboardSuspended = false;
selected = [];
assert.equal(key.call(app, event), false);
selected = [locked];
assert.equal(key.call(app, event), false);
assert.equal(undo, count, 'ignored shortcuts do not add undo entries');
console.log('Ctrl+B batch enable/disable, mixed states, audio mute, single undo/save, locked and input guards passed');
