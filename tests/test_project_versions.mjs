import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

class Element extends EventTarget {
    constructor(tag) { super(); this.tag = tag; this.children = []; this.style = {setProperty() {}}; }
    append(...children) { this.children.push(...children); if (this.tag === 'select') this.value ??= children[0]?.value; }
    setAttribute() {}
    showModal() { this.open = true; }
    close() { this.open = false; this.dispatchEvent(new Event('close')); }
    remove() { this.removed = true; }
}
const host = new Element('host');
const context = vm.createContext({
    document: {body: host, createElement: tag => new Element(tag)},
    makeT: table => key => table.en[key],
    window: {__COMFYUI_LAUNCHER__: {pickDirectory: async () => 'directory'}},
});
const source = readFileSync(new URL('../js/editor/LauncherProject.js', import.meta.url), 'utf8');
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nglobalThis.Project = LauncherProject;', context);
const versions = [{filename: 'project.new.json', modified: Date.now()}, {filename: 'project.json', modified: 1}];
let promise = context.chooseProjectVersion(versions);
let dialog = host.children.at(-1);
assert.equal(dialog.tag, 'cap-dialog');
const select = dialog.children[1].children[0];
assert.equal(select.children.length, 2);
select.value = 'project.json';
dialog.children[2].children[1].onclick();
assert.equal(await promise, 'project.json');
assert.equal(dialog.removed, true);
promise = context.chooseProjectVersion(versions);
dialog = host.children.at(-1);
dialog.close();
assert.equal(await promise, null);
assert.equal(await context.chooseProjectVersion([versions[0]]), 'project.new.json');
const project = new context.Project(path => path);
const calls = [];
project.request = async (action, body) => { calls.push(body); return body.filename ? {project: {name: 'chosen'}} : {versions}; };
promise = project.open();
await new Promise(resolve => setImmediate(resolve));
dialog = host.children.at(-1);
dialog.children[2].children[1].onclick();
assert.equal((await promise).project.name, 'chosen');
assert.equal(calls[1].filename, 'project.new.json');
console.log('PASS: version selection, cancellation, single-file import and selected-file request');
