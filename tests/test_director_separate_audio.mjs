import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const alerts = [];
function method(name, api = {}) {
    const begin = source.search(new RegExp('    (async )?' + name + '\\('));
    const end = begin + source.slice(begin).search(/\n    }\r?\n/) + 6;
    return new Function('isSubtitleClipMeta', 'isVoiceoverClipMeta', 'isDirectorTrackType', 'T', 'alert', 'api',
        'return ({' + source.slice(begin, end) + '}).' + name)(
        () => false, () => false, type => type === 'image', key => key, message => alerts.push(message), api);
}
const separate = method('_separateClipAudio');
const mix = [
    { file: 'first.mp4', location: 'output', trim_in_sec: 2, duration_sec: 6, edit_start_sec: 0, volume: 0.5 },
    { file: 'last.mp4', location: 'output', trim_in_sec: 0, duration_sec: 2, edit_start_sec: 6, volume: 1 },
    { file: 'voice.wav', location: 'input', trim_in_sec: 1, duration_sec: 3, edit_start_sec: 2, volume: 1 },
];
for (const outcome of ['success', 'failure', 'removed']) {
    const clip = { id: 'director', startTime: 10, duration: 8, track: { type: 'image' } };
    const meta = {};
    const inserted = [];
    let present = true;
    const app = {
        _timeline: {}, _projectResources: [], _ensureClipMeta: () => meta,
        _findClipById: () => present ? clip : null,
        _clipDenoiseSources: (target, generated) => {
            assert.equal(target, clip);
            assert.equal(generated, true);
            return [{ mix, duration_sec: 8 }];
        },
        _extractAudioFromMedia: async (file, options) => {
            assert.deepEqual(options, { mix, durationSec: 8 });
            if (outcome === 'failure') throw new Error('Extraction failed');
            if (outcome === 'removed') present = false;
            return 'mixed.wav';
        },
        _addAudioAtTime: async (...args) => inserted.push(args),
        _decorateClip() {}, _saveToWidgets() {}, _scheduleProgramPreview() {},
        _recordUndo() {}, _setDirectorClipMuted: method('_setDirectorClipMuted'),
    };
    await separate.call(app, clip);
    assert.equal(inserted.length, outcome === 'success' ? 1 : 0);
    assert.equal(meta.muted, outcome === 'success' ? true : undefined);
    if (inserted.length) {
        assert.equal(inserted[0][1], 10);
        assert.equal(inserted[0][3].duration, 8);
    }
}
let payload;
const extract = method('_extractAudioFromMedia', { fetchApi: async (path, options) => {
    payload = JSON.parse(options.body);
    return { ok: true, json: async () => ({ file: 'mix.wav' }) };
} });
assert.equal(await extract('', { mix, durationSec: 8 }), 'mix.wav');
assert.deepEqual(payload.mix, mix);
assert.equal(payload.duration_sec, 8);
await extract('single.mp4', { trimInSec: 2, durationSec: 3 });
assert.equal(payload.mix, undefined);
assert.equal(payload.file, 'single.mp4');
assert.equal(payload.trim_in_sec, 2);
assert.equal(alerts.length, 1);
{
    const clip = { id: 'director', name: 'Director', track: {} };
    const meta = {};
    const calls = [];
    const app = {
        _ensureClipMeta: () => meta, _recordUndo() {},
        _selClip: clip, _genEditState: { clipId: clip.id, timeline: { _playing: true } },
        _timeline: { _playing: true }, genEditTitle: {},
        _decorateClip: () => calls.push('badge'), _updateClipInfoPanel: () => calls.push('inspector'),
        _startGenEditAudioPlayback: () => calls.push('trim audio'), _startAudioPlayback: () => calls.push('main audio'),
        _saveToWidgets: () => calls.push('save'), _scheduleProgramPreview() {},
    };
    const mute = method('_setDirectorClipMuted');
    mute.call(app, clip, true);
    assert.equal(meta.muted, true);
    assert(app.genEditTitle.textContent.includes('muted_label'));
    assert.deepEqual(calls, ['badge', 'inspector', 'trim audio', 'main audio', 'save']);
    mute.call(app, clip, false);
    assert.equal(meta.muted, false);
    assert(!app.genEditTitle.textContent.includes('muted_label'));
}
console.log('Director separation mixes all sources, preserves placement, mutes only on success and guards removed clips');
