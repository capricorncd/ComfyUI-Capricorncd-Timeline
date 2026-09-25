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
const points = [];
shots.configure(points, 24, 24, 72, {});
let frame;
shots.addEventListener('seek', event => frame = event.detail.frame);
const key = key => ({key, preventDefault() {}, stopPropagation() {}});
shots.cursor.onkeydown(key('ArrowRight'));
assert.equal(frame, 25);
shots.cursor.onkeydown(key('ArrowLeft'));
assert.equal(frame, 24);
shots.cursor.onkeydown(key('ArrowLeft'));
assert.equal(frame, 24, 'Cursor stays inside the trim range');
shots.addButton.onclick();
shots.addButton.onclick();
assert.equal(points.length, 1, 'Repeated marking selects the same point');
shots.description.value = 'Opening shot'; shots.description.oninput();
shots.seek(48); shots.addButton.onclick();
shots.description.value = 'Close-up'; shots.description.oninput();
assert.equal(shotPrompt(points), 'detailed_description:\n[Shot 1] At 00:01.000, Opening shot\n[Shot 2] At 00:02.000, Close-up');
shots.shadowRoot.querySelector('.markers').children[0].onclick();
assert.equal(frame, 24);
assert.equal(shots.description.value, 'Opening shot');
shots.deleteButton.onclick();
assert.equal(points.length, 1);
assert.equal(points[0].description, 'Close-up');
assert.equal(shots.description.disabled, true);
console.log('Shot control supports frame stepping, unique markers, selection, descriptions and deletion.');

shots.configure([], 24, 0, 1000, {});
shots.update(209);
assert.equal(shots.shadowRoot.querySelector('.time').textContent, '00:08.17');

assert.equal(shotPrompt([{time: 60, description: 'Next'}, {time: 5, description: ' First '}]),
    'detailed_description:\n[Shot 1] At 00:05.000, First\n[Shot 2] At 01:00.000, Next');
assert.equal(shotPrompt([{time: 59.9996, description: 'Cut'}]),
    'detailed_description:\n[Shot 1] At 01:00.000, Cut');
assert.equal(shotPrompt([{time: 1 / 24, description: 'Frame'}]),
    'detailed_description:\n[Shot 1] At 00:00.042, Frame');
assert.equal(shotPrompt([]), '');
