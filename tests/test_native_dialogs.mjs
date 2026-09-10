import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    const end = source.indexOf('\n    }', start) + 6;
    assert(start >= 0);
    return new Function(`return ({${source.slice(start, end)}}).${name}`)();
}
let focused = 0;
const shell = { style: {} };
const modal = {
    hidden: false, style: {}, classList: { contains: () => false },
    contains: () => false,
    querySelector(selector) {
        if (selector === '.cat-te-modal-close') return { focus() { focused++; } };
        if (selector === '.cat-te-modal') return {
            closest: () => null,
            querySelector: () => ({ addEventListener() {} }),
        };
        return shell;
    },
};
const native = { tagName: 'DIALOG', open: true, inert: true };
const background = { tagName: 'DIV' };
globalThis.document = { activeElement: null };
globalThis.MutationObserver = class { constructor(fn) { this.fn = fn; } observe() {} };
const app = {
    _overlay: {
        children: [modal, native, background],
        querySelectorAll: () => [modal],
        querySelector: () => native.open ? native : null,
        classList: { contains: () => true },
    },
    _timeline: {},
};
method('_bindModalInteractions').call(app);
assert.equal(native.inert, false, 'nested native dialog must remain clickable');
assert.equal(background.inert, true, 'background remains blocked');
assert.equal(modal.inert, false);
assert.equal(focused, 0, 'do not steal focus from the native dialog');
for (const key of ['Escape', 'Tab', 'Delete', ' ']) {
    assert.equal(method('handleModalKey').call(app, {
        key,
        preventDefault() { assert.fail('native dialog default behavior must be preserved'); },
        stopImmediatePropagation() { assert.fail('native dialog must receive the event'); },
    }), true);
}
console.log('Native dialog interaction, focus and keyboard ownership passed');
