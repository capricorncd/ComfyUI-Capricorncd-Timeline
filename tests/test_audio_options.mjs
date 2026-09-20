import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.dataset = {}; this.value = ''; this.disabled = false; }
    append(...children) { for (const child of children) { child.parentElement = this; this.children.push(child); } }
    add(option) { this.append(option); }
    querySelectorAll() { return this.children.flatMap(child => child.dataset.audioOption ? [child] : child.querySelectorAll()); }
    reportValidity() {
        return !this.value || this.type !== 'number' || (Number(this.value) >= Number(this.min) && Number(this.value) <= Number(this.max)
            && (this.step !== 1 || Number.isInteger(Number(this.value))));
    }
}
const source = readFileSync(new URL('../js/editor/AudioOptions.js', import.meta.url), 'utf8');
const AudioOptions = new Function('T', 'document', 'Option', source.replace(/^import .*;\r?\n/m, '').replace('export class', 'class') + '\nreturn AudioOptions;')(
    key => key, {createElement: tag => new Element(tag)}, class extends Element { constructor(label, value) { super('option'); this.value = value; } },
);
for (const kind of ['music', 'sfx', 'denoise', 'separation', 'tts', 'vc']) {
    const ui = new AudioOptions(new Element('details'), kind);
    assert.deepEqual(ui.values(), {}, `${kind}: empty options do not override defaults`);
    const fields = new Map(ui.root.querySelectorAll().map(input => [input.dataset.audioOption, input]));
    if (kind === 'tts') {
        fields.get('temperature').value = '0.6';
        fields.get('cfg_scale').value = '4';
        ui.setModel('qwen3-tts');
        assert.deepEqual(ui.values(), {temperature: 0.6});
        ui.setModel('breeze-tts2');
        assert.deepEqual(ui.values(), {cfg_scale: 4});
        ui.setModel('qwen3-tts');
        assert.deepEqual(ui.values(), {temperature: 0.6});
    }
    if (kind === 'sfx') {
        fields.get('count').value = '4';
        fields.get('negative_prompt').value = ' voices ';
        assert.deepEqual(ui.values(), {negative_prompt: 'voices', count: 4});
        fields.get('count').value = '5';
        assert.equal(ui.values(), null);
    }
    if (kind === 'music') {
        fields.get('generate_score').value = 'false';
        fields.get('cfg').value = '0';
        assert.deepEqual(ui.values(), {generate_score: false, cfg: 0});
    }
}
console.log('Audio options: optional defaults, numeric limits, zero/false and model-specific parameters passed');
