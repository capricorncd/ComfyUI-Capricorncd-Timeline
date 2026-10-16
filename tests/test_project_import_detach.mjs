import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const timers = new Map();
let timerId = 0;
function method(name) {
    const start = source.search(new RegExp(`    (async )?${name}\\(`));
    assert(start >= 0, name);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('window', 'parseStoryboardDocument', 'requestAnimationFrame',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        `return ({${source.slice(start, end)}}).${name}`)(
        {__COMFYUI_LAUNCHER__: {capabilities: {projectDirectory: true}}},
        document => document, callback => callback(),
        callback => { timers.set(++timerId, callback); return timerId; }, id => timers.delete(id),
        () => assert.fail('imported project must not start directory polling'), () => {},
    );
}

const diskProject = {name: 'Imported', tracks: []};
const storyboard = {schema_version: 1, shots: []};
let reads = 0;
const editor = {
    _openGen: 1, _overlay: {classList: {contains: () => true}},
    _timelineReady: true, _historyReady: true,
    _launcherProject: {
        session: {token: 'old', directory: 'previous-export'},
        reset(session = null) { this.session = session; },
        async open() {
            reads++;
            return {project: structuredClone(diskProject), storyboard, token: 'source', directory: 'import-source'};
        },
        request() { assert.fail('no source file requests after import'); },
    },
    _confirmOverwriteImport: async () => true,
    _savePromptHistory() {}, _validateImportedProject: project => project,
    _stopAudioPlayback() {}, _reloadMediaLibrary: async () => {},
    _history: {clear() {}}, _updateHistoryButtons() {},
    async _initTimelineFromWidgets(project) { this.project = project; this._timeline = {_refresh() {}}; this._saveToWidgets(); },
    _saveToWidgets() { this.workflowProject = JSON.stringify(this.project); },
    _saveLauncherProject() { assert.fail('import source must not receive autosaves'); },
    _hasUnsavedChanges: () => true,
    _editorContentJson() { return JSON.stringify(this.project); },
    _getAutosaveIntervalSec: () => 10,
};
for (const name of ['_applyImportedProject', '_startAutoSave', '_stopAutoSave', '_autoSaveIfDirty']) {
    editor[name] = method(name);
}
await method('_importFromDirectory').call(editor);
assert.equal(reads, 1);
assert.equal(editor._launcherProject.session, null, 'source directory stays detached after import');
assert.equal(JSON.parse(editor.workflowProject).name, 'Imported');

diskProject.name = 'Changed externally';
editor.project.name = 'Edited in workflow';
editor._startAutoSave();
assert.equal(timers.size, 1, 'only the normal editor autosave timer is scheduled');
const [id, tick] = timers.entries().next().value;
timers.delete(id);
tick();
assert.equal(reads, 1, 'autosave does not reread the import source');
assert.equal(JSON.parse(editor.workflowProject).name, 'Edited in workflow');
assert.equal(editor._openedProjectJson, editor.workflowProject);
editor._stopAutoSave();
assert.equal(timers.size, 0);
console.log('PASS: directory import detaches source, workflow owns later edits, no directory reads/polling/writes');
