import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const trimSource = readFileSync(new URL('../js/editor/VideoTrim.js', import.meta.url), 'utf8');
const videoTrimSource = new Function('T', trimSource.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '; return videoTrimSource;')(key => key);
const cuts = [];
let fail = false;
const globals = {
    cutVideo: async (app, item, start, duration, rate) => {
        if (fail) throw new Error('failed');
        cuts.push({file: item.file, start, duration, rate});
        return {file: `trim-${cuts.length}.mp4`, trim: {source_id: item.id, start, duration, rate}};
    },
    mediaKindFromFilename: (file, kind) => kind || 'video', mediaUid: () => 'new-id',
    videoTrimSource, T: key => key, alert() {}, isMediaTrackType: type => type === 'video', isDirectorTrackType: type => type === 'image',
    ICONS: {film: '', clapperboard: ''}, defaultImageMeta: () => ({}),
};
function method(name) {
    const start = source.search(new RegExp('    (async )?' + name + '\\('));
    const end = start + source.slice(start).search(/\n    }\r?\n/) + 6;
    return new Function(...Object.keys(globals), 'return ({' + source.slice(start, end) + '}).' + name)(...Object.values(globals));
}
const track = {type: 'video', clips: []};
const target = {type: 'image', clips: [], el: {appendChild() {}}};
const resources = new Map([['original', {id: 'original', kind: 'video', file: 'original.mp4', prompt: 'keep prompt'}]]);
const meta = new Map();
const app = {
    _videoTrim: {progress() {}}, _ensureClipMeta: clip => meta.get(clip.id), _clipItems: m => m.items.map(row => ({...row})),
    _findMediaById: id => resources.get(id), _ensureMedia: (kind, file) => {
        const row = {id: file, file, kind}; resources.set(file, row); return row;
    },
    _findClipById: id => [...track.clips, ...target.clips].find(c => c.id === id),
    _normalizeVisualMeta() {}, _syncClipPrimaryAppearance() {}, _decorateClip() {}, _trackHasRoom: () => true,
    _trackIndex: () => 1, _recordUndo() { this.undoCount = (this.undoCount || 0) + 1; },
    _refreshTimelineDuration() {}, _saveToWidgets() {}, _scheduleProgramPreview() {},
    _timeline: {tracks: [track, target], emit() {}, selectClip() {}},
};
for (const name of ['_prepareDirectorVideos', '_replaceDirectorVideo', '_convertMediaClipToDirector']) app[name] = method(name);
for (let i = 0; i < 3; i++) {
    const clip = {id: String(i), track, startTime: i * 5, sourceOffset: i * 5, duration: 5, playbackRate: 1, _applyPosition() {}};
    track.clips.push(clip); meta.set(clip.id, {items: [{id: 'original', kind: 'video', file: 'original.mp4', enabled: true}]});
}
const originals = [...track.clips];
for (const clip of originals) await app._convertMediaClipToDirector(clip);
assert.deepEqual(cuts.map(c => [c.start, c.duration, c.rate]), [[0, 5, 1], [5, 5, 1], [10, 5, 1]]);
for (const [i, clip] of originals.entries()) {
    assert.equal(clip.duration, 5); assert.equal(clip.startTime, i * 5);
    assert.equal(clip.sourceOffset, 0); assert.equal(clip.track, target);
    assert.equal(meta.get(clip.id).items[0].file, `trim-${i + 1}.mp4`);
    assert.equal(resources.get(`trim-${i + 1}.mp4`).prompt, 'keep prompt');
    assert.deepEqual(resources.get(`trim-${i + 1}.mp4`).video_trim, {source_id: 'original', start: i * 5, duration: 5, rate: 1});
}
const fast = {id: 'fast', track, startTime: 0, duration: 2, sourceOffset: 7, playbackRate: 2, _applyPosition() {}};
track.clips.push(fast); meta.set(fast.id, {items: [{id: 'original', kind: 'video', file: 'original.mp4'}]});
const prepared = await app._prepareDirectorVideos(track.clips);
assert.deepEqual(cuts.at(-1), {file: 'original.mp4', start: 7, duration: 4, rate: 2});
assert.equal(fast.sourceOffset, 7, 'Preparation must not mutate clips before all files succeed');
assert.equal(prepared.length, 1);
fail = true;
const undo = app.undoCount;
await app._convertMediaClipToDirector(fast);
assert.equal(app.undoCount, undo); assert.equal(fast.track, track); assert.equal(fast.sourceOffset, 7);
assert.equal(resources.get('original').file, 'original.mp4');
fail = false;
const element = {classList: {add() {}, remove() {}}, style: {setProperty() {}}, removeAttribute() {}, querySelector: () => null};
track.id = 'media'; track.el = track.headerEl = element; fast.el = element;
app._trackInfo = new Map(); app._meta = meta;
app._applyTrackTypeOrder = app._updatePromptPanel = () => {};
await method('_convertVisualTrackType').call(app, track, 'image');
assert.equal(track.type, 'image');
assert.equal(fast.sourceOffset, 0); assert.equal(fast.playbackRate, 1);
assert.equal(fast.duration, 2); assert.equal(fast.src, 'trim-5.mp4');
assert.equal(meta.get(fast.id).clipType, 'image');
console.log('Video conversion preserves each split range, speed and source metadata; failures leave clips unchanged.');

// Re-trim a converted clip from the original, then expand beyond the prior selection.
const first = originals[1];
let sourceRange = videoTrimSource(app, meta.get(first.id).items[0]);
assert.equal(sourceRange.item.file, 'original.mp4');
assert.equal(sourceRange.start, 5);
assert.equal(sourceRange.duration, 5);
app._replaceDirectorVideo(first, 0, 'expanded.mp4', {source_id: 'original', start: 3, duration: 9, rate: 1});
const saved = JSON.parse(JSON.stringify([...resources]));
const reloaded = {_findMediaById: id => new Map(saved).get(id)};
sourceRange = videoTrimSource(reloaded, meta.get(first.id).items[0]);
assert.equal(sourceRange.item.file, 'original.mp4');
assert.equal(sourceRange.start, 3);
assert.equal(sourceRange.duration, 9);
console.log('Repeated trims retain the original source and support expanding the range after reload.');

app._projectResources = [...resources.values()];
const project = {media: method('_serializeMediaCatalog').call(app), tracks: []};
app._parseMediaMeta = () => ({});
app._mediaStarsId = (kind, file) => file;
method('_hydrateMediaCatalog').call(app, project);
const restoredCatalog = new Map(project.media.map(row => [row.id, row]));
sourceRange = videoTrimSource({_findMediaById: id => restoredCatalog.get(id)}, meta.get(first.id).items[0]);
assert.equal(sourceRange.start, 3); assert.equal(sourceRange.duration, 9);
assert.equal(sourceRange.item.file, 'original.mp4');
const videoFrameSeekTime = new Function(trimSource.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '; return videoFrameSeekTime;')();
// The original MP4 uses 1/16000 timestamps: frame 13 starts after 13/24.
const frame13Pts = 8667 / 16000;
assert(13 / 24 < frame13Pts);
assert(videoFrameSeekTime(13, 24) >= frame13Pts);
assert(videoFrameSeekTime(13, 24) < 14 / 24);
for (const fps of [24, 25, 30, 60]) for (let frame = 0; frame < fps * 60; frame++) {
    assert.equal(Math.floor(videoFrameSeekTime(frame, fps) * fps + 1e-9), frame);
}
console.log('Trim preview seeks beyond rounded MP4 boundaries without changing the requested frame.');
