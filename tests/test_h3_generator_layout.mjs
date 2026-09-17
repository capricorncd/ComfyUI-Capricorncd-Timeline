import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

let extension;
const pending = [];
const scope = {app: {registerExtension: e => extension = e}, requestAnimationFrame: cb => pending.push(cb)};
vm.runInNewContext(readFileSync(new URL('../js/cap_h3_video_generator.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, ''), scope);
const oldWidgets = ['steps', 'strict_keyframes', 'second_sampling', 'first_pass_megapixels',
    'upscaler_model', 'refine_sigmas', 'audio_refine', 'audio_refine_steps', 'normalize_audio',
    'attention', 'compose_final', 'sampling_preview', 'preview_tiny_vae', 'generate_audio'];
const currentWidgets = [...oldWidgets, 'motion_deblur'];
const expected = ['steps', 'strict_keyframes', 'attention', 'second_sampling', 'first_pass_megapixels',
    'upscaler_model', 'refine_sigmas', 'motion_deblur', 'sampling_preview', 'preview_tiny_vae', 'generate_audio',
    'audio_refine', 'audio_refine_steps', 'normalize_audio', 'compose_final'];
const oldInputs = ['model', 'clip', 'vae', 'audio_vae', 'data_json', 'base_model']
    .map((name, i) => ({name, link: i + 1}));
const savedInputs = [...oldInputs, ...oldWidgets.map(name => ({name, widget: {name}, link: null}))];
class Node {
    constructor() {
        this.id = 9;
        this.comfyClass = 'CAP_H3VideoGenerator';
        this.inputs = structuredClone(oldInputs);
        this.widgets = currentWidgets.map(name => ({name, value: name === 'motion_deblur' ? false : `default:${name}`}));
        this.widgets.push({name: 'stv_ui', serialize: false});
    }
    configure(info) {
        if (info.inputs) this.inputs = structuredClone(info.inputs);
        info.widgets_values.forEach((value, i) => this.widgets[i].value = value);
    }
}
await extension.beforeRegisterNodeDef(Node, {name: 'CAP_H3VideoGenerator', input: {
    required: Object.fromEntries(oldWidgets.slice(0, 10).map(name => [name, {}])),
    optional: Object.fromEntries(currentWidgets.slice(10).map(name => [name, {}])),
}});
const node = new Node();
node.onNodeCreated();
assert.deepEqual(node.inputs.map(i => i.name), ['model', 'base_model', 'clip', 'vae', 'audio_vae', 'data_json']);
assert.deepEqual(node.widgets.map(w => w.name), [...expected, 'stv_ui']);
const values = Object.fromEntries(oldWidgets.map(name => [name, `saved:${name}`]));
values.motion_deblur = false;
for (const inputs of [savedInputs, oldInputs, [...oldInputs, {name: 'steps', widget: {name: 'steps'}}]]) {
    node.configure({inputs, widgets_values: oldWidgets.map(name => values[name])});
    const links = new Map(oldInputs.map(input => [input.link, {target_id: 9, target_slot: -1}]));
    node.graph = {getLink: id => links.get(id)};
    pending.splice(0).forEach(cb => cb());
    assert.deepEqual(node.inputs.slice(0, 6).map(i => i.name), ['model', 'base_model', 'clip', 'vae', 'audio_vae', 'data_json']);
    node.inputs.forEach((input, i) => {if (input.link) assert.equal(links.get(input.link).target_slot, i);});
    expected.forEach(name => assert.equal(node.widgets.find(w => w.name === name).value, values[name]));
}
node.configure({properties: {cap_h3_widget_order: expected.filter(name => name !== 'motion_deblur')},
    widgets_values: expected.filter(name => name !== 'motion_deblur').map(name => values[name])});
pending.splice(0).forEach(cb => cb());
expected.forEach(name => assert.equal(node.widgets.find(w => w.name === name).value, values[name]));
values.motion_deblur = true;
const serialized = {widgets_values: expected.map(name => values[name])};
node.onSerialize(serialized);
assert.deepEqual(Array.from(serialized.properties.cap_h3_widget_order), expected);
node.configure(serialized);
pending.splice(0).forEach(cb => cb());
expected.forEach(name => assert.equal(node.widgets.find(w => w.name === name).value, values[name]));
node.configure({inputs: oldInputs, widgets_values: oldWidgets.map(name => values[name])});
pending.splice(0).forEach(cb => cb());
assert.equal(node.widgets.find(w => w.name === 'motion_deblur').value, false);
extension.loadedGraphNode(node);
assert.equal(node.widgets.at(-1).name, 'stv_ui');
assert.equal(node.widgets.at(-2).name, 'compose_final');
console.log('H3 layout: adjacent models, ordered options, preserved values/links and reload passed.');
