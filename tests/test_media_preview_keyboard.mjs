import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    handleMediaPreviewKey(e) {');
const end = source.indexOf('\n    }', start) + 6;
const handle = new Function(`return ({${source.slice(start, end)}}).handleMediaPreviewKey`)();
const owner = {
    _overlay: { classList: { contains: () => true } },
    mediaPreviewModal: { hidden: false }, rawMetaModal: { hidden: true },
    _mediaPreviewState: { browse: true },
    _stepMediaPreview(direction) { this.steps.push(direction); }, steps: [],
};
function event(key, tag = 'select', flags = {}) {
    return {
        key, target: { value: 'character', closest: selector => selector.split(',').map(s => s.trim()).includes(tag) },
        preventDefault() { this.prevented = true; },
        stopPropagation() { this.stopped = true; },
        stopImmediatePropagation() { this.immediate = true; }, ...flags,
    };
}
for (const [key, direction] of [['ArrowLeft', -1], ['ArrowRight', 1]]) {
    const e = event(key);
    assert.equal(handle.call(owner, e), true);
    assert.equal(owner.steps.at(-1), direction);
    assert(e.prevented && e.stopped && e.immediate, 'suppress native select and other handlers');
    assert.equal(e.target.value, 'character');
}
for (const key of ['ArrowUp', 'ArrowDown', 'Enter', ' ']) {
    const e = event(key);
    assert.equal(handle.call(owner, e), false);
    assert(!e.prevented, 'keep native option selection keys');
}
for (const tag of ['input', 'textarea', "[contenteditable='true']", "[role='tab']"]) {
    assert.equal(handle.call(owner, event('ArrowLeft', tag)), false, 'preserve text and tab navigation');
}
for (const flag of ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'isComposing']) {
    assert.equal(handle.call(owner, event('ArrowRight', 'select', { [flag]: true })), false);
}
owner.rawMetaModal.hidden = false;
assert.equal(handle.call(owner, event('ArrowRight')), false);
owner.rawMetaModal.hidden = true;
owner._mediaPreviewState.browse = false;
assert.equal(handle.call(owner, event('ArrowRight')), false);
owner._mediaPreviewState.browse = true;
owner.mediaPreviewModal.hidden = true;
assert.equal(handle.call(owner, event('ArrowRight')), false);
console.log('Media preview keyboard: select arrows browse once, native defaults prevented, other controls preserved');
