import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
    if(specifier.includes('i18n/timeline_widget.js'))return {url:'data:text/javascript,export const t=key=>key;',shortCircuit:true};
    return next(specifier,context);
}});
const {normalizeVolumePoints}=await import('../js/timeline/AudioEnvelope.js');
const normalizePlaybackRate=value=>Number(value) || 1;
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name){
    const start=source.indexOf(`    ${name}(`);
    return new Function('T','genAudioUid','normalizeVolumePoints','normalizePlaybackRate','normalizeClipVolume',
        `return ({${source.slice(start,source.indexOf('\n    }',start)+6)}}).${name}`)(key=>key,()=> 'audio-id',normalizeVolumePoints,normalizePlaybackRate,v=>Number(v ?? 1));
}
const pull=method('_pullGenEditDraftFromTimeline'), setup=method('_setupGenEditTrackDeleteMenu');
const trackSource=readFileSync(new URL('../js/timeline/Track.js',import.meta.url),'utf8');
const start=trackSource.indexOf('  arrangeClips() {');
const arrange=new Function('return ({'+trackSource.slice(start,trackSource.indexOf('\n  }',start)+4)+'}).arrangeClips')();
for(const type of ['image','audio']){
    const listeners={},icon={style:{},getBoundingClientRect:()=>({right:0,top:0}),addEventListener:(name,fn)=>listeners[name]=fn};
    const clips=[4,12].map((startTime,index)=>({id:'c'+index,src:'test.mp4',startTime,duration:2,sourceOffset:3,sourceDuration:10,playbackRate:2,get endTime(){return this.startTime+this.duration;},_applyPosition(){}}));
    const track={type,id:'t',autoArrange:false,visible:true,clips,arrangeClips:arrange,
        headerEl:{querySelector:()=>icon,addEventListener:(name,fn)=>listeners[name]=fn}};
    const rows=clips.map((c,index)=>({id:'r'+index,file:'test.mp4',edit_start_sec:c.startTime}));
    const timeline={tracks:[track],pause(){},_refresh(){}};
    const st={timeline,clipMap:new Map(clips.map((c,index)=>[c.id,'r'+index])),audioMap:new Map(clips.map((c,index)=>[c.id,'r'+index])),
        draft:type==='image'?rows:[],audioDraft:type==='audio'?rows:[]};
    let items,saved=0;
    const app={_genEditState:st,_setupTrackHeaderHover(){},_buildCtxMenu(list){items=list;return {dataset:{},addEventListener(){}};},
        _pullGenEditDraftFromTimeline:pull,_applyGenEditChanges(){saved++;},_syncGenEditOutOfBoundsUI(){},_syncGenEditInspector(){},_scheduleGenEditPreview(){}};
    setup.call(app,track);listeners.mouseenter();
    assert.equal(items[0].label,'auto_arrange_track');items[0].fn();
    assert.deepEqual(clips.map(c=>c.startTime),[0,2]);
    const result=type==='image'?st.draft:st.audioDraft;
    assert(result.every(row=>row.auto_arrange));assert.deepEqual(result.map(row=>row.edit_start_sec),[0,2]);
    assert.equal(saved,1);assert(clips.every(c=>c.sourceOffset===3 && c.playbackRate===2));
    track.locked=true;items[0].fn();assert.equal(saved,1);
}
console.log('Child video/audio automatic arrangement: menu, zero start, persistence, source timing and locks passed');
