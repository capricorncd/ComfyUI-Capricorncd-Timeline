import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const method = source.slice(source.indexOf('    async _checkProjectDirectoryUpdate()'), source.indexOf('    _getAutosaveIntervalSec()'));
let confirmed = false, prompts = 0;
const check = new Function('document', 'confirmProjectUpdate', 'launcherT', `return ({${method}})._checkProjectDirectoryUpdate;`)(
    {hidden: false}, async () => { prompts++; return confirmed; }, key => key);
const events = [];
let revision = 'external-1', failBackup = false;
const editor = {
    _openGen: 1, _overlay: {classList: {contains: () => true}}, _canCreateProject: () => true,
    _launcherProject: {
        session: {token: 'old', directory: 'project'}, pending: Promise.resolve(),
        async request(action, body) {
            if (action === 'status') return {changed: true, exists: true, revision};
            events.push(action);
            if (action === 'snapshot') { assert.equal(body.project.name, 'local'); if (failBackup) throw Error('disk full'); return {missing: []}; }
            assert.equal(body.filename, 'project.json');
            return {token: 'new', directory: 'project', filename: 'project.json', project: {name: 'external'}};
        },
        reset(session) { this.session = session; },
    },
    _buildProject: () => ({name: 'local'}), _buildStoryboardDocument: () => ({}),
    async _applyImportedProject(project) { assert.equal(project.name, 'external'); events.push('apply'); this._launcherProject.reset(); },
    _saveToWidgets() { events.push('widgets'); }, _editorContentJson: () => 'latest',
    _launcherStatus: {setStatus() { events.push('error'); }},
};
await check.call(editor);
await check.call(editor);
assert.equal(prompts, 1, 'declining does not repeat for the same revision');
assert.deepEqual(events, [], 'declining preserves current edits and files');
revision = 'external-2'; confirmed = true;
await check.call(editor);
assert.deepEqual(events, ['snapshot', 'open', 'apply', 'widgets']);
assert.equal(editor._launcherProject.session.token, 'new');
assert.equal(editor._openedProjectJson, 'latest');
events.length = 0; failBackup = true; revision = 'external-3';
await check.call(editor);
assert.deepEqual(events, ['snapshot', 'error'], 'failed snapshot prevents replacement');
const before = prompts;
editor._canCreateProject = () => false;
await check.call(editor);
assert.equal(prompts, before, 'busy editor does not show a prompt');
editor._canCreateProject = () => true;
editor._launcherProject.request = async () => {
    editor._launcherProject.reset({token: 'other'});
    return {changed: true, exists: true, revision: 'stale'};
};
await check.call(editor);
assert.equal(prompts, before, 'stale responses cannot affect another project');
assert.equal(editor._projectWatchBusy, false);
console.log('PASS: external updates, deduplication, snapshot before reload, failure and session guards');
