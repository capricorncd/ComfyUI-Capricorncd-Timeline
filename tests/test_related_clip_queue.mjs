import { stripPromptComments } from "../js/prompt_text.js";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const clips = ['first', 'second', 'third'].map(id => ({ id }));
const submissions = [];
let choice = clips, valid = true, fail = false;
const api = { async queuePrompt(number, prompt) {
    if (fail) throw new Error('queue failed');
    submissions.push(prompt);
    return { prompt_id: `prompt-${submissions.length}` };
} };
const app = {
    async graphToPrompt() { return { output: { timeline: { class_type: 'CAP_TimelineEditor', inputs: { project_json: editor.written } } } }; },
    async queuePrompt(number, count) {
        assert.equal(count, 1);
        const prompt = await this.graphToPrompt();
        await api.queuePrompt(number, prompt);
        // ComfyUI may not return the API response to the caller.
    },
};
const CapTimelineEditorApp = { _clipRunJobs: [] };
const errors = [];
const deps = { stripPromptComments, app, api, CapTimelineEditorApp, T: key => key, draftT: key => key, isDirectorTrackType: type => type === "director", alert: msg => errors.push(msg),
    defaultImageMeta: () => ({}), isSubtitleTrackType: () => false, isSubtitleClipMeta: () => false };
function method(name) {
    const start = source.search(new RegExp(`    (?:static |async )?${name}\\(`));
    assert(start >= 0);
    const body = source.slice(start, source.indexOf('\n    }', start) + 6).replace('static ', '');
    return new Function(...Object.keys(deps), `return ({${body}}).${name}`)(...Object.values(deps));
}
CapTimelineEditorApp._installClipRunJobHook = method('_installClipRunJobHook');
const editor = {
    node: {}, _timeline: {}, _timelineReady: true, _meta: new Map(), _pendingGeneratedJobs: [],
    _isEmptyGroupClip: () => false, _confirmRelatedClipRun: async () => choice,
    async _validateClipRunDurations(selected) { this.validated = selected.map(c => c.id); return valid; },
    _makeGenVideoStamp: () => 'stamp', _clipSpecifiedVideoPath: id => `${id}.mp4`,
    _buildProject() { return { settings: { runtime_only_clip_ids: this._runtimeOnlyClipIds }, tracks: [{ clips }] }; },
    _editorContentJson() { return JSON.stringify(this._buildProject()); },
    _writeProjectJson(value) { this.written = value; },
    _saveToWidgets() { this._writeProjectJson(JSON.stringify(this._buildProject())); },
    async _waitForQueueIdle() {},
    _notePendingGeneratedJob(job) { this._pendingGeneratedJobs.push(job); },
    _promptIdFromQueueResult: () => null, _schedulePendingJobsQueueReconcile() {},
    _clearRunPreview() {}, _syncClipRunDecorations() {},
};
const run = method('_runClipDownstream');
editor._queueClipsDownstream = method('_queueClipsDownstream');
assert.equal(await run.call(editor, clips[1]), true);
assert.equal(submissions.length, 1, 'one queue submission for the entire Save Latent chain');
assert.deepEqual(JSON.parse(submissions[0].output.timeline.inputs.project_json).settings.runtime_only_clip_ids,
    ['first', 'second', 'third']);
assert.deepEqual(editor.validated, ['first', 'second', 'third']);
assert.deepEqual(editor._pendingGeneratedJobs.map(j => [j.clipId, j.promptId, j.expectedFile]),
    clips.map(c => [c.id, 'prompt-1', `${c.id}.mp4`]));
assert.equal(editor._runtimeOnlyClipIds, null);
assert.equal(CapTimelineEditorApp._clipRunJobs.length, 0);

const batchRun = method('_runAllActiveClipsDownstream');
editor._hasH3VideoGeneratorDownstream = () => true;
editor._listActiveVisualClips = () => clips;
editor._pendingGeneratedJobs = [];
await batchRun.call(editor);
assert.equal(submissions.length, 2, 'H3 run-all adds one task, not one task per Clip');
assert.deepEqual(JSON.parse(submissions[1].output.timeline.inputs.project_json).settings.runtime_only_clip_ids,
    ['first', 'second', 'third']);
assert.deepEqual(editor._pendingGeneratedJobs.map(j => [j.clipId, j.promptId]),
    clips.map(c => [c.id, 'prompt-2']));
assert.equal(editor._runAllClipsBusy, false);
submissions.pop();

