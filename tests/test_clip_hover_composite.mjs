import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name) {
    const start=source.search(new RegExp(`    (async )?${name}\\(`));
    assert(start>=0,name);
    const end=source.indexOf('\n    }',start)+6;
    return new Function('defaultImageMeta','normalizeClipVolume','isDirectorTrackType','isMediaTrackType',
        `return ({${source.slice(start,end)}}).${name}`)(()=>({}),v=>Number(v??1),t=>t==='image',t=>t==='video');
}
const clip={id:'director',startTime:10,endTime:15,duration:5};
const other={id:'other',startTime:10,endTime:15,duration:5};
const track={id:'track',type:'image',clips:[clip,other],visible:true,muted:false};
clip.track=track;other.track=track;
const video=(id,extra={})=>({id,file:`${id}.mp4`,duration_sec:5,...extra});
const meta={previewMode:'media',volume:.5,generatedVideos:[
    video('new',{edit_start_sec:2,trim_in_sec:1,trim_out_sec:3}),
    video('disabled',{enabled:false}),video('old',{muted:true}),
],genEditAudios:[{file:'voice.wav',edit_start_sec:1,duration:4,source_offset:2,volume_points:[{source_ms:2000,gain:.5}]}]};
const app={_meta:new Map([[clip.id,meta],[other.id,{generatedVideos:[video('other')]}]]),_trackInfo:new Map(),
    _allImageTracks:()=>[track],_allRenderableTracks:()=>[track],
    _clipGeneratedVideos:m=>m.generatedVideos,_normalizeGenEditAudioDraft:rows=>rows||[],
    _clipUsesGeneratedPreview:()=>false,_enabledClipItems:()=>[],
    _genEffectiveDurationSec:g=>(g.trim_out_sec??g.duration_sec)-(g.trim_in_sec||0),
};
for(const name of ['_collectPreviewLayers','_collectGeneratedVideoAudioJobs']) app[name]=method(name);
assert.deepEqual(app._collectPreviewLayers(12.5,clip).map(l=>l.file),['old.mp4','new.mp4'],'newest paints on top, disabled skipped');
assert.deepEqual(app._collectPreviewLayers(14.5,clip).map(l=>l.file),['old.mp4'],'trimmed overlay no longer visible');
assert.equal(app._collectPreviewLayers(15,clip).length,0,'clip boundary caps visual duration');
const jobs=app._collectGeneratedVideoAudioJobs(10,clip);
assert.deepEqual(jobs.map(j=>j.file),['new.mp4','voice.wav'],'mix only this clip, respect muted video');
assert.deepEqual(jobs.map(j=>[j.absStart,j.absEnd,j.tin]),[[12,14,1],[11,15,2]]);
assert.equal(jobs[1].volumePoints,meta.genEditAudios[0].volume_points);
assert.equal(app._collectGeneratedVideoAudioJobs(10).length,0,'normal timeline still respects preview mode');
assert.equal(meta.previewMode,'media','hover never persists a preview mode change');

const audioCtx={currentTime:1};
const drawCalls=[],audioCalls=[];
const drawing={fillRect(){},drawImage(){}};
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>drawing})};
Object.assign(app,{
    _resourceGenPreview:{merged:true,clipId:clip.id,clip,startedAt:1,cycle:-1},
    _timeline:{_playing:false,currentTime:99},
    _findClipById:()=>clip,_ensurePlaybackContext:()=>audioCtx,
    _stopAudioPlayback(){this.stops=(this.stops||0)+1;},_pauseUnusedPreviewVideos(){},
    _scheduleGeneratedVideoWebAudio(time,start,options){audioCalls.push({time,start,...options});},
    _layoutProgramCanvas:()=>({canvasW:864,canvasH:480}),programCanvas:{getContext:()=>drawing},programEmpty:{},
    _drawPreviewLayersOnce(ctx,w,h,t,options){drawCalls.push({t,...options});return true;},
    _stopResourceGenProgramPreview(){this._resourceGenPreview=null;},
});
const render=method('_renderClipHoverPreview');
render.call(app);
assert.equal(audioCalls.length,1);
assert.equal(drawCalls[0].playing,true);
audioCtx.currentTime=3.5;render.call(app);
assert.equal(drawCalls.at(-1).t,12.5);
assert.equal(audioCalls.length,1,'do not restart audio on every frame');
audioCtx.currentTime=6.1;render.call(app);
assert.equal(audioCalls.length,2,'loop restarts the mixed audio');
assert.equal(audioCalls[0].isPlaying(),false,'cancel async decode from the previous loop');
assert.equal(audioCalls[1].isPlaying(),true);
assert(Math.abs(drawCalls.at(-1).t-10.1)<1e-9);
assert.equal(app._timeline.currentTime,99,'hover never moves seek');
app._timeline._playing=true;render.call(app);
assert.equal(app._resourceGenPreview,null,'main playback stops hover');
assert.equal(audioCalls[1].isPlaying(),false);

// Late audio decode must not become audible after leaving the hover.
let finish, active=true, starts=0;
const pendingApp={_genMainAudioToken:0,_ensurePlaybackContext:()=>audioCtx,
    _ensureGenVideoAudioBuffer:()=>new Promise(resolve=>{finish=resolve;}),
    _activeAudioSources:[],_timeline:{_playing:false}};
audioCtx.createBufferSource=()=>{starts++;return {};};
const pending=method('_scheduleGeneratedVideoWebAudio').call(pendingApp,1,10,{jobs,isPlaying:()=>active});
active=false;finish({duration:10});await pending;
assert.equal(starts,0);
assert.match(source,/this\._startClipHoverPreview\(clip\)/);
console.log('Director hover composition: layering, trims, audio mix, mute, loops, seek and cancellation passed');
