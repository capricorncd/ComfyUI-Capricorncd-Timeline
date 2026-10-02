import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const component = readFileSync(new URL('../js/components/ShotControl.js', import.meta.url), 'utf8');
const shotPrompt = new Function(component.slice(component.indexOf('export function'), component.indexOf('export class')).replace('export ', '') + '; return shotPrompt;')();
const code = readFileSync(new URL('../js/editor/DirectorKeyframes.js', import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const requests = [];
const api = {fetchApi: async (url, options) => { requests.push(JSON.parse(options.body)); return {ok: true, json: async () => ({times: [10, 12, 14]})}; }};
const videoTrimSource = (app, item) => ({item: app._findMediaById('original'), start: 8, rate: 2});
const {DirectorKeyframes, shotWindow} = new Function('T', 'api', 'shotPrompt', 'videoTrimSource', code + ';return {DirectorKeyframes, shotWindow};')((key, values) => key + JSON.stringify(values || {}), api, shotPrompt, videoTrimSource);
const element = () => ({events: {}, addEventListener(name, handler) {this.events[name] = handler;}, after() {},
    setMentionSource() {}, bindPromptHistory() {}, configure(...args) {this.args = args;}, setStatus(...args) {this.status = args;}});
globalThis.document = {createElement: element};
const panel = element();
const media = {id: 'trim', kind: 'video', file: 'trim.mp4'};
const original = {id: 'original', file: 'original.mp4'};
const meta = {clipRole: 'video_ref', prompt: 'Original'};
const clip = {id: 'clip', selected: true, startTime: 20, sourceOffset: 1, playbackRate: 0.5, duration: 5,
    track: {type: 'image', locked: false}, el: {querySelector() {return this.markers;}, append(markers) {this.markers = markers;}}};
let records = 0, saves = 0, editor;
const timeline = {tracks: [{clips: [clip]}], currentTime: 22, selectClip() {editor.clearSelection(); clip.selected = true;}, setCurrentTime(time) {this.currentTime = time;}};
const app = {_timeline: timeline, _selClip: clip, getFps: () => 24, _ensureClipMeta: () => meta,
    _clipItems: () => [media], _clipPreviewItemIndex: () => 0, _findClipById: () => clip,
    _findMediaById: id => id === 'trim' ? media : original, _mediaStatus: new Map(),
    _recordUndo() {records++;}, _saveToWidgets() {saves++;}, _refreshFinalPromptDisplay() {}, _updateClipInfoPanel() {}};
editor = new DirectorKeyframes(app, panel, type => type === 'image');
assert.deepEqual(shotWindow(clip, videoTrimSource(app)), {start: 10, rate: 1, duration: 5});
editor.sync(clip);
assert.deepEqual(media.video_shots, {source_id: 'original', points: [{time: 10, description: ''}]});
editor.add(clip, 22);
assert.equal(media.video_shots.points[1].time, 12);
assert.equal(records, 1);
editor.add(clip, clip.startTime + clip.duration);
assert.equal(media.video_shots.points.length, 2, 'The clip end is an interval boundary, not an extra keyframe');
assert.equal(records, 1);
editor.add(clip, 22);
assert.equal(records, 1, 'Same-frame insertion selects existing marker');
panel.events['prompt-change']({detail: 'Keep this prompt'});
panel.events['prompt-change']({detail: 'Keep this prompt!'});
assert.equal(records, 2, 'Typing is one undo step');
assert.equal(media.video_shots.points[1].description, 'Keep this prompt!');
editor.move(1);
assert.ok(Math.abs(media.video_shots.points[1].time - (12 + 1/24)) < 1e-10);
editor.move(-1);
assert.equal(media.video_shots.points[1].time, 12);
await editor.detect(clip);
assert.deepEqual(requests[0], {file: 'original.mp4', location: 'input', start: 10, duration: 5});
assert.deepEqual(media.video_shots.points.map(point => point.time), [10, 12, 14]);
assert.equal(media.video_shots.points[1].description, 'Keep this prompt!');
await editor.detect(clip);
assert.equal(media.video_shots.points.length, 3, 'Detection merges without duplicate frames');
editor.select(editor.target(clip), media.video_shots.points[1]);
editor.insertPrompt();
assert.match(meta.prompt, /At 00:02.000, Keep this prompt!/);
clip.track.locked = true;
const before = JSON.stringify(media.video_shots);
editor.move(1); editor.remove(); editor.add(clip, 23);
assert.equal(JSON.stringify(media.video_shots), before);
clip.track.locked = false;
editor.remove();
assert.deepEqual(media.video_shots.points.map(point => point.time), [10, 14]);
let consumed = false;
timeline.currentTime = 23;
editor.key({code: 'KeyP', ctrlKey: true, preventDefault() {consumed = true;}, stopPropagation() {}});
assert.equal(consumed, true);
assert.equal(editor.selection.point.time, 13);
const saved = JSON.parse(JSON.stringify(media.video_shots));
media.video_shots = saved;
editor.refreshPanel();
assert.equal(panel.hidden, true, 'Reload/undo clears stale selection');
editor.sync(clip);
assert.equal(media.video_shots, saved, 'Existing shot data is reused, not replaced');
editor.select(editor.target(clip), saved.points[0]); editor.remove(); editor.sync(clip);
assert.equal(saved.points.some(point => point.time === 10), false, 'Deleting the initial marker persists');
assert.ok(saves > 0);

const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const deleteStart = appSource.indexOf('    handleDeleteKey(');
const handleDeleteKey = new Function('isEditingField', 'T', 'return ({' +
    appSource.slice(deleteStart, appSource.indexOf('\n    }', deleteStart) + 6) +
    '}).handleDeleteKey')(event => !!event.editing, key => key);
let clipDeletePrompts = 0, envelopeDeletes = 0;
app._overlay = {classList:{contains:()=>true}};
app._directorKeyframes = editor;
app._openDeleteConfirm = () => clipDeletePrompts++;
clip.audioEnvelope = {deleteSelected(){envelopeDeletes++; return false;}};
timeline.getSelectedClips = () => [clip];
const deleteKey = (extra = {}) => ({key:'Delete', preventDefault(){this.prevented=true;},
    stopPropagation(){}, stopImmediatePropagation(){}, ...extra});
for (const key of ['Delete', 'Backspace']) {
    editor.add(clip, 22);
    const selected = editor.selection.point;
    const count = media.video_shots.points.length;
    const typing = deleteKey({key, editing:true});
    assert.equal(handleDeleteKey.call(app, typing), false);
    assert.equal(media.video_shots.points.length, count, 'Typing only edits text');
    clip.track.locked = true;
    handleDeleteKey.call(app, deleteKey({key}));
    assert(media.video_shots.points.includes(selected), 'Locked keyframes remain intact');
    clip.track.locked = false;
    const event = deleteKey({key});
    assert.equal(handleDeleteKey.call(app, event), true);
    assert(event.prevented);
    assert(!media.video_shots.points.includes(selected), 'Global delete removes the selected keyframe');
    assert.equal(media.video_shots.points.length, count - 1);
    handleDeleteKey.call(app, deleteKey({key, repeat:true}));
    assert.equal(clipDeletePrompts, 0, 'Holding delete after removing a keyframe never deletes its Clip');
    assert.equal(envelopeDeletes, 0, 'Selected keyframes take priority over volume points');
    assert(timeline.tracks[0].clips.includes(clip));
}
handleDeleteKey.call(app, deleteKey());
assert.equal(clipDeletePrompts, 1, 'A fresh delete without a selected keyframe still handles the Clip');
console.log('Global delete: keyframe priority, locked points, text editing and key-repeat protection passed.');
console.log('Director keyframes: shared data, source timing, typing undo, frame moves, lock, detection merge, Ctrl+P and reload passed.');
