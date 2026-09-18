import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const start=source.indexOf('    _showClipCtxMenu('), end=source.indexOf('\n    }',start)+6;
const show=new Function('T','isVoiceoverClipMeta','isSubtitleClipMeta','isMediaTrackType',
    'return ({'+source.slice(start,end)+'})._showClipCtxMenu;')(x=>x,(m,t)=>t.type==='voiceover',(m,t)=>t.type==='subtitle',t=>t==='media');
function menu(type,{running=false,output=true,audio=true}={}){
 const clip={id:'a',track:{type},src:'audio.wav',hasAudio:audio,startTime:0,endTime:5};
 const meta={clipType:type,generatedVideos:output?[{}]:[]};
 const app={_meta:new Map([['a',meta]]),_timeline:{getSelectedClips:()=>[clip],currentTime:2},
 _clipDenoiseSources:()=>audio?[{}]:[],_firstEnabledGeneratedAudio:()=>output?{}:null,
 _firstEnabledGeneratedVideo:()=>output?{}:null,_clipItems:()=>output?[{kind:'video'}]:[],
 _clipGeneratedVideos:()=>meta.generatedVideos,_clipRunState:()=>running?'running':'idle',
 _buildCtxMenu:items=>{app.items=items;}};
 show.call(app,clip,{clientX:0,clientY:0});return app.items;
}
for(const type of ['director','media','audio','voiceover','subtitle'])for(const output of [true,false]){
 const items=menu(type,{output});
 assert(!items[0].separator&&!items.at(-1).separator);
 assert(!items.some((r,i)=>r.separator&&items[i+1]?.separator));
 const labels=items.filter(r=>!r.separator).map(r=>r.label);
 assert.equal(new Set(labels).size,labels.length,'no duplicate actions');
 assert.equal(labels.at(-1),'delete_btn');
 assert(labels.includes('menu_copy_shortcut')&&labels.includes('menu_paste_shortcut'));
 assert(items.filter(r=>r.separator).length>=3);
 assert.equal(items.find(r=>r.label==='menu_group_clips').disabled,true);
 assert.equal(labels.includes('clip_export_title'),type==='audio'||output&&type!=='subtitle');
}
const director=menu('director');
assert.equal(director[0].label,'menu_run');
assert.equal(menu('director',{running:true})[0].label,'menu_abort');
const groups=[];let group=[];
for(const item of director){if(item.separator){groups.push(group);group=[];}else group.push(item.label);}groups.push(group);
assert.deepEqual(groups[0],['menu_run','run_track_right_menu','run_track_left_menu','menu_ai_optimize_prompt']);
assert.deepEqual(groups[1],['insert_clip_title','menu_split','menu_copy_shortcut','menu_paste_shortcut','menu_set_title']);
assert(groups[2].includes('menu_trim_video')&&groups[2].includes('clear_clip_video_links'));
assert(groups[3].includes('local_audio_denoise')&&groups[3].includes('voice_convert'));
console.log('Clip menu groups: all clip types, availability, running state, ordering and separators passed');

