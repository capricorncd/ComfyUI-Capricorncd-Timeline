import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const normalizeStart = source.indexOf('function normalizeOutputVideoPath(');
const normalizeOutputVideoPath = new Function('OUTPUT_VIDEO_EXT',
    `return ${source.slice(normalizeStart, source.indexOf('\n}', normalizeStart) + 2)}`)(/\.(mp4|webm|mov|mkv|avi|m4v)$/i);
let queue = {queue_running: [], queue_pending: []}, queueFails = false;
const requests = [], stopped = [], removed = [];
const api = {
    async fetchApi(path, options) {
        requests.push({path, options});
        if (path === '/interrupt') stopped.push(JSON.parse(options.body).prompt_id);
        if (path === '/queue') {
            if (queueFails) throw Error('offline');
            return {ok: true, json: async () => queue};
        }
        return {ok: true};
    },
    apiURL: path => '/comfy' + path,
    async deleteItem(kind, id) { removed.push([kind, id]); },
};
const app = {processingQueue: false};
function method(name) {
    const start = source.search(new RegExp(`    (?:async )?${name}\\(`));
    assert(start >= 0, name);
    return new Function('api', 'app', 'T', 'iconHtml', 'normalizeOutputVideoPath',
        `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(api, app, key => key, () => '', normalizeOutputVideoPath);
}
function editor() {
    const clip = {id: 'selected'};
    const e = {
        _workflowQueueRemaining: null, _pendingGeneratedJobs: [], _workflowRunSubmitting: false,
        _workflowPreview: null, _aiOptimizeClipId: clip.id, _aiOptimizeRightTab: 'ai',
        aiOptimizeModal: {hidden: false}, aiRunBtn: {}, aiPreviewBtn: {}, workflowStopBtn: {},
        _findClipById: id => id === clip.id ? clip : null,
        _onPromptManagerSourceInput() { this.saved = true; },
        _setAiOptimizeRightTab(tab) { this._aiOptimizeRightTab = tab; },
        _renderModelPreview(entry, status) { this.rendered = {entry, status}; },
        _outputVideoUrl: file => '/view/' + file,
        async _runClipDownstream(clip, session) {
            this.queued = {clip, session};
            queue.queue_pending.push([1, 'queued', {}]);
            return true;
        },
    };
    for (const name of ['_workflowQueueBusy', '_syncWorkflowRunButton', '_refreshWorkflowQueue',
        '_runPromptManagerWorkflow', '_bindWorkflowPreviewPrompt', '_setWorkflowPreviewPrompt', '_showWorkflowPreview',
        '_receiveWorkflowPreview', '_finishWorkflowPreview', '_clearWorkflowPreview', '_stopWorkflowPreview', '_b64ToBlob']) {
        e[name] = method(name);
    }
    return e;
}

const e = editor();
assert(e._workflowQueueBusy(), 'unknown queue is conservatively queue-only');
await e._refreshWorkflowQueue();
assert.match(e.aiRunBtn.innerHTML, /workflow_run_preview/);
await e._runPromptManagerWorkflow();
assert(e.saved && e.queued.session === e._workflowPreview);
assert.equal(e._aiOptimizeRightTab, 'preview');
assert.equal(e.aiOptimizeModal.hidden, false, 'run must not close Prompt Manager');

const busy = editor();
queue = {queue_running: [[0, 'foreign', {}]], queue_pending: []};
await busy._runPromptManagerWorkflow();
assert.equal(busy.queued.session, null);
assert.equal(busy._workflowPreview, null);
assert.equal(busy._aiOptimizeRightTab, 'ai', 'queue-only must not steal preview');
assert.match(busy.aiRunBtn.innerHTML, /workflow_run_queue/);
queueFails = true;
await busy._refreshWorkflowQueue();
assert(busy._workflowQueueBusy(), 'queue error must not imply idle');
queueFails = false;

const session = e._workflowPreview;
session.output = {
    '3': {class_type: 'CAP_TimelineEditor', inputs: {project_json: JSON.stringify({
        name: 'project', settings: {runtime_only_clip_ids: ['selected'], gen_video_stamp: 'this-run'},
    })}},
    '6:1': {class_type: 'ModelPreviewOverrideKJ', inputs: {preview_frames: '8'}},
};
session.nodeIds = new Set(['6:1']);
await e._bindWorkflowPreviewPrompt('foreign');
assert.equal(session.promptId, null, 'foreign prompt graph is rejected');
const normalizedOutput = structuredClone(session.output);
normalizedOutput['6:1'].inputs.preview_frames = 8;
normalizedOutput['dynamic:1'] = {class_type: 'Sampler', inputs: {}};
queue = {queue_running: [[0, 'owned', normalizedOutput]], queue_pending: []};
queueFails = true;
await e._bindWorkflowPreviewPrompt('owned');
assert.equal(session.promptId, null);
assert.equal(session.binding, false, 'transient queue failure releases the retry guard');
queueFails = false;
await e._bindWorkflowPreviewPrompt('owned');
assert.equal(session.promptId, 'owned', 'normalization and expanded nodes must not block binding');
e._runningPromptId = 'owned'; e._runningClipId = 'selected';
let count = requests.length;
await e._receiveWorkflowPreview({node_id: 'other', image: 'aGVsbG8='}, 'image/jpeg');
assert.equal(requests.length, count);
e._runningPromptId = 'foreign';
await e._receiveWorkflowPreview({node_id: '6:1', image: 'aGVsbG8='}, 'image/jpeg');
assert.equal(requests.length, count);
e._runningPromptId = 'owned';
for (const mime of ['image/jpeg', 'image/webp', 'video/mp4']) {
    await e._receiveWorkflowPreview({node_id: '6:1', image: 'aGVsbG8=', step: 1, total: 4}, mime);
    assert.equal(e.rendered.entry.mime, mime);
    assert.match(e.rendered.entry.url, /^\/comfy\/audio_keyframe_timeline\/preview_image\//);
}
e._aiOptimizeClipId = 'other';
const rendered = e.rendered;
await e._receiveWorkflowPreview({node_id: '6:1', image: 'aGVsbG8=', step: 2}, 'image/webp');
assert.equal(e.rendered, rendered, 'changing Clip must not show another Clip preview');
e._aiOptimizeClipId = 'selected';
e._finishWorkflowPreview('complete', 'final.mp4');
assert.equal(e.rendered.entry.url, '/view/final.mp4');
assert.equal(session.active, false);
count = requests.length;
await e._receiveWorkflowPreview({node_id: '6:1', image: 'aGVsbG8='}, 'image/jpeg');
assert.equal(requests.length, count, 'late frames cannot replace final video');

session.active = true;
await e._stopWorkflowPreview();
assert.deepEqual(stopped, ['owned']);
assert.equal(session.active, false);
session.active = true;
queue = {queue_running: [[0, 'foreign', {}]], queue_pending: [[1, 'owned', session.output]]};
await e._stopWorkflowPreview();
assert.deepEqual(stopped, ['owned'], 'never interrupt the foreign running task');
assert.deepEqual(removed, [['queue', 'owned']]);
session.active = true;
queue = {queue_running: [[0, 'foreign', {}]], queue_pending: []};
await e._stopWorkflowPreview();
assert.deepEqual(stopped, ['owned']);
e._clearWorkflowPreview();
assert.equal(e._workflowPreview, null);
assert(requests.some(r => r.options?.method === 'DELETE'));

// The existing graph-to-prompt hook captures the actual graph, without overriding model settings.
const graphResult = {output: {'6:1': {class_type: 'ModelPreviewOverrideKJ', inputs: {preview_frames: 12}},
    '2': {class_type: 'UNETLoader', inputs: {unet_name: 'current-model.safetensors'}}}, workflow: {id: 'current'}};
const before = JSON.stringify(graphResult);
app.graphToPrompt = async () => graphResult;
const acknowledged = {prompt_id: 'acknowledged', number: 1, node_errors: {}};
const apiCalls = [];
api.queuePrompt = async function (...args) {
    assert.equal(this, api);
    apiCalls.push(args);
    return acknowledged;
};
e._workflowPreview = session;
session.active = true;
session.promptId = null;
e._writeProjectJson = () => {};
const job = {clipId: 'selected', projectJson: '{"settings":{}}', workflowPreview: session};
const Editor = {_clipRunJobs: [job], _clipRunEditor: e};
const hookStart = source.indexOf('    static _installClipRunJobHook(');
const hookSource = source.slice(hookStart, source.indexOf('\n    }', hookStart) + 6).replace('static ', '');
new Function('app', 'api', 'CapTimelineEditorApp', 'return ({' + hookSource + '})._installClipRunJobHook')(app, api, Editor)();
assert.equal(await app.graphToPrompt(), graphResult);
assert.equal(session.output, graphResult.output);
assert.deepEqual([...session.nodeIds], ['6:1'], 'qualified subgraph node IDs are captured');
assert.equal(JSON.stringify(graphResult), before, 'model, frame count and workflow must be unchanged');
assert.equal(Editor._clipRunJobs.length, 0);
const queueOptions = {previewMethod: 'auto'};
count = requests.length;
assert.equal(await api.queuePrompt(0, graphResult, queueOptions), acknowledged);
assert.equal(session.promptId, 'acknowledged', 'bind directly from the response for this exact submission');
assert.equal(requests.length, count, 'submission acknowledgement does not need a queue JSON comparison');
assert.equal(apiCalls[0][1], graphResult);
assert.equal(apiCalls[0][2], queueOptions);
e._isNodeOnLiveGraph = () => true;
e._promptIdFromEvent = event => event.detail.prompt_id;
e._syncClipRunDecorations = () => {};
e._pendingGeneratedJobs = [{promptId: 'acknowledged', clipId: 'selected'}];
method('_onExecutionStart').call(e, {detail: {prompt_id: 'acknowledged'}});
assert.equal(session.status, 'model_preview_running', 'execution start advances from queued to running');
assert.equal(e._runningClipId, 'selected');
const foreignSubmission = {output: structuredClone(graphResult.output)};
await api.queuePrompt(0, foreignSubmission);
assert.equal(apiCalls[1][1], foreignSubmission, 'other submissions pass through untouched');

queue = {queue_running: [], queue_pending: []};
const cancelled = editor();
cancelled._runClipDownstream = async () => false;
await cancelled._runPromptManagerWorkflow();
assert.equal(cancelled._workflowPreview.active, false, 'cancelled run cannot remain waiting forever');
const twice = editor();
let submitted = 0;
twice._runClipDownstream = async () => { submitted++; queue.queue_pending.push([1, 'next', {}]); return true; };
await Promise.all([twice._runPromptManagerWorkflow(), twice._runPromptManagerWorkflow()]);
assert.equal(submitted, 1, 'double click cannot submit twice');
assert.match(source, /<details class="cat-te-model-preview-settings">/);
assert.match(source, /cat-te-info-tip-pop">\$\{T\("workflow_preview_tip"\)\}/);
const media = {
    src: '', readyState: 0, error: {message: 'Format error'},
    getAttribute() { return this.src || null; }, hasAttribute() { return !!this.src; },
    removeAttribute() { this.src = ''; }, pause() {}, load() {}, play() { return Promise.resolve(); },
};
const previewRenderer = {aiPreviewPanel: {}, aiPreviewStatus: {}, aiPreviewVideo: media};
const render = method('_renderModelPreview');
render.call(previewRenderer, {url: '/step1', mime: 'video/mp4'}, 'first');
const firstError = media.onerror;
render.call(previewRenderer, {url: '/step2', mime: 'video/mp4'}, 'second');
firstError();
assert.equal(previewRenderer.aiPreviewStatus.textContent, 'second', 'an old source error cannot overwrite a newer step');
render.call(previewRenderer, {url: '/noise', mime: 'image/jpeg'}, 'noise');
assert.equal(media.onerror, null, 'video-to-image transition clears stale video error handlers');
assert.equal(media.src, '');
const pipeline = editor();
pipeline._isNodeOnLiveGraph = () => true;
pipeline._promptIdFromEvent = event => event.detail.prompt_id;
pipeline._clipIdFromSpecifiedVideoPath = () => 'selected';
pipeline._collectExecutedOutputVideos = method('_collectExecutedOutputVideos');
pipeline._onPromptExecuted = method('_onPromptExecuted');
pipeline._workflowPreview = {active: true, promptId: 'own', clipId: 'selected',
    nodeIds: new Set(['6:1']), imageId: crypto.randomUUID(), sequence: 0, entry: null};
pipeline._runningPromptId = 'own';
pipeline._runningClipId = 'selected';
pipeline._aiOptimizeRightTab = 'preview';
pipeline._onPromptExecuted({detail: {prompt_id: 'own', node: '638:679', output: {
    text: ['CapTimelineEditor/project/planned_selected.mp4'],
}}});
assert(pipeline._workflowPreview.active, 'a filename displayed before sampling is not a completed video');
assert.equal(pipeline._workflowPreview.entry, null);
await pipeline._receiveWorkflowPreview({node_id: '6:1', image: 'aGVsbG8=', step: 0, total: 4}, 'image/jpeg');
assert.equal(pipeline.rendered.entry.mime, 'image/jpeg', 'noise still reaches the preview after Show Text');
pipeline._onPromptExecuted({detail: {prompt_id: 'own', output: {
    video: [{filename: 'saved_selected.mp4', subfolder: 'project', type: 'output'}],
}}});
assert(!pipeline._workflowPreview.active);
assert(pipeline.rendered.entry.final);
assert.equal(pipeline.rendered.entry.url, '/view/project/saved_selected.mp4');
assert.deepEqual(pipeline._collectExecutedOutputVideos({output: {
    'show-text': {text: ['not-created.mp4']},
    'save-video': {gifs: [{filename: 'saved.webm', subfolder: 'project', type: 'output'}]},
    'temp': {images: [{filename: 'input.mp4', type: 'temp'}]},
}}), ['project/saved.webm'], 'history lookup also ignores planned filenames and temporary inputs');
console.log('PASS: queue-aware workflow run, prompt ownership, noise after Show Text, real saved outputs, media errors and scoped stop');
