import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.search(new RegExp('    (async )?' + name + '\\('));
    assert(start >= 0, name);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('return ({' + source.slice(start, end) + '}).' + name)();
}

const video = {readyState:2, videoWidth:864, videoHeight:480, currentTime:1, duration:10};
const entry = {el:video, ready:true, seeking:false, _hasDrawn:true};
const canDraw = method('_previewVideoCanDraw');
assert(canDraw(entry));
entry.seeking = true;
assert(!canDraw(entry));
entry.seeking = false;
video.seeking = true;
assert(!canDraw(entry));
video.seeking = false;
video.readyState = 1;
assert(!canDraw(entry));
video.readyState = 2;

const seekApp = {
    _isGenEditModalOpen:()=>false, _timeline:{_playing:false},
    _armPreviewSeekWatch:()=>{}, _clearPreviewSeekWatch:()=>{},
};
const seek = method('_seekPreviewVideo');
for (const fps of [24, 30, 60]) {
    for (const direction of [-1, 1]) {
        video.currentTime = 1;
        entry.seeking = false;
        seek.call(seekApp, entry, 1 + direction / fps);
        assert(entry.seeking, `${fps} fps must seek a single frame`);
        assert.equal(video.currentTime, 1 + direction / fps);
    }
}
// Rapid stepping updates the destination without interrupting the in-flight seek.
seek.call(seekApp, entry, 2);
assert.equal(entry.wantTime, 2);
assert.notEqual(video.currentTime, 2);
entry.seeking = false;
seek.call(seekApp, entry, entry.wantTime);
assert.equal(video.currentTime, 2);
seekApp._timeline._playing = true;
entry.seeking = false;
seek.call(seekApp, entry, 2.1);
assert(!entry.seeking, 'normal playback must still freewheel');

const sync = method('_syncPreviewVideo');
seekApp._seekPreviewVideo = seek;
const nextVideo = {readyState:2, videoWidth:864, videoHeight:480, currentTime:0, duration:10,
    paused:true, play(){this.paused = false; return Promise.resolve();}, pause(){this.paused = true;}};
const nextEntry = {el:nextVideo, ready:true, seeking:false, _hasDrawn:false, _playSynced:false};
sync.call(seekApp, nextEntry, 22/24);
assert(nextEntry.seeking);
assert(!canDraw(nextEntry));
nextEntry.seeking = false; // The first activation seek completed between render ticks.
sync.call(seekApp, nextEntry, 23/24);
assert(!nextEntry.seeking, 'a ready next clip must draw before starting another activation seek');
assert(canDraw(nextEntry));
assert(!nextVideo.paused);
assert.equal(nextVideo.currentTime, 22/24);
nextEntry._hasDrawn = true;
sync.call(seekApp, nextEntry, 4);
assert(nextEntry.seeking, 'large playback drift must still trigger resync');
nextEntry.seeking = false;
nextEntry.ready = false;
nextEntry._hasDrawn = false;
nextEntry._playSynced = false;
nextVideo.readyState = 0;
sync.call(seekApp, nextEntry, 5);
assert(!nextEntry._playSynced, 'unloaded metadata must not count as a completed initial sync');
nextVideo.readyState = 2;
nextEntry.ready = true;
sync.call(seekApp, nextEntry, 5.02);
assert(nextEntry.seeking);

const commits = [];
const visible = {setTransform(){}, fillRect(){commits.push('black');}, drawImage(){commits.push('frame');}};
const offctx = {setTransform(){}, fillRect(){}, save(){}, restore(){}, globalAlpha:1};
const canvas = {width:864, height:480, getContext:()=>visible};
const offscreen = {width:864, height:480, getContext:()=>offctx};
const layers = [
    {kind:'generated', file:'clip.mp4', clip:{startTime:0}},
    {kind:'image', mediaTrack:true, meta:{opacity:1}, clip:{src:'logo.png'}},
];
let imageReady = true;
const app = {
    programCanvas:canvas, _programOffscreen:offscreen, _programHadFrame:true,
    _programCanvasKey:'864x480', _timeline:{currentTime:2, _playing:false},
    _isGenEditModalOpen:()=>false,
    _layoutProgramCanvas:()=>({canvasW:864,canvasH:480}), getFps:()=>24,
    _collectPreviewLayers:()=>layers, _hasVisibleSubtitleAt:()=>true,
    _ensurePreviewVideo:()=>entry, _syncPreviewVideo(){},
    _previewVideoCanDraw:canDraw, _drawCover:()=>true, _drawMediaLayer:()=>true,
    _ensurePreviewImage:()=>({ready:imageReady,el:{}}), _imgUrl:file=>file,
    _drawPreviewLayersOnce:method('_drawPreviewLayersOnce'),
    _drawSubtitleOverlays(){}, _pauseUnusedPreviewVideos(){}, _scheduleProgramPreview(){},
};
const render = method('_renderProgramPreview');
entry.seeking = true;
await render.call(app);
assert.deepEqual(commits, [], 'subtitle/logo must not commit over a missing video frame');
entry.seeking = false;
await render.call(app);
assert.deepEqual(commits, ['frame'], 'commit the complete scene after seek finishes');
commits.length = 0;
imageReady = false;
await render.call(app);
assert.deepEqual(commits, [], 'hold the scene while its image overlay loads');
imageReady = true;
await render.call(app);
assert.deepEqual(commits, ['frame']);
commits.length = 0;
app._timeline._playing = true;
app._warmNextPreviewVideo = ()=>{};
app._programFrameKey = null;
entry.seeking = true;
await render.call(app);
assert.deepEqual(commits, []);
entry.seeking = false;
await render.call(app);
assert.deepEqual(commits, ['frame'], 'seek completion must retry the same timeline frame');
app._timeline._playing = false;
commits.length = 0;
layers.length = 0;
await render.call(app);
assert.deepEqual(commits, ['frame'], 'subtitle-only scenes remain supported');
commits.length = 0;
app._hasVisibleSubtitleAt = ()=>false;
await render.call(app);
assert.deepEqual(commits, ['black'], 'seeking into a genuine empty interval must clear the scene');

// The trimming modal uses the same decoder and complete-frame drawing path.
commits.length = 0;
layers.push({kind:'generated', file:'clip.mp4', clip:{startTime:0}});
canvas.parentElement = {clientWidth:864,clientHeight:480};
app.genEditPreviewCanvas = canvas;
app.genEditModal = {hidden:false};
app._genEditState = {timeline:{currentTime:2,_playing:false}, previewHadFrame:true,
    previewOffscreen:offscreen};
app._genEditParentDuration = ()=>5;
app._collectGenEditPreviewLayers = ()=>layers;
app._drawContain = ()=>true;
const renderTrim = method('_renderGenEditPreview');
entry.seeking = true;
await renderTrim.call(app);
assert.deepEqual(commits, [], 'trim preview must retain its last completed frame too');
entry.seeking = false;
await renderTrim.call(app);
assert.deepEqual(commits, ['frame']);
console.log('Preview frame hold: seeking, precise stepping, complete layers and empty intervals passed');
