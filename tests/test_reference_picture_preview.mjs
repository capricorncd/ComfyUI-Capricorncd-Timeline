import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _collectPreviewLayers(');
const collect = new Function('isDirectorTrackType', 'isMediaTrackType', 'referenceTimeline', 'normalizePlaybackRate',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._collectPreviewLayers`)(
    type => type === 'image', type => type === 'video', (app, clip) => app._meta.get(clip.id).referenceTimeline, rate => rate || 1);
const picture = {id: 'picture', startTime: 0, endTime: 10};
const video = {id: 'video', startTime: 0, endTime: 10};
const pictureMeta = {items: [{kind: 'image', file: 'one.png'}, {kind: 'image', file: 'two.png'}],
    referenceTimeline: {videos: [], audios: [{file: 'music.wav'}]}};
const videoMeta = {items: [{kind: 'video', file: 'reference.mp4'}], referenceTimeline: {
    videos: [{file: 'reference.mp4', trim_in_sec: 2, trim_out_sec: 7, edit_start_sec: 0}], audios: []}};
const app = {
    _allRenderableTracks: () => [{id: 'top', type: 'image', clips: [picture]}, {id: 'bottom', type: 'image', clips: [video]}],
    _trackInfo: new Map(), _meta: new Map([['picture', pictureMeta], ['video', videoMeta]]),
    _clipUsesGeneratedPreview: meta => meta.previewMode === 'generated', _clipGeneratedVideos: meta => meta.generatedVideos || [],
    _genEffectiveDurationSec: row => (row.trim_out_sec - row.trim_in_sec),
    _enabledClipItems: meta => meta.items, _clipPreviewItemAtTime: (clip, items) => ({item: items[1] || items[0], index: items.length - 1}),
};
let layers = collect.call(app, 1);
assert.deepEqual(layers.map(row => row.kind), ['generated', 'image']);
assert.equal(layers[1].item.file, 'two.png', 'Reference video on another track must not suppress multi-picture preview');
pictureMeta.referenceTimeline.videos = [{file: 'disabled.mp4', enabled: false}];
assert.equal(collect.call(app, 1)[1].item.file, 'two.png', 'Disabled reference videos still allow picture preview');
pictureMeta.previewMode = 'generated';
pictureMeta.generatedVideos = [{file: 'final.mp4', trim_in_sec: 0, trim_out_sec: 10}];
layers = collect.call(app, 1);
assert.deepEqual(layers.map(row => row.file), ['reference.mp4', 'final.mp4']);
assert(!layers.some(row => row.kind === 'image'), 'A Clip in generated preview mode does not also show its own reference pictures');
pictureMeta.previewMode = 'media';
layers = collect.call(app, 1);
const drawStart = source.indexOf('    _drawPreviewLayersOnce(');
const draw = new Function(`return ({${source.slice(drawStart, source.indexOf('\n    }', drawStart) + 6)}})._drawPreviewLayersOnce`)();
const painted = [];
Object.assign(app, {
    _ensurePreviewVideo: file => ({key: file, el: {file}}), _syncPreviewVideo() {}, _previewVideoCanDraw: () => true,
    _imgUrl: file => file, _ensurePreviewImage: file => ({ready: true, el: {file}}),
    _drawCover: (ctx, media) => { painted.push(media.file); return true; },
    _drawMediaLayer: (ctx, media) => { painted.push(media.file); return true; },
});
assert(draw.call(app, {save() {}, restore() {}}, 864, 480, 1, {layers}));
assert.deepEqual(painted, ['reference.mp4', 'two.png'], 'Drawing must keep the upper picture layer above the lower reference video');
console.log('Reference videos, multi-picture previews and generated mode remain independent per Clip.');
