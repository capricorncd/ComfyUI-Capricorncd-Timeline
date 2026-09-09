import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.search(new RegExp('    (async )?' + name + '\\('));
  assert(start >= 0, name);
  const end = source.indexOf('\n    }', start) + 6;
  return new Function('normalizeClipVolume', 'defaultImageMeta',
    'return ({' + source.slice(start, end) + '}).' + name)(
    v => Math.max(0, Math.min(2, Number(v ?? 1))), () => ({}));
}
const gen = (file, extra = {}) => ({file, enabled:true, duration_sec:5, ...extra});
const meta = {
  volume:0.5,
  generatedVideos:[
    gen('silent.mp4'), gen('first.mp4', {trim_in_sec:1}),
    gen('second.mp4', {edit_start_sec:2}),
    gen('muted.mp4', {muted:true}), gen('disabled.mp4', {enabled:false}),
    gen('outside.mp4', {edit_start_sec:12}),
  ],
  genEditAudios:[{file:'voice.wav',edit_start_sec:0,duration:20}],
};
const clip = {id:'clip',startTime:10,endTime:20,duration:10};
const track = {id:'track',clips:[clip]};
const app = {
  _timeline:{_playing:true}, _trackInfo:new Map(), _meta:new Map([['clip',meta]]),
  _allImageTracks:()=>[track], _clipUsesGeneratedPreview:()=>true,
  _clipGeneratedVideos:m=>m.generatedVideos, _normalizeGenEditAudioDraft:rows=>rows,
  _genEffectiveDurationSec:method('_genEffectiveDurationSec'),
  _collectGeneratedVideoAudioJobs:method('_collectGeneratedVideoAudioJobs'),
};
let jobs = app._collectGeneratedVideoAudioJobs(10);
assert.deepEqual(jobs.map(j=>j.file), ['silent.mp4','first.mp4','second.mp4','voice.wav']);
assert.equal(jobs[1].tin,1);
assert.equal(jobs[2].absStart,12);
assert.equal(jobs[3].absEnd,20);
assert.equal(jobs[0].volume,0.5);
meta.muted=true;
assert.equal(app._collectGeneratedVideoAudioJobs(10).length,0);
meta.muted=false;
track.muted=true;
assert.equal(app._collectGeneratedVideoAudioJobs(10).length,0);
track.muted=false;
assert.deepEqual(app._collectGeneratedVideoAudioJobs(16).map(j=>j.file), ['second.mp4','voice.wav']);

const played=[];
const ctx = {
  currentTime:0, destination:{},
  createBufferSource() { return {
    connect(){}, start(when,offset,duration){played.push({file:this.buffer.file,when,offset,duration});},
  }; },
  createGain() { return {connect(){},gain:{setValueAtTime(){}}}; },
};
app._ensurePlaybackContext=()=>ctx;
app._activeAudioSources=[];
app._ensureGenVideoAudioBuffer=async file=>{
  ctx.currentTime=0.5; // Decoding finishes after playback has started.
  return file==='silent.mp4' ? null : {file,duration:30};
};
await method('_scheduleGeneratedVideoWebAudio').call(app,0.03,10);
assert.deepEqual(played.map(p=>p.file),['first.mp4','second.mp4','voice.wav']);
assert.equal(played[0].when,0.5);
assert(Math.abs(played[0].offset-1.47)<1e-8);
assert.equal(played[1].when,2.03);

played.length=0;
ctx.currentTime=0;
app._genEditState={
  clipId:'clip',timeline:{_playing:true,currentTime:0,tracks:[]},
  draft:meta.generatedVideos,
  audioDraft:[{file:'voice.wav',duration:10}],
};
app._stopGenEditAudioPlayback=()=>{};
app._genEditParentDuration=()=>10;
app._findClipById=()=>clip;
app._ensureClipMeta=()=>meta;
await method('_startGenEditAudioPlayback').call(app);
assert.deepEqual(played.map(p=>p.file),['voice.wav','first.mp4','second.mp4']);
assert.equal(played[2].when,2.03); // Future video is scheduled even with a separate audio track.
assert.equal(app._genEditAudioSources.length,3);
console.log('Generated preview audio: mixing, mute/disable, trims, future clips and decoding delay passed');
