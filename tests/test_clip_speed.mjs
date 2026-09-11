import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const utils = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const normalizePlaybackRate = new Function('clamp', `return ${utils.match(/export const normalizePlaybackRate = ([\s\S]*?);/)[1]}`)(
    (v,a,b)=>Math.max(a,Math.min(b,v)));

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name, deps = {}, text = source, indent = '    ') {
    const start = text.indexOf(`${indent}${name}(`);
    assert(start >= 0, name);
    const end = text.indexOf(`\n${indent}}`, start) + indent.length + 2;
    const args = {normalizePlaybackRate, isMediaTrackType:t=>['media','video'].includes(t),
        normalizeClipVolume:v=>v ?? 1, T:k=>k, ...deps};
    return new Function(...Object.keys(args), `return ({${text.slice(start,end)}}).${name}`)(...Object.values(args));
}
let undo=0, saved=0, warned=0;
globalThis.alert=()=>warned++;
const track={type:'audio',locked:false,clips:[]};
const clip={id:'a',track,startTime:2,duration:6,sourceOffset:1,playbackRate:1,
    get endTime(){return this.startTime+this.duration;},_applyPosition(){},_audioBuffer:{}};
track.clips.push(clip);
const meta={volume:1,volumePoints:[{source_ms:1000,gain:1},{source_ms:7000,gain:0}]};
const app={_selClip:clip,clipSpeedInput:{value:'2'},_meta:new Map([['a',meta]]),
    _ensureClipMeta:()=>meta,_clipItems:()=>[{kind:'video'}],
    _canChangeClipSpeed:method('_canChangeClipSpeed'), _recordUndo(){undo++;},
    _rememberResourceTiming(){},_ensureTimelineLength(){},_decorateClip(){},
    _updateClipInfoPanel(){},_refreshTimelineDuration(){},_saveToWidgets(){saved++;},
    _scheduleProgramPreview(){},_timeline:{_playing:false,currentTime:3}};
const change=method('_onClipSpeedChange');
change.call(app);
assert.deepEqual([clip.startTime,clip.duration,clip.playbackRate,clip.sourceOffset],[2,3,2,1]);
assert.equal(clip.sourceOffset+clip.duration*clip.playbackRate,7);
assert.deepEqual([undo,saved],[1,1]);
track.clips.push({startTime:8,endTime:10});
app.clipSpeedInput.value='0.5';
change.call(app);
assert.deepEqual([clip.duration,clip.playbackRate,warned,undo],[3,2,1,1]);
track.clips.pop();
change.call({...app,clipSpeedInput:{value:'0.5'}});
assert.deepEqual([clip.duration,clip.playbackRate],[12,0.5]);
track.locked=true;
change.call({...app,clipSpeedInput:{value:'4'}});
assert.equal(clip.playbackRate,0.5);
track.locked=false;
track.type='image';
assert(!app._canChangeClipSpeed(clip), 'director clips excluded');
track.type='video';
assert(app._canChangeClipSpeed(clip));
assert(!app._canChangeClipSpeed.call({...app,_clipItems:()=>[{kind:'image'}]},clip));

// Source offsets and BufferSource duration use source seconds, not timeline seconds.
track.type='audio';
clip.duration=3; clip.playbackRate=2;
let startArgs, scheduledRate, envelope;
const ctx={currentTime:10,destination:{},createGain:()=>({connect(){},gain:{setValueAtTime(){}}}),
    createBufferSource:()=>({playbackRate:{set value(v){scheduledRate=v;}},connect(){},start(...args){startArgs=args;}})};
Object.assign(app,{_stopAudioPlayback(){},_ensurePlaybackContext:()=>ctx,_collectAudibleClips:()=>[clip],
    _scheduleGeneratedVideoWebAudio(){},_scheduleAudioFadeGain(...args){envelope=args;}});
method('_startAudioPlayback').call(app);
assert.equal(scheduledRate,2);
assert.deepEqual(startArgs.slice(1),[3,4]);
assert.equal(envelope.at(-1),2);

// Waveform keeps the original trimmed source range when the clip changes length.
const clipSource=readFileSync(new URL('../js/timeline/Clip.js',import.meta.url),'utf8');
const peaks=method('_visibleWavePeaks',{clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),MIN_DURATION:0.05},clipSource,'  ');
const wave={_waveform:Array.from({length:100},(_,i)=>i),sourceDuration:10,sourceOffset:1,duration:3,playbackRate:2};
assert.deepEqual(peaks.call(wave,100),Array.from({length:60},(_,i)=>i+10));
assert(source.includes('playbackRate: snap.playbackRate || 1'));
assert(source.includes('normalizePlaybackRate(c.playback_rate)'));
assert(source.includes('sourceOffset: sourceOffset + leftDur * (clip.playbackRate || 1)'));
assert(source.includes('{ playback_rate: clip.playbackRate || 1 }'));
console.log('Clip speed: scope, duration, source range, locks, overlap, audio clock and waveform passed');
