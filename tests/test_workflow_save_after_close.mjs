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

const app = { extensionManager: { command: {} } };
const alerts = [];
function method(name) {
    const start = source.search(new RegExp(`    (async )?${name}\\(`));
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('app', 'T', 'showCapAlert', 'isEditingField',
        `return ({${source.slice(start, end)}}).${name}`)(
        app, (key, params) => `${key}: ${params?.msg ?? ''}`,
        message => alerts.push(message), event => !!event.editing,
    );
}
function saveEditor(bound = false) {
    const events = [];
    let widget = 'old content';
    app.extensionManager.command.execute = async command => {
        assert.equal(command, 'Comfy.SaveWorkflow');
        events.push(`workflow: ${widget}`);
    };
    return {
        events,
        _overlay: { classList: { contains: () => true } },
        _timelineReady: true, _historyReady: true,
        _launcherProject: bound ? { session: {} } : null,
        _saveToWidgets() { widget = 'latest content'; events.push('widgets'); },
        async _saveLauncherProject(backup) {
            assert.equal(backup, false, 'Ctrl+S retains formal directory saving');
            events.push(`project: ${widget}`);
        },
        _shortcutModKey: method('_shortcutModKey'),
        _saveTimelineAndWorkflow: method('_saveTimelineAndWorkflow'),
    };
}
for (const bound of [false, true]) {
    const editor = saveEditor(bound);
    await editor._saveTimelineAndWorkflow();
    assert.deepEqual(editor.events, bound
        ? ['widgets', 'project: latest content', 'workflow: latest content']
        : ['widgets', 'workflow: latest content']);
    assert.equal(editor._workflowSaveBusy, false);
}
{
    const editor = saveEditor();
    let release;
    app.extensionManager.command.execute = () => new Promise(resolve => { release = resolve; });
    const pending = editor._saveTimelineAndWorkflow();
    await editor._saveTimelineAndWorkflow();
    assert.deepEqual(editor.events, ['widgets'], 'pending save blocks duplicate shortcuts');
    release();
    await pending;
    app.extensionManager.command.execute = async (command, options) => {
        options.errorHandler(new Error('disk full'));
    };
    await editor._saveTimelineAndWorkflow();
    assert.match(alerts.at(-1), /workflow_save_failed: disk full/);
    assert.equal(editor._workflowSaveBusy, false, 'failed saves can be retried');
}
for (const modifier of ['ctrlKey', 'metaKey']) {
    const editor = saveEditor();
    editor._storyboardMode = true;
    let saves = 0;
    editor._saveTimelineAndWorkflow = () => { saves++; };
    const event = {
        key: 's', code: 'KeyS', [modifier]: true, editing: true,
        preventDefault() { this.prevented = true; },
        stopPropagation() {}, stopImmediatePropagation() { this.stopped = true; },
    };
    assert.equal(method('handleShortcutKey').call(editor, event), true);
    assert(event.prevented && event.stopped, 'native graph/browser must not save a second time');
    assert.equal(saves, 1, 'input fields and storyboard mode still save');
    assert.equal(method('handleShortcutKey').call(editor, {...event, repeat: true}), true);
    assert.equal(saves, 1, 'holding the shortcut does not repeat saves');
    editor._storyboardMode = false;
    for (const extra of [{altKey: true}, {shiftKey: true}]) {
        assert.equal(method('handleShortcutKey').call(editor, {...event, ...extra}), false);
    }
    editor._overlay.classList.contains = () => false;
    assert.equal(method('handleShortcutKey').call(editor, event), false);
    assert.equal(saves, 1, 'closed timeline leaves graph shortcuts unchanged');
}
for (const flag of ['_timelineReady', '_historyReady']) {
    const editor = saveEditor();
    editor[flag] = false;
    await editor._saveTimelineAndWorkflow();
    assert.deepEqual(editor.events, [], 'loading editors must not save incomplete content');
}
console.log('PASS: Ctrl/Cmd+S saves latest workflow and bound project, keyboard routing, duplicate saves and failure retry');
