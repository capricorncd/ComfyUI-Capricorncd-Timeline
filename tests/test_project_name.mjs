import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _updateWorkflowName(button) {');
const end = source.indexOf('\n    _syncBrandProjectName()', start);
const alerts = [];
const app = { extensionManager: {} };
const update = new Function('app', 'T', `return ({${source.slice(start, end)}})._updateWorkflowName`)(
    app, (key, params) => params?.msg ? `${key}: ${params.msg}` : key,
);

function setup(name = '新项目', path = 'workflows/子目录/旧项目.json', temporary = false) {
    const events = [];
    const workflow = {
        path, directory: path.slice(0, path.lastIndexOf('/')), isTemporary: temporary,
        changeTracker: { prepareForSave() { events.push('capture'); } },
    };
    const workflows = app.extensionManager.workflow = {
        activeWorkflow: workflow,
        getWorkflowByPath: () => undefined,
        async renameWorkflow(target, newPath) {
            assert.equal(target, workflow);
            events.push('rename');
            target.path = newPath;
        },
        async saveWorkflow(target) {
            assert.equal(target, workflow);
            events.push('save');
        },
    };
    const button = { disabled: false };
    const editor = {
        projectNameInput: { value: name },
        _overlay: { querySelector: () => ({ setStatus(text, state) { alerts.push({ text, state }); } }) },
        _syncBrandProjectName() {},
        _saveToWidgets() { events.push('widgets'); },
    };
    alerts.length = 0;
    return { events, workflow, workflows, button, editor };
}

for (const temporary of [false, true]) {
    const ctx = setup('  新项目  ', undefined, temporary);
    await update.call(ctx.editor, ctx.button);
    assert.equal(ctx.workflow.path, 'workflows/子目录/新项目.json');
    assert.equal(ctx.editor.projectNameInput.value, '新项目');
    assert.deepEqual(ctx.events, ['widgets', 'rename', 'capture', 'save']);
    assert.equal(ctx.button.disabled, false);
    assert.equal(alerts.at(-1).state, 'success');
}

for (const [name, path, expected] of [
    ['旧项目', 'workflows/子目录/旧项目.json', 'workflows/子目录/旧项目.json'],
    ['新项目.json', 'workflows/旧项目.json', 'workflows/新项目.json'],
    ['新项目', 'workflows/旧项目.app.json', 'workflows/新项目.app.json'],
]) {
    const ctx = setup(name, path);
    await update.call(ctx.editor, ctx.button);
    assert.equal(ctx.workflow.path, expected);
    assert.equal(ctx.events.at(-1), 'save', 'same-name updates must still save');
    if (path === expected) assert(!ctx.events.includes('rename'));
}

for (const name of ['../escape', '..\\escape', 'invalid:name', 'ending.']) {
    const ctx = setup(name);
    await update.call(ctx.editor, ctx.button);
    assert.deepEqual(ctx.events, []);
    assert.equal(alerts.at(-1).text, 'project_name_update_invalid');
}

{
    const ctx = setup();
    ctx.workflows.getWorkflowByPath = () => ({ path: 'workflows/子目录/新项目.json' });
    await update.call(ctx.editor, ctx.button);
    assert.deepEqual(ctx.events, []);
    assert.equal(alerts.at(-1).text, 'project_name_update_exists');
}

for (const phase of ['renameWorkflow', 'saveWorkflow']) {
    const ctx = setup();
    ctx.workflows[phase] = async () => { throw new Error('disk failure'); };
    await update.call(ctx.editor, ctx.button);
    assert.equal(ctx.button.disabled, false);
    assert.equal(alerts.at(-1).state, 'error');
    assert.match(alerts.at(-1).text, /disk failure/);
    if (phase === 'renameWorkflow') assert(!ctx.events.includes('save'));
}

{
    const ctx = setup();
    let release;
    ctx.workflows.renameWorkflow = () => new Promise(resolve => { release = resolve; });
    const pending = update.call(ctx.editor, ctx.button);
    assert.equal(ctx.button.disabled, true);
    await update.call(ctx.editor, ctx.button);
    assert.deepEqual(ctx.events, ['widgets']);
    release();
    await pending;
    assert.equal(ctx.button.disabled, false);
}

{
    const ctx = setup();
    ctx.workflows.activeWorkflow = null;
    await update.call(ctx.editor, ctx.button);
    assert.deepEqual(ctx.events, []);
    assert.equal(alerts.at(-1).state, 'error');
}

console.log('PASS: workflow rename/save, latest widgets, filenames, collisions, failures and duplicate clicks');
