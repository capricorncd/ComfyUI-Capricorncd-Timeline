import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function(`return ({${source.slice(start, end)}}).${name}`)();
}

const videos = [];
globalThis.document = {
    createElement(tag) {
        assert.equal(tag, 'video');
        const listeners = {};
        let time = 0;
        const video = {
            readyState: 2, videoWidth: 1920, videoHeight: 1088, duration: 7.28,
            paused: true, seeking: false,
            get currentTime() { return time; },
            set currentTime(value) { time = value; this.seeking = true; },
            addEventListener(name, callback) { listeners[name] = callback; },
            play() { this.paused = false; return Promise.resolve(); },
            pause() { this.paused = true; },
            finishSeek() { this.seeking = false; listeners.seeked(); },
        };
        videos.push(video);
        return video;
    },
};
const app = {
    _previewVideos: new Map(), _timeline: { _playing: true },
    _isGenEditModalOpen: () => false,
    _armPreviewSeekWatch() {}, _clearPreviewSeekWatch() {}, _scheduleProgramPreview() {},
    _outputVideoUrl: file => file, _videoUrl: file => file,
    _drawCover: () => true, _drawMediaLayer: () => true,
};
for (const name of ['_ensurePreviewVideo', '_seekPreviewVideo', '_syncPreviewVideo',
    '_previewVideoCanDraw', '_drawPreviewLayersOnce', '_pauseUnusedPreviewVideos']) app[name] = method(name);
const ctx = { save() {}, restore() {}, globalAlpha: 1 };
const layers = ['clip_2_mtldozjw', 'clip_5_mtlfif01'].map(id => ({
    kind: 'generated', file: 'shared.mp4', clip: { id, startTime: 21 },
    transform: { id: 'shared-take' }, playbackRate: 1, trimInSec: 0, editStartSec: 0,
}));
layers.push({ ...layers[0], file: 'drums.mp4', clip: { id: 'clip_6_mtlfjp7p', startTime: 21 } });
const used = new Set();
const draw = t => {
    used.clear();
    return app._drawPreviewLayersOnce(ctx, 864, 480, t, { layers, onVideoUsed: key => used.add(key) });
};
assert.equal(draw(21.1), false, 'initial positioning waits for decoding');
for (const video of videos) video.finishSeek();
assert.equal(draw(21.14), true, 'overlapping clips sharing a file must finish positioning and commit a frame');
assert.equal(app._previewVideos.size, 3, 'each simultaneous segment owns its playback position');
app._pauseUnusedPreviewVideos(used);
assert(videos.every(video => !video.paused), 'all visible decoders remain playing');

layers[1].trimInSec = 2;
assert.equal(draw(21.18), false);
for (const video of videos) if (video.seeking) video.finishSeek();
assert.equal(draw(21.22), true, 'independent in-points must not fight over a shared decoder');
assert.equal(app._previewVideos.size, 3, 'editing an in-point reuses its segment decoder');
layers.splice(1, 1);
assert.equal(draw(21.26), true);
app._pauseUnusedPreviewVideos(used);
assert.equal(videos[1].paused, true, 'inactive segment decoders are paused');
assert.equal(videos[0].paused, false, 'another segment of the same file keeps playing');

globalThis.isDirectorTrackType = type => type === 'director';
const future = { ...layers[0], clip: { id: 'next-clip', startTime: 30, endTime: 37 } };
app._allRenderableTracks = () => [{ id: 'director', type: 'director', clips: [future.clip] }];
app._trackInfo = new Map();
app._meta = new Map([['next-clip', {}]]);
app._clipUsesGeneratedPreview = () => false;
app._collectPreviewLayers = () => [future];
app.getFps = () => 25;
app._warmNextPreviewVideo = method('_warmNextPreviewVideo');
used.clear();
app._warmNextPreviewVideo(29, used);
assert.equal(app._previewVideos.size, 4);
app._pauseUnusedPreviewVideos(used);
layers.splice(0, layers.length, future);
draw(30.04);
assert.equal(app._previewVideos.size, 4, 'playback reuses the exact decoder warmed for the next segment');
for (const video of videos) if (video.seeking) video.finishSeek();
assert.equal(draw(30.08), true);
app._warmNextPreviewVideo(29, used);
assert.equal(videos[3].paused, false, 'prefetch does not pause a decoder already used by the current frame');
console.log('PASS: overlapping generated clips keep independent preview positions');