editor._pendingGeneratedJobs = [];
choice = 'single';
await run.call(editor, clips[1]);
assert.deepEqual(JSON.parse(submissions[1].output.timeline.inputs.project_json).settings.runtime_only_clip_ids, ['second']);
assert.equal(editor._pendingGeneratedJobs.length, 1);
choice = 'cancel';
await run.call(editor, clips[1]);
assert.equal(submissions.length, 2);
choice = clips;
valid = false;
await run.call(editor, clips[1]);
assert.equal(submissions.length, 2);
valid = true;
fail = true;
editor._pendingGeneratedJobs = [];
await run.call(editor, clips[1]);
assert.equal(errors.length, 1);
assert.equal(editor._pendingGeneratedJobs.length, 0);
assert.equal(editor._runtimeOnlyClipIds, null);
assert.equal(CapTimelineEditorApp._clipRunJobs.length, 0);
await batchRun.call(editor);
assert.equal(editor._runAllClipsBusy, false, 'failed H3 batch unlocks run-all');
assert.equal(editor._pendingGeneratedJobs.length, 0);

const graphNodes = new Map();
const links = new Map();
const graph = {getLink: id => links.get(id), getNodeById: id => graphNodes.get(id)};
const timeline = {graph, outputs: [{name: 'data_json', links: [1]}]};
const reroute = {graph, outputs: [{links: [2, 3]}]};
const generator = {graph, comfyClass: 'CAP_H3VideoGenerator', inputs: [{name: 'data_json'}]};
graphNodes.set(2, reroute);
graphNodes.set(3, generator);
links.set(1, {target_id: 2, target_slot: 0});
links.set(2, {target_id: 2, target_slot: 0}); // Cycle must not hang the traversal.
const hasGenerator = method('_hasH3VideoGeneratorDownstream');
assert(!hasGenerator.call({node: timeline}), 'unconnected H3 node does not change legacy queue behavior');
links.set(3, {target_id: 3, target_slot: 0});
assert(hasGenerator.call({node: timeline}), 'recognize a generator reached through data routing');
generator.inputs[0].name = 'model';
assert(!hasGenerator.call({node: timeline}), 'only the data_json connection owns batch generation');
const textClip = { id: 'text-only', startTime: 0, track: { type: 'director' } };
const textMeta = { prompt: '// Shot notes\nSteam rises from a cup.', clipType: 'clip' };
let textQueued = 0;
const textTrack = { id: 'director', type: 'director', clips: [textClip] };
const textEditor = {
    node: {}, _meta: new Map([[textClip.id, textMeta]]), _trackInfo: new Map(),
    _isEmptyGroupClip: () => true,
    _stripPromptComments: method('_stripPromptComments'),
    _allImageTracks: () => [textTrack],
    _confirmRelatedClipRun: async () => 'single',
    _validateClipRunDurations: async () => true,
    _queueClipsDownstream: async selected => { assert.deepEqual(selected, [textClip]); textQueued++; return true; },
};
const activeClips = method('_listActiveVisualClips');
assert.deepEqual(activeClips.call(textEditor), [textClip], 'batch run includes a prompt-only clip');
assert.equal(await run.call(textEditor, textClip), true, 'single run queues a prompt-only clip');
assert.equal(textQueued, 1);
for (const prompt of ['', '  \n', '// Notes only\n  // No shot']) {
    textMeta.prompt = prompt;
    assert.deepEqual(activeClips.call(textEditor), [], 'empty/comment-only clips remain excluded');
    await run.call(textEditor, textClip);
    assert.equal(textQueued, 1, 'empty/comment-only clips do not queue');
}
console.log('Related clips and prompt-only single/batch queue validation passed');

editor._pendingGeneratedJobs = [];
fail = false;
await editor._queueClipsDownstream([clips[0]], null, {action: 'draft'});
const stageProject = JSON.parse(submissions.at(-1).output.timeline.inputs.project_json);
assert.deepEqual(stageProject.settings.h3_generation, {action: 'draft'});
assert.equal(JSON.parse(editor.written).settings.h3_generation, undefined, 'stage action is submission-only');
console.log('H3 stage action is isolated to the queued Clip API snapshot');

const previewClips = clips.map(clip => ({...clip, track: {type: 'director'}}));
editor._listActiveVisualClips = () => [...previewClips, {id: 'media', track: {type: 'video'}}];
editor._runAllActiveClipsDownstream = batchRun;
editor._pendingGeneratedJobs = [];
await batchRun.call(editor, {h3Generation: {action: 'draft'}});
let previewProject = JSON.parse(submissions.at(-1).output.timeline.inputs.project_json);
assert.deepEqual(previewProject.settings.runtime_only_clip_ids, ['first', 'second', 'third']);
assert.deepEqual(previewProject.settings.h3_generation, {action: 'draft'});
editor._timeline.getSelectedClips = () => [previewClips[1]];
await method('_runSelectedClipsDownstream').call(editor, {action: 'draft'});
previewProject = JSON.parse(submissions.at(-1).output.timeline.inputs.project_json);
assert.deepEqual(previewProject.settings.runtime_only_clip_ids, ['second']);
assert.deepEqual(previewProject.settings.h3_generation, {action: 'draft'});
console.log('All/selected preview batches preserve scope and exclude media tracks');
