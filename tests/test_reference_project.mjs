import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

class Element {
    constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.events = {}; this.isConnected = true; this.textContent = ''; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; }
    setAttribute(key, value) { this.attributes[key] = value; }
    removeAttribute(key) { delete this.attributes[key]; }
    addEventListener(key, fn) { this.events[key] = fn; }
    querySelectorAll() { return []; }
    setStatus(text) { this.textContent = text; }
    show() { this.open = true; }
    remove() { this.isConnected = false; }
    focus() {}
}
const project = { name: '<img onerror=alert(1)>', settings: { width: 1344, height: 768, prepend_prompt: '全局提示词' }, media: [
    { id: 'image', kind: 'image', file: 'media/a.png' }, { id: 'video', kind: 'video', file: 'media/b.mp4' },
], tracks: [
    { name: '同名', type: 'audio', clips: [] },
    { name: '同名', type: 'director', clips: [{ id: 'one', prompt: '<script>文本</script>', media_ids: ['image', 'video', 'missing'] }] },
    { name: '同名', type: 'director', clips: [] },
] };
let calls = 0, result = { project, token: 'test', available: ['0', '1'] }, copied;
const context = vm.createContext({
    iconHtml: name => `<svg data-icon="${name}"></svg>`, setTimeout, clearTimeout,
    document: { createElement: tag => new Element(tag) },
    makeT: dictionary => key => dictionary.zh[key] || key,
    navigator: { clipboard: { writeText: async text => { copied = text; } } },
    fetch: async () => { calls++; return { ok: !result.error, json: async () => result }; },
});
const source = readFileSync(new URL('../js/editor/ReferenceProject.js', import.meta.url), 'utf8');
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nglobalThis.ReferenceProject = ReferenceProject;', context);
const reference = new context.ReferenceProject({ host: new Element('host'), apiURL: path => path });
await reference.open();
assert.equal(calls, 1);
assert.equal(reference.tabs.children.length, 4, 'duplicate names stay separate');
assert.equal(reference.rows[0].index, 1, 'director is first');
assert.equal(reference.tabs.children[0].attributes['aria-selected'], 'true');
assert.equal(reference.projectName.textContent, '<img onerror=alert(1)>');
const card = reference.body.children[0];
await card.children[1].children[1].children[0].children[0].children[1].events.click();
assert.equal(copied, '<script>文本</script>', 'copy exact prompt');
const previews = card.children[1].children[0].children;
assert.equal(previews[0].children[0].tag, 'img');
assert.equal(previews[1].children[0].tag, 'video');
assert.equal(previews[1].children[0].controls, true);
assert.equal(previews[2].children[0].textContent, '素材不可用');
reference.select(3);
assert.equal(reference.body.children[0].children.length, 2, 'dimensions grouped together');
assert.equal(reference.body.children.length, 2, 'global prompt follows dimensions');
await reference.open();
assert.equal(calls, 1, 'reopen uses cached project');
result = { cancelled: true };
await reference.load();
assert.equal(reference.data.project, project, 'cancel preserves loaded reference');
result = { error: 'Invalid project.json' };
await reference.load();
assert.equal(reference.data.project, project, 'failure preserves loaded reference');
assert.equal(reference.status.textContent, 'Invalid project.json');
assert.equal(reference.loadButton.disabled, false);
assert.equal(JSON.stringify(project.tracks[0].clips), '[]', 'reference loading does not mutate project');
console.log('Reference project UI behavior passed');
