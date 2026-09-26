import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('function normalizeOutputVideoPath(');
const normalizeOutputVideoPath = new Function('OUTPUT_VIDEO_EXT',
    `return ${source.slice(start, source.indexOf('\n}', start) + 2)}`)(/\.(mp4|webm|mov|mkv|avi|m4v)$/i);
let nextId = 0;
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    return new Function('normalizeOutputVideoPath', 'normalizeGeneratedVideo', 'genVideoUid', 'T',
        `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(
        normalizeOutputVideoPath, row => ({...row}), () => `gv_${++nextId}`, key => key);
}

function editor(ready = true) {
    const project = {name: 'project', tracks: [{clips: ['a', 'b'].map(id => ({id}))}]};
    const e = {
        project, _timeline: {}, _timelineReady: ready,
        _pendingGeneratedJobs: [], _deferredGeneratedJobs: [], attached: [],
        _isNodeOnLiveGraph: () => true,
        _findClipById: () => null,
        _parseProjectWidgetValue() { return {project: this.project}; },
        _writeProjectJson(value) { this.project = JSON.parse(value); },
        _attachGeneratedVideos(id, files) { this.attached.push({id, files}); },
        _clearRunPreview() {}, _syncClipRunDecorations() {}, _maybeClearGenVideoStamp() {},
        _promptIdFromEvent: e => e.detail.prompt_id,
    };
    for (const name of ['_onH3ClipVideoReady', '_onTimelineVideoSaved', '_onPromptExecuted',
        '_persistGeneratedVideosToProjectJson', '_collectExecutedOutputVideos',
        '_teNotifyBelongsHere', '_safeProjectFilename']) e[name] = method(name);
    return e;
}
function event(id, filename = `${id}.mp4`) {
    return {detail: {node_id: '12:769', prompt_id: 'run', video: {
        clip_id: id, filename, subfolder: 'custom/project', type: 'output',
    }}};
}
function files(e, index = 0) {
    return (e.project.tracks[0].clips[index].generated_videos || []).map(row => row.file);
}

const e = editor();
e._pendingGeneratedJobs = ['a', 'b'].map(clipId => ({clipId, promptId: 'run'}));
e._onH3ClipVideoReady(event('a'));
assert.deepEqual(files(e), ['custom/project/a.mp4']);
assert.deepEqual(files(e, 1), [], 'first Clip attaches before the second is finished');
assert.deepEqual(e._pendingGeneratedJobs.map(job => job.clipId), ['b']);
e._onH3ClipVideoReady(event('b', 'b__h3v1_c22_r192_h22_t0_f24000_s0.mp4'));
assert.equal(files(e, 1).length, 1, 'H3 context filename binds through explicit Clip ID');
assert.equal(e.attached.length, 2);
e._onH3ClipVideoReady(event(undefined, 'uuid_final.mp4'));
assert.equal(e.attached.length, 2, 'final composition is never attached to a Clip');

// Completed output is a fallback even for runs started outside the editor (no pending job).
const completed = {detail: {prompt_id: 'run', output: {
    video: [event(undefined, 'uuid_final.mp4').detail.video],
    clip_videos: [event('a').detail.video, event('b').detail.video],
}}};
const closed = editor(false);
closed._onPromptExecuted(completed);
assert.deepEqual(files(closed), ['custom/project/a.mp4']);
assert.deepEqual(files(closed, 1), ['custom/project/b.mp4']);
assert.equal(closed._deferredGeneratedJobs.length, 2);
closed._onH3ClipVideoReady(event('a'));
closed._onTimelineVideoSaved({detail: {clip_id: 'a', file: 'custom/project/a.mp4'}});
assert.equal(files(closed).length, 1, 'ready, Seq To Video and completed events do not duplicate saved associations');
assert.deepEqual(closed._collectExecutedOutputVideos({output: {'769': completed.detail.output}}),
    ['custom/project/a.mp4', 'custom/project/b.mp4'], 'history lookup excludes the final composition');

const detached = editor();
detached._isNodeOnLiveGraph = () => false;
detached._onH3ClipVideoReady(event('a'));
assert.deepEqual(files(detached), [], 'inactive workflow does not consume the event');
e._onH3ClipVideoReady(event('unknown'));
assert.equal(e.attached.length, 2);

const takes = editor(false);
takes.project.tracks[0].clips[0].gen_edit_audios = [{muted: false}];
const first = event('a', '20260915-210000_a.mp4');
first.detail.video.subfolder = 'CapTimelineEditor/project';
takes._onH3ClipVideoReady(first);
const second = event('a', '20260915-220000_a.mp4');
second.detail.node_id = 'another-workflow:900';
second.detail.video.subfolder = 'CapTimelineEditor/project';
takes._onH3ClipVideoReady(second);
assert.deepEqual(files(takes), ['CapTimelineEditor/project/20260915-220000_a.mp4',
    'CapTimelineEditor/project/20260915-210000_a.mp4'], 'different workflows append takes to the same project and Clip');
assert.deepEqual(takes.project.tracks[0].clips[0].generated_videos.map(row => row.enabled), [true, false]);
assert(takes.project.tracks[0].clips[0].gen_edit_audios[0].muted);
const foreign = event('a');
foreign.detail.video.subfolder = 'CapTimelineEditor/different-project';
takes._onH3ClipVideoReady(foreign);
assert.equal(files(takes).length, 2, 'matching Clip ID in a different project does not bind');
const missing = event('missing');
missing.detail.video.subfolder = 'CapTimelineEditor/project';
takes._onH3ClipVideoReady(missing);
assert.equal(takes._deferredGeneratedJobs.length, 2, 'unknown Clip does not fall back to another Clip');
assert.match(source, /addEventListener\("cat_h3_video_ready", this\._onH3VideoReady\)/);
assert.match(source, /removeEventListener\?\.\("cat_h3_video_ready", this\._onH3VideoReady\)/);
console.log('PASS: immediate H3 Clip association, completion fallback, closed editor, deduplication and composition exclusion');

const draftEditor = editor(false);
draftEditor._receiveH3Draft = method('_receiveH3Draft');
const draft = {id: 'a'.repeat(32), clip_id: 'a', file: 'capricorncd-timeline/h3_drafts/a/preview.mp4', seed: 42};
draftEditor._onH3ClipVideoReady({detail: {video: {clip_id: 'a', type: 'output', h3_draft: draft}}});
assert.equal(draftEditor.project.tracks[0].clips[0].h3_drafts.length, 1);
assert.equal(files(draftEditor).length, 0, 'candidate never becomes a finished take');
draftEditor.project.tracks[0].clips[0].h3_drafts[0].enabled = false;
draftEditor._receiveH3Draft(draft);
assert.equal(draftEditor.project.tracks[0].clips[0].h3_drafts[0].enabled, false, 'replayed event preserves disabled state');
draftEditor.project.tracks[0].clips[0].h3_drafts = [];
draftEditor.project.tracks[0].clips[0].h3_draft_removed = [draft.id];
draftEditor._receiveH3Draft(draft);
assert.equal(draftEditor.project.tracks[0].clips[0].h3_drafts.length, 0, 'completion replay cannot resurrect a removed version');
draftEditor._onTimelineVideoSaved({detail: {clip_id: 'a', file: draft.file}});
assert.equal(files(draftEditor).length, 0, 'generic save notification excludes low-resolution previews');
assert.deepEqual(draftEditor._collectExecutedOutputVideos({output: {video: [{filename: draft.file, type: 'output'}]}}), []);
console.log('PASS: first-pass closed-editor persistence, disabled/deleted replay and composition isolation');
