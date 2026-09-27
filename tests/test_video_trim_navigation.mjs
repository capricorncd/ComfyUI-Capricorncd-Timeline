import { formatTimecode } from '../js/timecode.js';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const code = readFileSync(new URL('../js/editor/VideoTrim.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const requests = [];
const api = {fetchApi: async (_, options) => {
    requests.push(JSON.parse(options.body));
    return {ok: true, json: async () => ({file: `cut-${requests.length}.mp4`})};
}};
const VideoTrim = new Function('formatTimecode', 'api', 'T', 'iconHtml', code + ';return VideoTrim;')(formatTimecode, api, key => key, () => '');
const elements = new Map();
function element(key) {
    if (!elements.has(key)) elements.set(key, {value: '', disabled: false, parentElement: {}, append() {},
        addEventListener(type, callback) { this[type] = callback; },
        pause() { this.paused = true; }, removeAttribute() {}, load() {}, setStatus() {}, update() {},
        configure(total) { if (Array.isArray(total)) this.points = total; else this.totalFrames = total; }});
    return elements.get(key);
}
globalThis.document = {createElement: () => ({})};
const items = [{id: 'a', file: 'a.mp4', kind: 'video'}, {id: 'image', kind: 'image'}, {id: 'b', file: 'b.mp4', kind: 'video'}];
const clip = {id: 'clip', duration: 8, startTime: 3, get endTime() { return this.startTime + this.duration; }, track: {}};
const replacements = [];
const promptDialogs = [];
const meta = {prompt: 'Original prompt'};
const app = {_openAiOptimizeModal(target) {
    assert.equal(editor.dialog.closed, true, "Close reference editor before opening prompt management");
    promptDialogs.push({target, prompt: meta.prompt});
}, _refreshFinalPromptDisplay() {}, _clipItems: () => items, _ensureClipMeta: () => meta, _clipPreviewItemIndex: () => 0,
    _projectResources: items, _findMediaById: id => items.find(item => item.id === id),
    getFps: () => 24, _videoUrl: file => file, _mediaStatus: new Map(), _findClipById: () => clip,
    _recordUndo() {}, _replaceDirectorVideo: (...args) => replacements.push(args), _saveToWidgets() {}, _scheduleProgramPreview() {}};
const editor = Object.create(VideoTrim.prototype);
editor.app = app;
editor.dialog = {querySelector: element, showModal() {}, close() { this.closed = true; }};
editor.open(clip);
const video = element('video'), range = element('cap-export-range');
video.duration = 10;
video.onloadedmetadata();
range.startFrame = 24; range.endFrame = 72;
range.rangechange({detail: {frame: 24}});
element('[data-next]').onclick();
assert.equal(element('[data-asset]').value, 2, 'Skip image items during navigation');
video.onloadedmetadata();
range.startFrame = 96; range.endFrame = 144;
range.rangechange({detail: {frame: 96}});
element('[data-prev]').onclick();
video.onloadedmetadata();
assert.equal(range.startFrame, 24);
assert.equal(range.endFrame, 72);
assert.equal(element('[data-prev]').disabled, true);
assert.equal(element('[data-position]').textContent, '1 / 2');
await element('[data-save]').onclick();
assert.deepEqual(requests.map(({file, start, duration}) => ({file, start, duration})), [
    {file: 'a.mp4', start: 1, duration: 2}, {file: 'b.mp4', start: 4, duration: 2},
]);
assert.deepEqual(replacements.map(args => args[1]), [0, 2]);
assert.equal(editor.dialog.closed, true);
assert.equal(clip.duration, 8, 'Ordinary Apply preserves Clip duration');
assert.equal(promptDialogs.length, 0, 'Ordinary Apply does not open prompt management');
console.log('Reference video navigation retains independent ranges and applies all edits to the correct items.');

let geometry = 0, timelineEnd;
clip._applyPosition = () => geometry++;
Object.assign(app, {
    _rememberResourceTiming() {}, _ensureTimelineLength(end) { timelineEnd = end; },
    _decorateClip() {}, _refreshTimelineDuration() {},
});
items[0].video_trim = {source_id: 'b', start: 1, duration: 4, rate: 2};
editor.open(clip); video.onloadedmetadata();
range.startFrame = 48; range.endFrame = 192;
range.rangechange({detail: {frame: 48}});
await element('[data-resize]').onclick();
assert.equal(clip.duration, 3, 'Resize uses current range divided by source playback rate');
assert.equal(clip.startTime, 3, 'Resize preserves start position');
assert.equal(timelineEnd, 6);
assert.equal(geometry, 1, 'Resize refreshes Clip geometry');
editor.open(clip); video.onloadedmetadata();
range.startFrame = 0; range.endFrame = 48;
range.rangechange({detail: {frame: 0}});
const fetchApi = api.fetchApi;
api.fetchApi = async () => { throw Error('Trim failed'); };
await element('[data-resize]').onclick();
assert.equal(clip.duration, 3, 'Failed cut cannot resize Clip');
assert.equal(geometry, 1);
assert.equal(element('[data-resize]').disabled, false, 'Failure restores action');
api.fetchApi = fetchApi;
assert.doesNotMatch(editor.dialog.innerHTML, /cap-shot-control|data-insert/);
assert.match(editor.dialog.innerHTML, /data-resize[^]*data-save/);
console.log('Apply-and-resize honors playback rate, refreshes geometry, preserves start and leaves duration unchanged on failure.');
