import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/editor/LauncherProject.js', import.meta.url), 'utf8');
const requests = [];
let respond = async () => ({ ok: true, json: async () => ({ missing: [] }) });
const context = vm.createContext({
    makeT: dictionary => key => dictionary.en[key],
    fetch: async (url, options) => { requests.push({ url, ...JSON.parse(options.body) }); return respond(); },
    window: { __COMFYUI_LAUNCHER__: { pickDirectory: async () => null } },
});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, '').replace(/export /g, '') + '\nglobalThis.LauncherProject = LauncherProject; globalThis.launcherProjectFor = launcherProjectFor;', context);
const node = { id: 1, widgets_values: ['project'] };
const serialized = JSON.stringify(node);
const linked = context.launcherProjectFor(node, path => path);
linked.reset({ token: 'private-session', directory: 'D:/private/project' });
assert.equal(context.launcherProjectFor(node, path => path), linked);
assert.equal(JSON.stringify(node), serialized, 'desktop session never enters workflow node serialization');
const session = new context.LauncherProject(path => path);
const project = { name: 'First', tracks: [] }, storyboard = { schema_version: 1, shots: [] };
await session.save(project, storyboard, true);
assert.equal(requests.length, 0, 'unbound project cannot write');
session.reset({ token: 'first' });
assert.equal(await session.open(), null);
assert.equal(session.session.token, 'first', 'cancel preserves association');
let finish;
respond = () => new Promise(resolve => { finish = resolve; });
const backup = session.save(project, storyboard, true);
await Promise.resolve();
await session.save(project, storyboard, true);
assert.equal(requests.length, 1, 'same pending backup is coalesced');
const workflow = { nodes: [{ id: 1 }] };
const manual = session.save({ ...project, name: 'Manual' }, storyboard, false, workflow);
workflow.nodes[0].id = 99;
session.reset({ token: 'second' });
project.name = 'Mutated after queue';
respond = async () => ({ ok: true, json: async () => ({ missing: [] }) });
finish(await respond());
await backup;
await manual;
assert.equal(requests[0].project.name, 'First', 'snapshot is immutable');
assert.equal(requests[1].token, 'first', 'queued manual save retains old destination');
assert.equal(requests[1].backup, false);
assert.equal(requests[1].workflow.nodes[0].id, 1, 'workflow snapshot is captured before queued writes');
assert.equal(requests[0].workflow, undefined, 'autosave does not write formal workflow');
assert.equal(session.lastBackup, null, 'old completion cannot mark new project saved');
respond = async () => ({ ok: false, json: async () => ({ error: 'disk full' }) });
await assert.rejects(session.save(project, storyboard, true), /disk full/);
respond = async () => ({ ok: true, json: async () => ({ missing: [] }) });
await session.save(project, storyboard, true);
const savedCount = requests.length;
await session.save(project, storyboard, true);
assert.equal(requests.length, savedCount, 'completed backup is not repeated');
await session.save(project, storyboard, false);
assert.equal(requests.length, savedCount + 1, 'manual save still writes after backup');
await session.reveal();
assert.equal(requests.at(-1).token, 'second');
assert.match(requests.at(-1).url, /reveal$/);
console.log('Launcher project: captured destination/content, cancellation, serialized saves, backup deduplication and failure retry passed');

const editorSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function editorMethod(name, confirm = () => true) {
    const start = editorSource.search(new RegExp(`    (async )?${name}\\(`));
    const end = editorSource.indexOf('\n    }', start) + 6;
    return new Function('launcherT', 'T', 'showCapAlert', 'showCapConfirm', 'window', `return ({${editorSource.slice(start, end)}}).${name}`)(key => key, key => key, () => {}, confirm, { __COMFYUI_LAUNCHER__: { capabilities: { projectDirectory: true } } });
}
{
    const widget = { name: 'project_json', value: '' };
    const owner = { node: { widgets: [widget] }, _isNodeOnLiveGraph: () => true, _w: () => widget };
    editorMethod('_writeProjectJson').call(owner, JSON.stringify({ name: 'Project', project_directory: 'D:/private/project' }));
    assert.deepEqual(JSON.parse(widget.value), { name: 'Project', project_directory: 'D:/private/project' });
    assert.equal(JSON.parse(owner.node.widgets_values[0]).project_directory, 'D:/private/project');
    assert.equal(JSON.parse(owner.node.properties.cat_named.project_json).project_directory, 'D:/private/project');
}
{
    const original = { token: 'old', directory: 'D:/old' };
    const field = { value: 'D:/chosen', validate: async () => true, setStatus(text) { this.error = text; } };
    const owner = { _openGen: 1, projectDirectoryField: field, _saveToWidgets() {}, _launcherProject: {
        session: original, request: async () => ({ token: 'new', directory: 'D:/chosen', existing: true }),
        reset(value) { this.session = value; },
    } };
    await editorMethod('_associateProjectDirectory', () => false).call(owner);
    assert.equal(owner._launcherProject.session, original, 'cancel preserves old session');
    assert.equal(field.value, 'D:/old');
    field.value = 'D:/chosen';
    await editorMethod('_associateProjectDirectory').call(owner);
    assert.equal(owner._launcherProject.session.directory, 'D:/chosen');
    assert.equal(field.disabled, false);
    owner._launcherProject.request = async () => { throw new Error('missing'); };
    field.value = 'D:/missing';
    await editorMethod('_associateProjectDirectory').call(owner);
    assert.equal(field.value, 'D:/chosen');
    assert.equal(field.error, 'missing');
    field.validate = async () => false;
    let requested = false;
    owner._launcherProject.request = async () => { requested = true; };
    field.value = 'D:/invalid';
    await editorMethod('_associateProjectDirectory').call(owner);
    assert.equal(requested, false, 'invalid manual directory never associates');
    field.value = '';
    await editorMethod('_associateProjectDirectory').call(owner);
    assert.equal(owner._launcherProject.session, undefined, 'clearing directory stops disk saves');
    assert.equal(owner._projectDirectory, '');
}
{
    const writes = [];
    const owner = {
        _timeline: {}, _timelineReady: true, _historyReady: true,
        _launcherProject: { session: { token: 'bound' }, save: async (...args) => { writes.push(args); return { missing: [] }; } },
        _buildProject: () => ({ tracks: [] }), _buildStoryboardDocument: () => storyboard,
        _saveToWidgets() {}, _exportWorkflowSnapshot: () => ({ nodes: [{ id: 7 }] }), _hasUnsavedChanges: () => false,
        _launcherStatus: { setStatus() {} },
        _saveLauncherProject: editorMethod('_saveLauncherProject'),
    };
    editorMethod('_autoSaveIfDirty').call(owner);
    await Promise.resolve();
    assert.equal(writes[0][2], true, 'disk backup is independent of widget dirty state');
    owner._overlay = { classList: { contains: () => true } };
    owner._shortcutModKey = () => 's';
    let consumed = false;
    const handled = editorMethod('handleShortcutKey').call(owner, {
        ctrlKey: true, preventDefault() { consumed = true; }, stopPropagation() {}, stopImmediatePropagation() {},
    });
    await Promise.resolve();
    assert(handled && consumed);
    assert.equal(writes[1][2], false, 'Ctrl+S is a formal save');
    assert.equal(writes[1][3].nodes[0].id, 7, 'Ctrl+S includes workflow export');
}
{
    let applied = 0;
    const binding = { token: 'old' };
    const owner = {
        _openGen: 1, _confirmOverwriteImport: () => true,
        _launcherProject: { session: binding, open: async () => null, reset(value) { this.session = value; } },
        async _applyImportedProject() { applied++; },
    };
    const open = editorMethod('_importFromDirectory').bind(owner);
    await open();
    assert.equal(owner._launcherProject.session, binding);
    assert.equal(owner._projectImportBusy, false);
    owner._launcherProject.open = async () => ({ project: {}, token: 'new', directory: 'selected' });
    await open();
    assert.equal(applied, 1);
    assert.equal(owner._launcherProject.session.token, 'new');
    owner._launcherProject.open = async () => { owner._openGen++; return { token: 'stale' }; };
    await open();
    assert.equal(applied, 1, 'closing editor while picker/import is pending ignores stale completion');
}
console.log('Launcher editor: disk autosave, Ctrl+S, cancelled import and stale import guards passed');
