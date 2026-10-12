import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.events = {}; this.attributes = {}; }
    append(...children) { this.children.push(...children); }
    appendChild(child) { this.append(child); }
    replaceChildren() { this.children = []; }
    setAttribute(key, value) { this.attributes[key] = value; }
    addEventListener(key, fn) { this.events[key] = fn; }
    setStatus(text, state) { this.textContent = text; this.state = state; this.hidden = !text; }
}
let extension, pending;
const requests = [];
const api = {
    apiURL: url => url,
    fetchApi: (url, options) => { requests.push({url, options}); return new Promise(resolve => pending = resolve); },
};
const app = {registerExtension: value => extension = value};
vm.runInNewContext(readFileSync(new URL('../js/cap_save_images.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, ''), {
    app, api, document: {createElement: tag => new Element(tag)}, loadExtensionCss() {}, t: key => key,
});
class Node {
    size = [300, 200];
    widgets = [];
    graph = {setDirtyCanvas() {}};
    onExecuted() { this.originalCalled = true; }
    addDOMWidget(name, type, root, options) { const widget = {name, type, root, options}; this.widgets.push(widget); return widget; }
    computeSize() { return [300, 460]; }
    setSize(size) { this.size = size; }
}
extension.beforeRegisterNodeDef(Node, {name: 'CAP_SaveImages'});
const node = new Node();
node.onExecuted({cap_saved_images: [
    {filename: '中文, one.png', token: 'first', index: 0},
    {filename: 'two.png', token: 'first', index: 1},
]});
assert(node.originalCalled);
assert.equal(node.widgets.length, 1);
assert.equal(node.widgets[0].serialize, false);
assert.equal(node._capSavedImages.children.length, 2);
const [image, button, status] = node._capSavedImages.children[1].children;
assert.equal(image.src, '/cap/saved_images/first/1');
assert.equal(image.alt, 'two.png');
assert.equal(button.tag, 'cap-button');
const event = {preventDefault() {}, stopPropagation() {}};
const clicking = button.events.click(event);
assert.equal(button.disabled, true);
await button.events.click(event);
assert.equal(requests.length, 1, 'busy button ignores duplicate clicks');
assert.equal(requests[0].url, '/cap/saved_images/first/1/reveal', 'second image selects its own file');
assert.equal(requests[0].options.method, 'POST');
pending({ok: true});
await clicking;
assert.equal(button.disabled, false);
assert(status.hidden);
const failing = button.events.click(event);
pending({ok: false, text: async () => 'File missing'});
await failing;
assert.equal(status.state, 'error');
assert.match(status.textContent, /File missing/);
assert.equal(button.disabled, false);
node.onExecuted({cap_saved_images: [{filename: 'new.png', token: 'second', index: 0}]});
assert.equal(node.widgets.length, 1, 'repeat execution reuses the preview widget');
assert.equal(node._capSavedImages.children.length, 1, 'repeat execution replaces previous results');
assert.equal(node._capSavedImages.children[0].children[0].src, '/cap/saved_images/second/0');
console.log('Saved images: per-image reveal, repeat execution, busy state and failure feedback passed.');
