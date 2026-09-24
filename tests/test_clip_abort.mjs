import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const requests = [];
const api = {interrupt: async id => requests.push(id)};
function method(name) {
    const start = source.indexOf('    ' + (name === '_abortClipDownstream' ? 'async ' : '') + name + '(');
    return new Function('api', 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(api);
}
const abort = method('_abortClipDownstream');
const app = {
    _runningClipId: 'active', _runningPromptId: 'prompt-active',
    _pendingGeneratedJobs: [{clipId: 'active', promptId: 'prompt-active'}, {clipId: 'waiting'}],
    _clipRunState: method('_clipRunState'),
    _clearRunningForPrompt() { this._runningClipId = this._runningPromptId = null; },
    _clearRunPreview() {}, _syncClipRunDecorations() {}, _maybeClearGenVideoStamp() {},
};
await abort.call(app, {id:'waiting'});
assert.deepEqual(requests, [], 'Unbound queued clip cannot interrupt current workflow');
app._pendingGeneratedJobs[1].promptId = 'prompt-waiting';
await abort.call(app, {id:'waiting'});
await abort.call(app, {id:'idle'});
assert.deepEqual(requests, [], 'Queued and idle clips cannot abort');
assert.equal(app._pendingGeneratedJobs.length, 2, 'Ignored abort preserves pending jobs');
await abort.call(app, {id:'active'});
assert.deepEqual(requests, ['prompt-active']);
assert.deepEqual(app._pendingGeneratedJobs.map(job => job.clipId), ['waiting']);
// The menu may have opened while this clip was active; state must be checked at click time.
app._runningClipId = 'waiting'; app._runningPromptId = 'prompt-waiting';
await abort.call(app, {id:'active'});
assert.equal(requests.length, 1, 'Stale menu cannot interrupt the next running clip');
console.log('Clip abort: queued/idle ignored, active prompt targeted, stale menu cannot stop next clip.');
