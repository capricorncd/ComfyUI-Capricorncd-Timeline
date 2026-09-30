import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

let extension;
const frames = [];
const source = readFileSync(new URL('../js/cap_show_anything.js', import.meta.url), 'utf8');
vm.runInNewContext(source.replace(/^import .*;$/gm, ''), {
    app: {registerExtension(value) {extension = value;}, graph: {setDirtyCanvas() {}}},
    ComfyWidgets: {STRING(node, name) {
        const widget = {name, inputEl: {style: {}}, onRemove() {this.removed = true;}};
        node.widgets.push(widget);
        return {widget};
    }},
    bindRichPromptWidget(widget) {widget.inputEl.rich = true;},
    detachRichPromptHandler(input) {input.rich = false;},
    requestAnimationFrame(fn) {frames.push(fn);},
});
class Node {
    constructor(format = false) {this.widgets = [{name: 'format_json', value: format}]; this.size = [300, 200];}
    computeSize() {return [300, 200];}
}
await extension.beforeRegisterNodeDef(Node, {name: 'CAP_ShowAnything'});
const text = '// Clip a · output.mp4\nsubject_definitions:\n<Picture 1>: person';
const node = new Node();
node.onNodeCreated();
node.onExecuted({text: [text]});
frames.splice(0).forEach(fn => fn());
let widget = node.widgets[1];
assert.equal(widget.value, text);
assert.equal(widget.inputEl.readOnly, true);
assert.equal(widget.inputEl.rich, true);
assert.equal(node.widgets_values[0], false);
node.widgets[0].value = true;
node.widgets[0].callback();
assert.equal(node.widgets[0].disabled, true);
assert.equal(node.widgets[0].value, false);
assert.equal(widget.inputEl.rich, true);
node.widgets[0].value = false;
node.widgets[0].callback();
assert.equal(widget.inputEl.rich, true);
node.onExecuted({text: ['// next\nnew prompt']});
assert.equal(widget.removed, true);
assert.equal(widget.inputEl.rich, false);
frames.splice(0).forEach(fn => fn());
const restored = new Node();
restored.widgets_values = node.widgets_values;
restored.onConfigure();
frames.splice(0).forEach(fn => fn());
assert.equal(restored.widgets[1].value, '// next\nnew prompt');
assert.equal(restored.widgets[1].inputEl.rich, true);
restored.onRemoved();
assert.equal(restored.widgets[1].inputEl.rich, false);
const jsonNode = new Node(true);
jsonNode.widgets_values = [true, '{"url":"https://example.com"}'];
jsonNode.onConfigure();
frames.splice(0).forEach(fn => fn());
assert.equal(jsonNode.widgets[1].inputEl.rich, false);
assert.equal(jsonNode.widgets[1].value, '{"url":"https://example.com"}');
console.log('PASS: raw comments, JSON toggle, persistence and display cleanup');

assert.equal(jsonNode.widgets[0].disabled, false);
jsonNode.onNodeCreated();
jsonNode.widgets[0].value = false;
jsonNode.widgets[0].callback();
assert.equal(jsonNode.widgets[1].inputEl.rich, true);
jsonNode.widgets[0].value = true;
jsonNode.widgets[0].callback();
assert.equal(jsonNode.widgets[1].inputEl.rich, false);
for (const invalid of ['', '{"a":1,}', "{'a':1}", '// note\n{"a":1}', 'NaN', 'undefined']) {
    jsonNode.onExecuted({text: [invalid]});
    assert.equal(jsonNode.widgets[0].disabled, true, invalid);
    assert.equal(jsonNode.widgets[0].value, false);
    assert.equal(jsonNode.widgets[1].value, invalid);
}
for (const valid of ['{}', '[]', 'null', 'true', '42', '"text"']) {
    jsonNode.onExecuted({text: [valid]});
    assert.equal(jsonNode.widgets[0].disabled, false, valid);
}
jsonNode.onExecuted({text: ['{}', 'plain text']});
assert.equal(jsonNode.widgets[0].disabled, true);
const oldRaw = new Node(true);
oldRaw.widgets_values = [true, '// saved prompt'];
oldRaw.onConfigure();
assert.equal(oldRaw.widgets[0].value, false);
assert.equal(oldRaw.widgets_values[0], false);
assert.equal(oldRaw.widgets[1].inputEl.rich, true);
console.log('PASS: strict JSON eligibility, mixed values, recovery and workflow reload');
