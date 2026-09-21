import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const utils = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const normalizePlaybackRate = new Function('clamp', `return ${utils.match(/export const normalizePlaybackRate = ([\s\S]*?);/)[1]}`)(
    (v, a, b) => Math.max(a, Math.min(b, v)));

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.search(new RegExp('    (async )?' + name + '\\('));
  assert(start >= 0, name);
  const end = source.indexOf('\n    }', start) + 6;
  return new Function('normalizePlaybackRate', 'normalizeClipVolume', 'defaultImageMeta', 'volumeAt',
    'return ({' + source.slice(start, end) + '}).' + name)(
    normalizePlaybackRate, v => Math.max(0, Math.min(5, Number(v ?? 1))), () => ({}), points => points[0]?.gain ?? 1);
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
meta.genEditAudios[0].enabled = false;
assert(!app._collectGeneratedVideoAudioJobs(10).some(job => job.file === 'voice.wav'));
meta.genEditAudios[0].enabled = true;
app._clipUsesGeneratedPreview = () => false;
assert.deepEqual(app._collectGeneratedVideoAudioJobs(10).map(job => job.file), ['voice.wav']);
app._clipUsesGeneratedPreview = () => true;
meta.muted=true;
assert.equal(app._collectGeneratedVideoAudioJobs(10).length,0);
meta.muted=false;
track.muted=true;
assert.equal(app._collectGeneratedVideoAudioJobs(10).length,0);
track.muted=false;
assert.deepEqual(app._collectGeneratedVideoAudioJobs(16).map(j=>j.file), ['second.mp4','voice.wav']);

const played=[];
const scheduled=[];
meta.generatedVideos[1].volume = 1.5;
meta.genEditAudios[0].volume = 2;
assert.equal(app._collectGeneratedVideoAudioJobs(10)[1].volume, 0.75);
assert.equal(app._collectGeneratedVideoAudioJobs(10).at(-1).volume, 1);
app._scheduleAudioFadeGain=(...args)=>scheduled.push(args);
const points=[{source_ms:1000,gain:0.2},{source_ms:4000,gain:1.5}];
meta.genEditAudios[0].volume_points=points;
const ctx = {
  currentTime:0, destination:{},
  createBufferSource() { return {
    playbackRate: { value: 1 },
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
assert.equal(scheduled.length,1);
assert.equal(scheduled[0][8],points);
assert(scheduled[0][9]>0, 'seek/decoding delay must offset the envelope in source time');

played.length=0;
ctx.currentTime=0;
app._genEditState={
  clipId:'clip',timeline:{_playing:true,currentTime:0,tracks:[]},
  draft:meta.generatedVideos,
  audioDraft:[{file:'voice.wav',duration:10,source_offset:1,volume:2,volume_points:points}],
};
app._stopGenEditAudioPlayback=()=>{};
app._genEditParentDuration=()=>10;
app._findClipById=()=>clip;
app._ensureClipMeta=()=>meta;
await method('_startGenEditAudioPlayback').call(app);
assert.deepEqual(played.map(p=>p.file),['voice.wav','first.mp4','second.mp4']);
assert.equal(played[2].when,2.03); // Future video is scheduled even with a separate audio track.
assert.equal(app._genEditAudioSources.length,3);
assert.equal(scheduled.length,2);
assert.equal(scheduled[1][8],points);
assert.equal(scheduled[1][7], 1, 'trim audio gain multiplies clip and parent volume');
assert(scheduled[1][9]>=1, 'trimmed audio must use its source offset');
played.length=0;
app._genEditState.timeline.tracks=[{type:'audio',muted:true},{type:'audio',muted:false}];
app._genEditState.audioDraft.push({file:'muted-detached.wav',duration:10,muted:true});
await method('_startGenEditAudioPlayback').call(app);
assert(played.some(p=>p.file==='voice.wav'),'one muted audio track must not silence other tracks');
assert(!played.some(p=>p.file==='muted-detached.wav'));
console.log('Generated preview audio: mixing, mute/disable, trims, future clips and decoding delay passed');

const waveformClip = { startTime: 10, duration: 4, _refreshWaveRow() {} };
const waveformApp = {
  _collectGeneratedVideoAudioJobs: () => [{ file: 'video', location: 'output', tin: 1,
    absStart: 11, absEnd: 13, volume: 2, volumePoints: [{gain: 0.5}] }],
  _ensureGenVideoAudioBuffer: async () => ({ duration: 4 }),
  _audioBufferToPeaks: () => [[0.1, 0.2, 0.3, 0.4]],
  _ensureClipMeta: () => ({}), _clipUsesGeneratedPreview: () => true,
};
await method('_syncGeneratedClipWaveform').call(waveformApp, waveformClip);
assert.equal(waveformClip.hasAudio, true);
assert.equal(waveformClip.waveformPeaks[0], 0);
assert(Math.abs(waveformClip.waveformPeaks[2000] - 0.2) < 1e-6);
assert(Math.abs(waveformClip.waveformPeaks[4000] - 0.3) < 1e-6);
assert.equal(waveformClip.waveformPeaks[6000], 0);
assert.equal(waveformClip.waveformWindow.sourceDuration, 4);
waveformApp._ensureGenVideoAudioBuffer = async () => null;
await method('_syncGeneratedClipWaveform').call(waveformApp, waveformClip);
assert.equal(waveformClip.hasAudio, false);
