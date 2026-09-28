import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
let extension;
const elements = [];
const document = {createElement: tag => {
    const element = {tag, events: {}, addEventListener(name, callback) { this.events[name] = callback; }, close() {this.closed = true;}, remove() {this.removed = true;}};
    elements.push(element);
    return element;
}};
const source = readFileSync(new URL('../js/cap_h3_prompt_generator.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '');
new Function('app', 'api', 'T', 'document', source)({registerExtension: value => {extension = value;}}, {}, key => key, document);
class Node {
    constructor() {this.widgets = [{name:'skill_preset', options:{values:['none']}, value:'none'}, {name:'skill', value:'extra instructions'}];}
    addDOMWidget(name) {const widget = {name}; this.widgets.push(widget); return widget;}
    setDirtyCanvas() {this.dirty = true;}
}
extension.beforeRegisterNodeDef(Node, {name:'CAP_H3AutoPromptConfig'});
const node = new Node(); node.onNodeCreated();
assert.deepEqual(node.widgets.map(widget => widget.name), ['skill_preset','skill_picker','skill']);
assert.equal(node.widgets[1].serialize, false);
elements[1].events['skill-select']({detail:{skill:{id:'custom__123',title:'Custom Skill'}}});
assert.equal(node.widgets[0].value, 'Custom Skill [custom__123]');
assert.equal(node.widgets[2].value, 'extra instructions');
assert.equal(elements[1].closed, true);
node.onRemoved(); assert.equal(elements[1].removed, true);
console.log('PASS: node picker placement, preset application, serialization and cleanup');
