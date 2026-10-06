import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const utils = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const start = utils.indexOf('export function isEditingField(event) {');
const end = utils.indexOf('\n}', start) + 2;
globalThis.document = { activeElement: null };
const isEditingField = new Function(`${utils.slice(start, end).replace('export ', '')}; return isEditingField;`)();
function method(name) {
    const start = source.indexOf(`    ${name}(e) {`);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('isEditingField', `return ({${source.slice(start, end)}}).${name}`)(isEditingField);
}
const owner = {
    _overlay: { querySelector: () => null, classList: { contains: () => true } },
    aiOptimizeModal: { hidden: false }, genEditModal: { hidden: false },
    _stepAiOptimizeClip() { throw new Error('Editing must not switch Clips'); },
};
owner._blockingModal = owner.aiOptimizeModal;
owner.handleAiOptimizeKey = method('handleAiOptimizeKey');
const handleModal = method('handleModalKey');
const host = { closest: () => null };
function event(key, editing, flags = {}) {
    return { key, target: host, composedPath: () => editing ? [{ isContentEditable: true }, host] : [host],
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...flags };
}
for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'z', 'y', 'v']) {
    const e = event(key, true, { ctrlKey: ['z', 'y', 'v'].includes(key) });
    assert.equal(handleModal.call(owner, e), true);
    assert(!e.prevented && !e.stopped, `${key} must reach the shadow editor`);
}
for (const key of ['Backspace', 'Delete']) {
    const e = event(key, false);
    handleModal.call(owner, e);
    assert(e.prevented && e.stopped, 'Modal still blocks background deletion');
}
const handleGen = method('handleGenEditKey');
assert.equal(handleGen.call(owner, event('Delete', true)), false);
document.activeElement = { shadowRoot: { activeElement: { isContentEditable: true } } };
const e = event('Backspace', false);
handleModal.call(owner, e);
assert(!e.prevented, 'Focused shadow input is recognized when event path is unavailable');
console.log('Modal shadow editor: deletion, clipboard, undo and cursor keys preserved');

const inlineSource = readFileSync(new URL('../js/components/InlinePromptEditor.js', import.meta.url), 'utf8');
const keyStart = inlineSource.indexOf("this.editor.addEventListener('keydown', event => {") + "this.editor.addEventListener('keydown', event => {".length;
const keyEnd = inlineSource.indexOf('\n        });', keyStart);
const inlineKey = new Function('event', inlineSource.slice(keyStart, keyEnd));
for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']) {
    for (const shiftKey of [false, true]) {
        const e = {key, shiftKey, stopPropagation() {this.stopped = true;},
            preventDefault() {throw new Error('Native cursor movement must stay enabled');}};
        inlineKey.call({syncSelection() {}}, e);
        assert(e.stopped, `${key} must stay within the prompt editor`);
    }
}
console.log('Prompt arrows: native line/cursor movement and Shift selection preserved; canvas shortcuts isolated');
const textarea = {value: 'first line\n@reference last line', selectionStart: 5, selectionEnd: 5};
const selectedRanges = [];
const inline = {textarea, syncSelection() {}, setSelection(start, end) {selectedRanges.push([start, end]);},
    nativeSelection(start, end) {this.selectionStart = start; this.selectionEnd = end;}};
for (const modifier of ['ctrlKey', 'metaKey']) {
    const select = {key: 'a', [modifier]: true,
        preventDefault() {this.prevented = true;}, stopImmediatePropagation() {this.stopped = true;}};
    inlineKey.call(inline, select);
    assert(select.prevented && select.stopped);
    assert.deepEqual(selectedRanges.at(-1), [0, textarea.value.length]);
    assert.equal(textarea.selectionStart, 0);
    assert.equal(textarea.selectionEnd, textarea.value.length);
}
for (const key of ['Delete', 'Backspace']) {
    const deletion = {key, stopPropagation() {this.stopped = true;},
        preventDefault() {throw new Error('Deletion must reach beforeinput');}};
    inlineKey.call(inline, deletion);
    assert(deletion.stopped);
}
console.log('Prompt select-all stays inside the editor and synchronizes the full replacement range; deletion stays local.');
