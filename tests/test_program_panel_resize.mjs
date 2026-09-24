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

const storage = new Map();
const panelStorage = {getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value)};
function layoutMethod(name) {
    const begin = source.indexOf('    ' + name + '(');
    return new Function('localStorage', 'STORAGE_MEDIA_PANEL_W', 'STORAGE_SIDEBAR_PANEL_W', 'STORAGE_PROGRAM_PANEL_H',
        'MIN_MEDIA_PANEL_W', 'MIN_SIDEBAR_PANEL_W', 'MIN_PROGRAM_PANEL_H', 'DEFAULT_PROGRAM_PANEL_H',
        'return ({' + source.slice(begin, source.indexOf('\n    }', begin) + 6) + '}).' + name)(panelStorage,
            'media', 'sidebar', 'height', 120, 120, 120, 420);
}
const persist = layoutMethod('_persistPanelLayout');
const restore = layoutMethod('_applySavedProgramPanelHeight');
owner.mediaPanel = {offsetWidth: 280};
owner.sidebarPanel = {offsetWidth: 320};
panel.offsetHeight = 560;
for (let i = 0; i < 6; i++) {
    persist.call(owner);
    assert.equal(storage.get('height'), '560', 'Save/close persists the whole upper workspace, including controls');
    panel.offsetHeight = 420;
    restore.call(owner);
    assert.equal(panel.offsetHeight, 560, 'Reopen restores the dragged height without cumulative shrinkage');
}
assert.equal(storage.get('media'), '280');
assert.equal(storage.get('sidebar'), '320');
console.log('Saving and reopening repeatedly preserves workspace height and both sidebar widths.');
