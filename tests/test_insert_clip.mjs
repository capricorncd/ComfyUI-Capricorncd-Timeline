import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const start=source.indexOf('    _insertAdjacentClip(');
const insert=new Function('defaultAudioMeta','defaultVoiceoverMeta','defaultSubtitleMeta','defaultImageMeta','isVoiceoverTrackType','isSubtitleTrackType','isMediaTrackType','pickSubtitleStyle', 'return ({'+source.slice(start,source.indexOf('\n    }',start)+6)+'})._insertAdjacentClip;')(
 ()=>({clipType:'audio'}),()=>({clipType:'voiceover'}),()=>({clipType:'subtitle'}),()=>({clipType:'image'}),t=>t==='voiceover',t=>t==='text',t=>t==='video',s=>s||{});
for(const type of ['image','video','audio','text','voiceover']) for(const before of [false,true]) for(const copy of [false,true]) {
 const track={id:'track',type,color:'blue',clips:[]};
 const make=(id,startTime,duration)=>({id,startTime,duration,track,get endTime(){return this.startTime+this.duration;},_applyPosition(){}});
 const earlier=make('earlier',0,1), target=make('source',2,3), later=make('later',7,2);
 track.clips=[earlier,target,later];
 const originalMeta={prompt:'original',items:[{id:'asset'}],volumePoints:[{gain:1}],generatedAudios:[{file:'test.wav'}]};
 let undo=0,saved=0;
 const app={_timeline:{fps:24,addClip:(id,data)=>{const clip=Object.assign(make('new',data.startTime,data.duration),data);track.clips.push(clip);return clip;},selectClip:clip=>app.selected=clip},
 _findClipById:id=>track.clips.find(clip=>clip.id===id),_recordUndo:()=>undo++, _rememberResourceTiming(){},_ensureTimelineLength(){},_trackIndex:()=>0,_trackInfo:new Map(),_meta:new Map(),
 _snapshotClip:()=>({name:'Copied',src:'test.wav',sourceDuration:10,sourceOffset:1,playbackRate:1,fadeIn:0,fadeOut:0,meta:originalMeta}),
 _decorateClip(){},_refreshTimelineDuration(){},_updatePromptPanel(){},_saveToWidgets:()=>saved++,_scheduleProgramPreview(){}};
 assert.equal(insert.call(app,target,{before,copy,duration:5}),true);
 assert.equal(app.selected.startTime,before?2:5);
 assert.equal(target.startTime,before?7:2);
 assert.equal(later.startTime,12);
 assert.equal(earlier.startTime,0);
 assert.equal(undo,1);assert.equal(saved,1);
 const meta=app._meta.get('new');
 if(copy){assert.equal(app.selected.src,'test.wav');meta.items[0].id='changed';meta.volumePoints[0].gain=0;assert.equal(originalMeta.items[0].id,'asset');assert.equal(originalMeta.volumePoints[0].gain,1);}
 else {assert.equal(app.selected.src,'');assert.equal(meta.clipType,type==='video'?'media':type==='text'?'subtitle':type);}
 track.locked=true;
 assert.equal(insert.call(app,target,{duration:5}),false);
}
console.log('Insert Clip: before/after, blank/copy, five track types, ripple timing, independent metadata and locks passed');
