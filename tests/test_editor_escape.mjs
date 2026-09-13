import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('        el.addEventListener("keydown", e => {');
assert(start >= 0);
const end = source.indexOf('\n        });', start) + '\n        });'.length;
let handler, stopped = 0, dismissed = 0;
const editor = {
    close() { assert.fail('Escape must not close the timeline editor'); },
    _modalsBlockFileDrop: () => false,
    _removeCtxMenu: () => false,
    _closeMediaFilterPanel: () => false,
};
new Function('el', source.slice(start, end)).call(editor, {
    addEventListener(type, listener) { assert.equal(type, 'keydown'); handler = listener; },
});
const escape = {key: 'Escape', stopPropagation() { stopped++; }};
handler(escape);
handler({...escape, target: {closest: () => ({tagName: 'INPUT'})}});
assert.equal(stopped, 2, 'Escape stays inside the editor, including from inputs');
editor._removeCtxMenu = () => { dismissed++; return true; };
handler(escape);
assert.equal(dismissed, 1, 'Escape still dismisses context menus');
editor._removeCtxMenu = () => false;
editor._closeMediaFilterPanel = () => { dismissed++; return true; };
handler(escape);
assert.equal(dismissed, 2, 'Escape still dismisses the filter panel');
editor.mediaDeleteModal = {hidden: false};
editor._closeMediaDeleteModal = () => { dismissed++; editor.mediaDeleteModal.hidden = true; };
handler(escape);
assert.equal(dismissed, 3, 'Escape still closes the child modal');
assert.match(source, /querySelector\("\.cat-te-header-close"\)\.addEventListener\("click", \(\) => this\.close\(\)\)/,
    'explicit editor Close button remains wired');
console.log('PASS: Escape leaves the editor open while preserving child-modal and menu dismissal');
