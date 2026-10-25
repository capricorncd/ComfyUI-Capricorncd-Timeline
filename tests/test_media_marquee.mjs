import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name, isEditingField = () => false) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0);
    return new Function('isEditingField', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(isEditingField);
}
function emitter() {
    const listeners = new Map();
    return {
        addEventListener(type, fn) { listeners.set(type, fn); },
        removeEventListener(type, fn) { if (listeners.get(type) === fn) listeners.delete(type); },
        fire(type, e) { listeners.get(type)?.(e); },
        has(type) { return listeners.has(type); },
    };
}
function card(key, left, top, right, bottom) {
    const classes = new Set();
    return {
        ...emitter(),
        dataset: {mediaKey:key},
        classList: {
            toggle(name, active) { active ? classes.add(name) : classes.delete(name); },
            has(name) { return classes.has(name); },
        },
        getBoundingClientRect: () => ({left, top, right, bottom, width:right-left, height:bottom-top}),
        setPointerCapture() {},
        releasePointerCapture() {},
    };
}
const cards = [
    card('image:a.png', 20, 20, 80, 80),
    card('video:b.mp4', 120, 20, 180, 80),
    card('audio:c.wav', 120, 110, 180, 170),
];
const grid = {
    ...emitter(),
    querySelectorAll: () => cards,
    getBoundingClientRect: () => ({left:0, top:0, right:300, bottom:200}),
    focus() { document.activeElement = this; },
    contains(el) { return el === this; },
};
const boxes = [];
globalThis.window = emitter();
globalThis.document = {
    activeElement: null,
    createElement() { return {style:{}, remove() { this.removed = true; }}; },
    body: {appendChild(el) { boxes.push(el); }},
};
let renders = 0;
let deletes = 0;
const app = {
    _assetLibraryTab:'media', _mediaBatchMode:false, _mediaBatchSelected:new Set(),
    mediaGrid:grid, _overlay:{classList:{contains:() => true}},
    _applyMediaGridView() {}, _renderMediaStarFilter() { renders++; },
    _deleteSelectedLibraryMedia() { deletes++; },
    _clearMediaDragVisuals() {},
};
app._bindMediaMarquee = method('_bindMediaMarquee');
app._bindMediaMarquee();
const event = (x, y, target = null, shiftKey = false) => ({
    button:0, pointerType:'mouse', pointerId:1, clientX:x, clientY:y, shiftKey,
    target: {closest: () => target}, preventDefault() {},
});
grid.fire('pointerdown', event(30, 30, cards[0]));
assert(!window.has('pointermove'), 'normal card drag remains independent of marquee');
grid.fire('pointerdown', event(5, 5));
window.fire('pointermove', event(8, 8));
assert.equal(app._mediaBatchMode, false, 'clicks and small movement do not start selection');
window.fire('pointermove', event(175, 70));
assert.equal(app._mediaBatchMode, true);
assert.deepEqual([...app._mediaBatchSelected], ['image:a.png', 'video:b.mp4']);
assert.equal(boxes.length, 1);
assert.equal(document.activeElement, grid);
window.fire('pointermove', event(95, 95));
assert.deepEqual([...app._mediaBatchSelected], ['image:a.png'], 'selection follows rectangle');
assert.equal(cards[1].classList.has('cat-te-media-selected'), false);
window.fire('pointerup', event(95, 95));
assert.equal(boxes[0].removed, true);
assert(!window.has('pointermove'));
assert(renders > 1);

grid.fire('pointerdown', event(5, 95, null, true));
window.fire('pointermove', event(170, 160));
assert.deepEqual([...app._mediaBatchSelected], ['image:a.png', 'audio:c.wav'], 'Shift extends selection');
window.fire('pointerup', event(170, 160));

grid.fire('pointerdown', event(130, 130, cards[2]));
window.fire('pointermove', event(125, 60));
assert.equal(cards[2]._catTeSuppressClick, true, 'marquee from a card suppresses its click');
assert.deepEqual([...app._mediaBatchSelected], ['video:b.mp4', 'audio:c.wav'], 'new marquee replaces selection');
window.fire('pointerup', event(125, 60));

const key = {key:'Delete', repeat:false, preventDefault() {this.prevented=true;},
    stopPropagation() {}, stopImmediatePropagation() {}};
assert.equal(method('handleDeleteKey').call(app, key), true);
assert.equal(key.prevented, true);
assert.equal(deletes, 1, 'Delete uses batch deletion when media grid is focused');

const drag = method('_bindMediaPointerDrag');
drag.call(app, cards[0], 'image', 'a.png');
cards[0].fire('pointerdown', event(30, 30));
assert(!window.has('pointermove'), 'batch mode never starts the timeline media drag');
app._mediaBatchMode = false;
cards[0].fire('pointerdown', event(30, 30));
assert(window.has('pointermove'), 'normal mode can still drag media to timeline');
app._abortMediaDrag();
app._abortMediaMarquee?.();
console.log('Media marquee: threshold, selection, Shift, card click, Delete and timeline drag passed');
