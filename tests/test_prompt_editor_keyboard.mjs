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
for (const key of ['Backspace', 'Delete', 'ArrowLeft', 'ArrowRight', 'z', 'y', 'v']) {
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
