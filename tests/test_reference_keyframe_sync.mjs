import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const text=readFileSync(new URL('../js/editor/ReferenceTimeline.js',import.meta.url),'utf8');
const start=text.indexOf('export function syncReferenceKeyframes');
const sync=new Function(text.slice(start).replace('export ','')+';return syncReferenceKeyframes;')();
const points=[{time:0},{time:4,description:'shot',generation:{seed:123}},{time:9}];
sync(points,10,20,24);
assert.deepEqual(points.map(p=>p.time),[0,8,18]);
assert.equal(points[1].generation.seed,123);
sync(points,20,10,24);
assert.deepEqual(points.map(p=>p.time),[0,4,9]);
const rounded=[{time:1}];sync(rounded,3,4,24);assert.equal(rounded[0].time,32/24);
sync(rounded,4,4,24);assert.equal(rounded[0].time,32/24);

const appSource=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const applyStart=appSource.indexOf('    _applyGenEditChanges() {');
const apply=new Function('return ({'+appSource.slice(applyStart,appSource.indexOf('\n    }',applyStart)+6)+'})._applyGenEditChanges;')();
const resetStart=text.indexOf('    reset.onclick = () => {');
const resetBody=text.slice(resetStart+'    reset.onclick = () => {'.length,text.indexOf('\n    };',resetStart));
const reset=new Function('app','st','syncReferenceKeyframes',resetBody);
const state={reference:true,clipId:'clip',draft:[{id:'v',media_id:'v',enabled:true,edit_start_sec:0,trim_out_sec:10,playback_rate:1}],audioDraft:[],syncKeyframes:false};
const parent={id:'clip',duration:10,track:{locked:false,arrangeClips(){}},_applyPosition(){},get endTime(){return this.duration;}};
const keyframes=[{time:4,description:'shot',generation:{seed:123}},{time:9}];
const meta={video_shots:{source_id:'clip',points:keyframes},referenceTimeline:{videos:structuredClone(state.draft),audios:[],per_track:false}};
let positions=[],saved;
const editor={_genEditState:state,_findClipById:()=>parent,_pullGenEditDraftFromTimeline(){},
    _ensureClipMeta:()=>meta,_normalizeGenEditAudioDraft:rows=>rows,getFps:()=>24,
    _genEffectiveDurationSec:row=>row.trim_out_sec/row.playback_rate,_recordUndo(){},_rememberResourceTiming(){},_ensureTimelineLength(){},
    _refreshTimelineDuration(){},_saveToWidgets(){saved=structuredClone(meta);},_syncSelectedClip(){},_buildGenEditTimeline(){},_scheduleGenEditPreview(){},_scheduleProgramPreview(){},
    _directorKeyframes:{target:()=>({local:true}),sync:clip=>{positions=keyframes.map(p=>100*p.time/clip.duration);},refreshPanel(){}}};
editor._applyGenEditChanges=()=>apply.call(editor);
// Speed changed earlier while sync was off; enabling it later must still work.
state.draft[0].playback_rate=0.5;editor._applyGenEditChanges();
assert.deepEqual(keyframes.map(p=>p.time),[4,9]);assert.equal(parent.duration,10);
state.syncKeyframes=true;reset(editor,state,sync);
assert.equal(parent.duration,20);assert.deepEqual(keyframes.map(p=>p.time),[8,18]);
assert.deepEqual(saved.video_shots.points.map(p=>p.time),[8,18]);assert.deepEqual(positions,[40,90]);
reset(editor,state,sync);assert.deepEqual(keyframes.map(p=>p.time),[8,18]);
editor._directorKeyframes.sync(parent);assert.deepEqual(positions,[40,90]);
// Sync on before a speed edit still waits for the explicit duration update.
state.draft[0].playback_rate=1;editor._applyGenEditChanges();
assert.deepEqual(keyframes.map(p=>p.time),[8,18]);reset(editor,state,sync);
assert.deepEqual(keyframes.map(p=>p.time),[4,9]);assert.equal(keyframes[0].generation.seed,123);
state.syncKeyframes=false;state.draft[0].playback_rate=0.5;reset(editor,state,sync);
assert.equal(parent.duration,20);assert.deepEqual(keyframes.map(p=>p.time),[4,9]);
parent.track.locked=true;state.draft[0].playback_rate=1;reset(editor,state,sync);assert.equal(parent.duration,20);
console.log('PASS: duration ratio, frame rounding, delayed enable, explicit update, persistence, marker refresh, repeat, disabled and locked');
