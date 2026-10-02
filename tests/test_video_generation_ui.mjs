import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoPromptUpdates } from '../js/editor/VideoPromptRestore.js';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _showGenVideoGeneration(');
const end = source.indexOf('\n    _stepGenVideoPreview(', start);
class Element {
    constructor() { this.children = []; this.style = {}; this.handlers = {}; this.isConnected = true; }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); }
    replaceChildren() { this.children = []; this.textContent = ''; }
    addEventListener(name, handler) { this.handlers[name] = handler; }
}
globalThis.document = { createElement: () => new Element() };
let record = { clip_id: 'original', seed: '42', seeds: [], models: [], sampling: [] };
const api = { fetchApi: async () => ({ ok: true, json: async () => ({ generation: record }) }) };
const show = new Function('T', 'api', 'videoPromptUpdates', 'return ({' + source.slice(start, end) + '})._showGenVideoGeneration')(x => x, api, videoPromptUpdates);
const host = new Element();
const clip = { id: 'current', track: { locked: false } };
const meta = { seed: 1 };
let undo = 0, saved = 0;
const app = {
    genVideoModal: { hidden: false, querySelector: () => host },
    _findClipById: () => clip, _recordUndo: () => undo++, _ensureClipMeta: () => meta,
    _meta: new Map(), _syncSelectedClip() {}, _saveToWidgets: () => saved++,
};
await show.call(app, clip, { file: 'folder/video.mp4' });
assert.equal(meta.seed, 1, 'display must not change seed');
const seedButton = () => host.children.flatMap(child => child.children).find(child => child.handlers.click);
const button = seedButton();
button.handlers.click();
assert.equal(meta.seed, 42);
assert.equal(undo, 1);
assert.equal(saved, 1);
clip.track.locked = true;
button.handlers.click();
assert.equal(saved, 1, 'locked track cannot be changed');
clip.track.locked = false;
record.seed = '18446744073709551615';
await show.call(app, clip, { file: 'video.mp4' });
assert.equal(seedButton().disabled, true);
seedButton().handlers.click();
assert.equal(saved, 1, 'unsafe integer cannot be applied');
record = null;
await show.call(app, clip, { file: 'old.mp4' });
assert.equal(host.textContent, 'video_generation_unavailable');
record = {kind:'composition', clips:[{file:'first.mp4', generation:{seed:'18446744073709551615', prompts:[{text:'A full shot prompt'}]}}, {file:'old.mp4', generation:null}]};
await show.call(app, null, {file:'final.mp4'}, host);
assert.equal(host.children[1].children[0].textContent, 'first.mp4');
assert.equal(host.children[1].children[1].textContent, 'Seed: 18446744073709551615\n\nA full shot prompt');
assert.equal(host.children[2].children[1].textContent, 'video_generation_unavailable');
assert.equal(seedButton(), undefined, 'project details cannot apply seeds to an unrelated Clip');
console.log('Video metadata UI: seed application, lock, precision, and legacy checks passed.');
