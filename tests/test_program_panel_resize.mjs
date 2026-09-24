import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _bindProgramPanelResize()');
const method = source.slice(start, source.indexOf('\n    _viewportRightPaddingSec()', start));
const handlers = new Map();
const document = {body: {classList: {add() {}, remove() {}}},
    addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => handlers.delete(name)};
let windowResize, saved;
const window = {addEventListener: (_, fn) => windowResize = fn};
const localStorage = {setItem: (_, value) => saved = Number(value)};
const bind = new Function('document', 'window', 'localStorage', 'STORAGE_PROGRAM_PANEL_H',
    'return ({' + method + '})._bindProgramPanelResize;')(document, window, localStorage, 'height');
const panel = {offsetHeight: 420};
let down;
const owner = {
    programRoot: {get offsetHeight() { return panel.offsetHeight - 64; }},
    _overlay: {querySelector: selector => selector === '.cat-te-main' ? panel : null, classList: {contains: () => true}},
    programSplit: {addEventListener: (_, fn) => down = fn, classList: {add() {}, remove() {}}},
    _setProgramPanelHeight(height) { panel.offsetHeight = Math.max(120, Math.min(700, height)); return panel.offsetHeight; },
    _scheduleProgramPreview() {}, _refreshTimelineDuration() {},
};
bind.call(owner);
for (const delta of [-80, 120, -20]) {
    const initial = panel.offsetHeight;
    down({button: 0, clientY: 300, preventDefault() {}});
    handlers.get('mousemove')({clientY: 300 + delta});
    assert.equal(panel.offsetHeight, initial + delta, 'Drag uses the entire top panel');
    const beforeRelease = panel.offsetHeight;
    handlers.get('mouseup')();
    assert.equal(panel.offsetHeight, beforeRelease, 'Release must not subtract playback bar height');
    assert.equal(saved, beforeRelease);
}
const beforeClick = panel.offsetHeight;
down({button: 0, clientY: 300, preventDefault() {}});
handlers.get('mouseup')();
assert.equal(panel.offsetHeight, beforeClick, 'Clicking without dragging must not change height');
windowResize(); windowResize();
assert.equal(panel.offsetHeight, beforeClick, 'Window resize must not repeatedly shrink the preview');
assert.equal(handlers.size, 0);
console.log('Timeline splitter preserves height on release, click and repeated window resize.');
