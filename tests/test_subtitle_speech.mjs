import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/editor/SubtitleSpeech.js', import.meta.url), 'utf8');
const sent = [];
const api = { async fetchApi(url, options) {
    const payload = JSON.parse(options.body); sent.push(payload);
    return { ok: true, json: async () => ({ file: `speech_${payload.subtitle_id}.wav`, duration_seconds: 2 }) };
} };
const { SubtitleSpeech, subtitleTiming } = new Function('api', 'T', source.replace(/^import .*;\r?\n/gm, '').replace(/export (class|function)/g, '$1') + '; return {SubtitleSpeech, subtitleTiming};')(api, key => key);
class Element {
    constructor() { this.nodes = new Map(); this.value = ''; this.children = []; this.open = false; this.style = {}; }
    querySelector(key) { if (!this.nodes.has(key)) this.nodes.set(key, new Element()); return this.nodes.get(key); }
    querySelectorAll() { return []; }
    append(child) { this.children.push(child); }
    add() {}
    addEventListener() {}
    pause() {}
    load() {}
    removeAttribute() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
}
globalThis.document = { createElement: () => new Element() };
globalThis.Option = class {};
const character = { id: 'girl', kind: 'image', voice_audio_id: 'voice' };
const reference = { id: 'voice', kind: 'audio', file: 'voice.wav' };
const clips = [
    { id: 's1', startTime: 10.25, duration: 3.5, track: { locked: false } },
    { id: 's2', startTime: 14.12, duration: 2.125, track: { locked: false } },
];
const added = [];
const app = {
    _timeline: { pause() {} }, _projectResources: [character, reference],
    _meta: new Map(clips.map(c => [c.id, { text: 'Hello', characterMediaId: 'girl', speechPrompt: '# private note\ncheerful' }])),
    _isNodeOnLiveGraph: () => true,
    _findMediaById: id => app._projectResources.find(r => r.id === id),
    _audioUrl: f => f, _recordUndo() {}, _saveToWidgets() {},
    async _addAudioAtTime(file, start, y, options) { assert.ok(options.canInsert()); added.push({ file, start }); },
};
const ui = new SubtitleSpeech(app, new Element());
ui.open(clips);
await ui.dialog.querySelector('[data-action="submit"]').onclick();
assert.equal(sent.length, 2);
assert.deepEqual(subtitleTiming(clips[0]), { start_ms: 10250, end_ms: 13750, duration_ms: 3500 });
assert.equal(sent[1].end_ms, 16245);
assert.equal(sent[0].prompt, 'cheerful');
assert.deepEqual(added.map(r => r.start), [10.25, 14.12]);
ui.open(clips, true);
await ui.dialog.querySelector('[data-action="submit"]').onclick();
assert.equal(sent.length, 2, 'binding must not send requests');
ui.open(clips);
app._projectResources = [...app._projectResources];
await ui.dialog.querySelector('[data-action="submit"]').onclick();
assert.equal(sent.length, 2, 'stale project must not send requests');
console.log('subtitle speech timing, serial requests, binding and stale-project guards passed');
