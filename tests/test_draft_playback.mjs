import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const method=name=>{
 const start=source.indexOf(`    ${name}(`);
 return new Function('isDirectorTrackType','isMediaTrackType','normalizePlaybackRate','defaultImageMeta',`return ({${source.slice(start,source.indexOf('\n    }',start)+6)}}).${name}`)(t=>t==='director',t=>t==='media',v=>Number(v)||1,()=>({}));
};
const clips=[0,1,2].map(i=>({id:String(i),startTime:i*4,endTime:(i+1)*4,duration:4}));
const track={id:'director',type:'director',clips};
clips.forEach(c=>c.track=track);
const meta=new Map(clips.map((c,i)=>[c.id,{h3Drafts:[{id:'disabled',file:'disabled.mp4',enabled:false},{id:'new'+i,file:`preview${i}.mp4`,frames:240,fps:24},{id:'old',file:'old.mp4'}],generatedVideos:[{id:'final',file:'final.mp4',duration_sec:4}],previewMode:'generated'}]));
const app={_draftPreviewMode:true,_meta:meta,_trackInfo:new Map(),_allRenderableTracks:()=>[track],_allImageTracks:()=>[track],_clipGeneratedVideos:m=>m.generatedVideos,_clipUsesGeneratedPreview:m=>m.previewMode==='generated',_genEffectiveDurationSec:g=>(g.trim_out_sec ?? g.duration_sec)-(g.trim_in_sec || 0),_normalizeGenEditAudioDraft:()=>[]};
for(const name of ['_draftPreviewVideos','_collectPreviewLayers','_collectGeneratedVideoAudioJobs','_toggleDraftPreview']) app[name]=method(name);
for(const t of [0,3.99,4,7.99,8,11.99]) {
 const layers=app._collectPreviewLayers(t); assert.equal(layers.length,1);
 assert.equal(layers[0].file,`preview${Math.floor(t/4)}.mp4`);
 assert.equal(layers[0].transform.trim_out_sec,4);
 assert.equal(layers[0].muted,true);
}
assert.deepEqual(app._collectPreviewLayers(12),[],'preview never extends Clip');
assert.equal(app._collectPreviewLayers(1,clips[0])[0].file,'final.mp4','Clip inspection remains separate');
assert.deepEqual(app._collectGeneratedVideoAudioJobs(0),[],'no finished-video audio during draft playback');
meta.get('1').h3Drafts=[];
assert.equal(app._collectPreviewLayers(5)[0].kind,'package','missing draft does not use final video');
let refresh=0,audio=0; app._timeline={_playing:true}; app._updateEditModeToolbar=()=>{}; app._scheduleProgramPreview=()=>refresh++; app._startAudioPlayback=()=>audio++;
const before=JSON.stringify([...meta]);
app._toggleDraftPreview();
assert.equal(app._collectPreviewLayers(1)[0].file,'final.mp4');
assert.equal(JSON.stringify([...meta]),before,'mode does not alter saved video associations');
assert.equal(refresh,1);assert.equal(audio,1);
console.log('PASS: draft timeline mode, consecutive Clips, duration caps, latest enabled version, missing versions, audio isolation and restore');

const segment=(id,start,end)=>({id,file:id+'.mp4',frames:70,fps:24,keyframe_segment:{start_frame:start,end_frame:end,fps:24,trim_frames:10,output_fps:24}});
const pieces=app._draftPreviewVideos({h3Drafts:[segment('new',48,96),segment('old',48,96),segment('first',0,48)]},clips[0]);
assert.equal(pieces.length,2);
assert.deepEqual(pieces.map(row=>row.file),['new.mp4','first.mp4']);
assert.equal(pieces[0].edit_start_sec,2);
assert.equal(pieces[0].trim_in_sec,10/24);
assert(Math.abs(pieces[0].trim_out_sec-pieces[0].trim_in_sec-2)<1e-9);
