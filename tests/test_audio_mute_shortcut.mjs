import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf('    ' + name + '(');
    return new Function('isMediaTrackType', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(type => type === 'video');
}
const meta = {};
const clip = { id: 'audio', track: { type: 'audio' } };
let undo = 0, saved = 0, playback = 0, disabled = 0;
const app = {
    _overlay: { classList: { contains: () => true } },
    _shortcutModKey: e => e.key,
    getSelectedClip: () => clip,
    _ensureClipMeta: () => meta,
    _meta: new Map(),
    _recordUndo: () => undo++,
    _decorateClip() {},
    _saveToWidgets: () => saved++,
    _timeline: { _playing: true },
    _startAudioPlayback: () => playback++,
    _toggleDisableClip: () => disabled++,
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
assert.equal(disabled, 1);
console.log('Ctrl+B audio mute/unmute, undo/save, playback refresh and locked clip checks passed');
