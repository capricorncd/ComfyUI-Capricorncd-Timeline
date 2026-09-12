import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const defaults = { fps: 24, width: 1344, height: 768 };
let answer = true, asks = [];
const method = name => {
    const start = source.search(new RegExp('    (?:async )?' + name + '\\('));
    assert(start >= 0);
    return new Function('showCapConfirm', 'T', 'PY_SCALAR_DEFAULTS', 'SETTING_PROMPT_KEYS',
        'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(
        async (...args) => { asks.push(args); return typeof answer === 'function' ? answer() : answer; },
        key => key, defaults, ['prepend_prompt', 'append_prompt']);
};
function fixture() {
    asks = []; answer = true;
    const widgets = Object.fromEntries(Object.keys(defaults).map(key => [key, { value: 99 }]));
    const editor = {
        _timelineReady: true, _pendingGeneratedJobs: [], _loadSeq: 7, _openGen: 3,
        _genVideoStamp: 'old', _runtimeOnlyClipIds: ['old'], _deferredGeneratedJobs: [{ clipId: 'old' }],
        _runPreviewByClipId: new Map([['old', 'preview']]),
        aiConfig: { endpoint: 'keep' }, diskFiles: ['keep.mp4', 'keep.png'], calls: [],
        _canCreateProject: method('_canCreateProject'), _newProject: method('_newProject'),
        _isNodeOnLiveGraph: () => true, _currentVersion: () => 'test', _currentSchemaVersion: () => 4,
        _w: key => widgets[key],
        _closeInternal(save) { assert.equal(save, false); this.calls.push('close'); },
        _writeProjectJson(json) { this.project = JSON.parse(json); this.calls.push('write'); },
        _resetProjectExport() { this.calls.push('resetExport'); },
        open() { this.calls.push('open'); },
    };
    editor._history = { clear() { editor.calls.push('clearHistory'); } };
    return { editor, widgets };
}

{
    const { editor, widgets } = fixture();
    await editor._newProject();
    assert.equal(asks.length, 1);
    assert.deepEqual(editor.calls, ['close', 'clearHistory', 'write', 'resetExport', 'open']);
    assert.deepEqual(editor.project.media, []);
    assert.deepEqual(editor.project.tracks, []);
    assert.equal(editor.project.name, 'untitled_project');
    assert.equal(editor.project.schema_version, 4);
    assert.deepEqual(editor.project.settings, { ...defaults, prepend_prompt: '', append_prompt: '',
        timeline_zoom: 1.2, current_time: 0, timeline_scroll_left: 0, timeline_scroll_top: 0 });
    for (const [key, value] of Object.entries(defaults)) assert.equal(widgets[key].value, value);
    assert.equal(editor._genVideoStamp, null);
    assert.equal(editor._runtimeOnlyClipIds, null);
    assert.deepEqual(editor._deferredGeneratedJobs, []);
    assert.equal(editor._runPreviewByClipId.size, 0);
    assert.deepEqual(editor.aiConfig, { endpoint: 'keep' });
    assert.deepEqual(editor.diskFiles, ['keep.mp4', 'keep.png']);
}
for (const blocked of ['_destroyed', '_runAllClipsBusy', '_runningPromptId', '_modelPreviewRunning',
    '_aiOptimizeBusy', '_composeBusy', '_projectExportBusy', '_fileDropBusy']) {
    const { editor } = fixture();
    editor[blocked] = true;
    await editor._newProject();
    assert.equal(asks.length, 0, blocked);
    assert.deepEqual(editor.calls, []);
}
for (const change of [e => { answer = false; }, e => { e._loadSeq++; }, e => { e._openGen++; },
    e => { e._pendingGeneratedJobs.push({}); }, e => { e._timelineReady = false; },
    e => { e._isNodeOnLiveGraph = () => false; }]) {
    const { editor } = fixture();
    answer = () => { change(editor); return typeof answer === 'boolean' ? answer : true; };
    await editor._newProject();
    assert.deepEqual(editor.calls, [], 'cancel, stale editor or new work must prevent reset');
}
assert.match(source, /label: T\("new_project"\), disabled: !this\._canCreateProject\(\)/);
// Existing lifecycle owns cleanup and rebuilding, rather than a second reset path.
const close = source.slice(source.indexOf('    _closeInternal('), source.indexOf('    _discardTimeline('));
for (const call of ['_stopAudioPlayback()', '_stopAutoSave()', '_closeGenVideoModal()', '_closeGenEditModal()', '_discardTimeline()']) {
    assert.ok(close.includes(call), call);
}
assert.match(source, /if \(!tracksCfg.length\)\s*\{\s*this\._createDefaultTracks\(\)/);
const i18n = readFileSync(new URL('../js/i18n/timeline_editor.js', import.meta.url), 'utf8');
const dict = new Function(i18n.slice(i18n.indexOf('export const DICT =') + 7, i18n.indexOf('export const t =')) + ';return DICT;')();
for (const lang of ['en', 'zh', 'ja']) {
    assert.ok(dict[lang].new_project);
    assert.ok(dict[lang].confirm_new_project);
}
console.log('New Project: confirmation, reset defaults, preserved files/configuration, stale/busy guards and translations passed.');
