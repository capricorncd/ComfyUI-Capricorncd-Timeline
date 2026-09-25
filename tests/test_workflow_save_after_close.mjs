import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const dialogs = [...source.matchAll(/<div\b[^>]*role="dialog"[^>]*>/g)].map(([tag]) => ({
    modal: tag.includes('aria-modal="true"'),
    hidden: /\shidden(?=[\s>])/.test(tag),
    backdrop: tag.includes('cat-te-modal-backdrop'),
}));
assert.equal(dialogs.length, 4);
// ComfyUI checks the dialog itself, not the visibility of its ancestors:
// [role="dialog"][aria-modal="true"]:not([hidden])
const blocksWorkflowSave = () => dialogs.some(dialog => dialog.modal && !dialog.hidden);
assert.equal(blocksWorkflowSave(), false, 'building the editor must not block workflow shortcuts');
assert(dialogs.every(dialog => dialog.backdrop), 'dialog semantics belong to the element whose hidden state changes');

const start = source.indexOf('    _closeInternal(save) {');
const end = source.indexOf('\n    _discardTimeline()', start);
const Editor = { _open: null };
const close = new Function('CapTimelineEditorApp', 'document', 'BODY_UI_CLASSES',
    `return ({${source.slice(start, end)}})._closeInternal`)(Editor, { body: { classList: { remove() {} } } }, []);

for (const failCleanup of [false, true]) {
    const overlayClasses = new Set(['open']);
    const editor = {
        _openGen: 1,
        _overlay: {
            querySelectorAll: () => dialogs,
            classList: { remove: name => overlayClasses.delete(name) },
        },
        _stopAutoSave() { if (failCleanup) throw new Error('cleanup failed'); },
        _stopAudioPlayback() {},
        _removeCtxMenu() {},
        _discardTimeline() {},
        _mediaBatchSelected: new Set(),
    };
    Editor._open = editor;
    for (const dialog of dialogs) dialog.hidden = false;
    assert.equal(blocksWorkflowSave(), true, 'an open modal still blocks workflow shortcuts');
    if (failCleanup) assert.throws(() => close.call(editor, true), /cleanup failed/);
    else close.call(editor, true);
    assert.equal(blocksWorkflowSave(), false, 'closing the editor releases workflow shortcuts even if cleanup fails');
    assert.equal(Editor._open, null);
    assert.equal(overlayClasses.has('open'), false);
}
console.log('PASS: hidden editor dialogs no longer block ComfyUI workflow saving');
