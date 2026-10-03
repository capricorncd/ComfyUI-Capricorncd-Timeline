import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const trimSource = readFileSync(new URL('../js/editor/VideoTrim.js', import.meta.url), 'utf8');
const videoTrimSource = new Function('T', trimSource.replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '') + '; return videoTrimSource;')(key => key);
const refCode = readFileSync(new URL('../js/editor/ReferenceTimeline.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const referenceTimeline = new Function(refCode + ';return referenceTimeline;')();
const globals = {referenceTimeline, mediaKindFromFilename: (file, kind) => kind || 'video',
    mediaUid: () => 'new-id', T: key => key, showCapAlert() {},
    isMediaTrackType: type => type === 'video', isDirectorTrackType: type => type === 'image',
    ICONS: {film: '', clapperboard: ''}, defaultImageMeta: () => ({})};
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
    _ensureClipMeta: clip => meta.get(clip.id), _clipItems: m => m.items.map(row => ({...row})),
    _findMediaById: id => resources.get(id), _ensureMedia: (kind, file) => {
        const row = {id: file, file, kind}; resources.set(file, row); return row;
    },
    _findClipById: id => [...track.clips, ...target.clips].find(c => c.id === id),
    _normalizeVisualMeta() {}, _syncClipPrimaryAppearance() {}, _decorateClip() {}, _trackHasRoom: () => true,
    _trackIndex: () => 1, _recordUndo() { this.undoCount = (this.undoCount || 0) + 1; },
    _refreshTimelineDuration() {}, _saveToWidgets() {}, _scheduleProgramPreview() {},
    _timeline: {tracks: [track, target], emit() {}, selectClip() {}},
};
for (const name of ['_initializeDirectorReferences', '_convertMediaClipToDirector']) app[name] = method(name);
for (let i = 0; i < 3; i++) {
    const clip = {id: String(i), track, startTime: i * 5, sourceOffset: i * 5, duration: 5, playbackRate: 1, _applyPosition() {}};
    track.clips.push(clip); meta.set(clip.id, {items: [{id: 'original', kind: 'video', file: 'original.mp4', enabled: true}]});
}
const originals = [...track.clips];
for (const clip of originals) await app._convertMediaClipToDirector(clip);
for (const [i, clip] of originals.entries()) {
    assert.equal(clip.duration, 5); assert.equal(clip.startTime, i * 5);
    assert.equal(clip.sourceOffset, i * 5); assert.equal(clip.track, target);
    assert.equal(meta.get(clip.id).items[0].file, 'original.mp4');
    assert.equal(clip.src, undefined);
    const video = meta.get(clip.id).referenceTimeline.videos[0];
    assert.equal(video.file, 'original.mp4'); assert.equal(video.media_id, 'original');
    assert.equal(video.trim_in_sec, i * 5); assert.equal(video.trim_out_sec, (i + 1) * 5);
}
assert.equal(resources.size, 1, 'Conversion must not create catalog assets or trimmed files');
assert.equal(resources.get('original').prompt, 'keep prompt');
const fast = {id: 'fast', track, startTime: 0, duration: 2, sourceOffset: 7, playbackRate: 2, _applyPosition() {}};
track.clips.push(fast); meta.set(fast.id, {items: [{id: 'original', kind: 'video', file: 'original.mp4'}]});
const element = {classList: {add() {}, remove() {}}, style: {setProperty() {}}, removeAttribute() {}, querySelector: () => null};
track.id = 'media'; track.el = track.headerEl = element; fast.el = element;
app._trackInfo = new Map(); app._meta = meta;
app._applyTrackTypeOrder = app._updatePromptPanel = () => {};
await method('_convertVisualTrackType').call(app, track, 'image');
assert.equal(track.type, 'image');
assert.equal(fast.sourceOffset, 7); assert.equal(fast.playbackRate, 2);
assert.equal(fast.duration, 2);
const video = meta.get(fast.id).referenceTimeline.videos[0];
assert.equal(video.trim_in_sec, 7); assert.equal(video.trim_out_sec, 11);
assert.equal(video.playback_rate, 2);
assert.equal(resources.size, 1);
const persisted = JSON.parse(JSON.stringify(meta.get(fast.id)));
assert.deepEqual(persisted.referenceTimeline, meta.get(fast.id).referenceTimeline);
app._initializeDirectorReferences(fast);
assert.deepEqual(meta.get(fast.id).referenceTimeline, persisted.referenceTimeline);
console.log('Clip and track conversions retain original files, trim ranges, speed, descriptions and reloadable child timeline metadata');

resources.set('old-copy', {id:'old-copy',kind:'video',file:'old-copy.mp4',
    video_trim:{source_id:'original',start:3,duration:9,rate:1}});
assert.equal(videoTrimSource(app,{id:'old-copy',file:'old-copy.mp4'}).item.file,'original.mp4');
console.log('Existing trimmed-copy source metadata remains readable');
