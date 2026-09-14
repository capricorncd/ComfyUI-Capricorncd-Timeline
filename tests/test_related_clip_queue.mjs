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
const deps = { app, api, CapTimelineEditorApp, T: key => key, alert: msg => errors.push(msg),
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
    _writeProjectJson(value) { this.written = value; },
    _saveToWidgets() { this._writeProjectJson(JSON.stringify(this._buildProject())); },
    async _waitForQueueIdle() {},
    _notePendingGeneratedJob(job) { this._pendingGeneratedJobs.push(job); },
    _promptIdFromQueueResult: () => null, _schedulePendingJobsQueueReconcile() {},
    _clearRunPreview() {}, _syncClipRunDecorations() {},
};
const run = method('_runClipDownstream');
assert.equal(await run.call(editor, clips[1]), true);
assert.equal(submissions.length, 1, 'one queue submission for the entire Save Latent chain');
assert.deepEqual(JSON.parse(submissions[0].output.timeline.inputs.project_json).settings.runtime_only_clip_ids,
    ['first', 'second', 'third']);
assert.deepEqual(editor.validated, ['first', 'second', 'third']);
assert.deepEqual(editor._pendingGeneratedJobs.map(j => [j.clipId, j.promptId, j.expectedFile]),
    clips.map(c => [c.id, 'prompt-1', `${c.id}.mp4`]));
assert.equal(editor._runtimeOnlyClipIds, null);
assert.equal(CapTimelineEditorApp._clipRunJobs.length, 0);

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
console.log('Related clips: one serialized workflow, shared prompt tracking, single/cancel/validation/failure passed');
