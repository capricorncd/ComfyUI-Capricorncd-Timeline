import { formatTimecode } from '../js/timecode.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
class Element extends EventTarget {
    constructor() { super(); this.style = {}; this.children = []; this.value = ''; }
    setAttribute() {}
    replaceChildren() { this.children = []; }
    append(child) { this.children.push(child); }
    attachShadow() {
        const nodes = new Map();
        this.shadowRoot = {querySelector(key) { if (!nodes.has(key)) nodes.set(key, new Element()); return nodes.get(key); }};
        return this.shadowRoot;
    }
}
globalThis.document = {createElement: () => new Element()};
const code = readFileSync(new URL('../js/components/ShotControl.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const {ShotControl, shotPrompt} = new Function('formatTimecode', 'HTMLElement', 'customElements', code + ';return {ShotControl, shotPrompt};')(formatTimecode, Element, {get: () => true});
const shots = new ShotControl();
const point = {time: 2, description: 'Existing prompt'};
const labels = {title: 'Keyframe', description: 'Prompt', hint: 'Move with arrows', delete: 'Delete', insert: 'Insert'};
shots.configure(point, 209/24, 24, false, labels);
assert.equal(shots.description.value, 'Existing prompt');
assert.equal(shots.hidden, false);
assert.equal(shots.shadowRoot.querySelector('.time').textContent, '00:08.17');
let edited, deleted = false, inserted = false;
shots.addEventListener('prompt-change', event => edited = event.detail);
shots.addEventListener('delete', () => deleted = true);
shots.addEventListener('insert', () => inserted = true);
shots.description.value = 'Changed prompt';
shots.description.dispatchEvent(new Event('input'));
assert.equal(edited, 'Changed prompt');
assert.equal(point.description, 'Existing prompt', 'The component emits changes; caller owns data');
shots.shadowRoot.querySelector('[data-delete]').onclick();
shots.shadowRoot.querySelector('[data-insert]').onclick();
assert.equal(deleted && inserted, true);
shots.configure(point, 0, 24, true, labels);
assert.equal(shots.description.disabled, true);
assert.equal(shots.shadowRoot.querySelector('[data-delete]').disabled, true);
shots.configure(null, 0, 24, false, labels);
assert.equal(shots.hidden, true);
console.log('Shot settings: prompt events, delete/insert actions, locked state and frame time passed.');

assert.equal(shotPrompt([{time: 60, description: 'Next'}, {time: 5, description: ' First '}]),
    'detailed_description:\n[Shot 1] At 00:05.000, First\n[Shot 2] At 01:00.000, Next');
assert.equal(shotPrompt([{time: 59.9996, description: 'Cut'}]),
    'detailed_description:\n[Shot 1] At 01:00.000, Cut');
assert.equal(shotPrompt([{time: 1 / 24, description: 'Frame'}]),
    'detailed_description:\n[Shot 1] At 00:00.042, Frame');
assert.equal(shotPrompt([]), '');
