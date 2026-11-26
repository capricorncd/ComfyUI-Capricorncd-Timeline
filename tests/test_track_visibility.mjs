import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {activePortraitFilters} from '../js/editor/PortraitFilters.js';
import {selectedClipProject} from '../js/editor/SelectedClipProject.js';
import {applyContinuationSettings} from '../js/editor/ClipContinuation.js';

const source=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name,deps={}) {
    const start=source.indexOf(`    ${name}(`);
    assert(start>=0,name);
    return new Function(...Object.keys(deps),`return ({${source.slice(start,source.indexOf('\n    }',start)+6)}}).${name}`)(...Object.values(deps));
}
const document={createElement(){return {attributes:{},handlers:{},classList:{add(){},toggle(){}},
    setAttribute(k,v){this.attributes[k]=v;},addEventListener(k,v){this.handlers[k]=v;}};}};
const eye=method('_makeTrackSlot',{document,ICONS:{eye:'eye',eyeOff:'off'},T:k=>k});
for(const type of ['subtitle','director','media','video','image','filter']) {
    const track={id:type,type,visible:true,setVisible(v){this.visible=v;}};
    const app={_trackInfo:new Map([[type,{enabled:false}]]),_recordUndo(){},_decorateAllClips(){},_scheduleProgramPreview(){}};
    const button=eye.call(app,track,'visible');
    assert.equal(button.innerHTML,'eye');
    button.handlers.click({stopPropagation(){}});assert.equal(track.visible,false);
    button.handlers.click({stopPropagation(){}});assert.equal(track.visible,true);
}
// Toggling the eye during playback must rebuild already-scheduled audio.
for (const type of ['video', 'media', 'image', 'director']) {
    for (const muted of [false, true]) {
        const clip = {id: 'video', hasAudio: true, _audioBuffer: {}};
        const track = {id: type, type, visible: true, muted, clips: [clip],
            setVisible(value) { this.visible = value; }};
        const app = {_timeline: {_playing: true, tracks: [track]}, _meta: new Map(),
            _recordUndo() {}, _decorateAllClips() {}, _scheduleProgramPreview() {},
            _clipUsesGeneratedPreview: () => false, _clipItems: () => [],
            _collectAudibleClips: method('_collectAudibleClips', {isDirectorTrackType: t => ['director', 'image'].includes(t)})};
        let audible, restarts = 0;
        app._startAudioPlayback = () => { audible = app._collectAudibleClips(); restarts++; };
        const button = eye.call(app, track, 'visible');
        button.handlers.click({stopPropagation() {}});
        assert.deepEqual(audible, [], 'hidden track stops its scheduled sound');
        assert.equal(track.muted, muted, 'visibility does not overwrite mute choice');
        button.handlers.click({stopPropagation() {}});
        assert.equal(audible.length, muted ? 0 : 1, 'show restores the original mute choice');
        assert.equal(restarts, 2);
    }
}
const clip={id:'en',startTime:0,endTime:2};
const track={id:'english',type:'subtitle',visible:true,clips:[clip]};
const meta={text:'Try a little',disabled:false};
let painted=[];
const editor={_allTextTracks:()=>[track],_meta:new Map([[clip.id,meta]]),
    _trackInfo:new Map([[track.id,{enabled:false,subtitleStyle:{fontSize:24}}]]),
    _paintSubtitle:(ctx,w,h,m)=>painted.push(m)};
const draw=method('_drawSubtitleOverlays',{defaultSubtitleMeta:()=>({}),pickSubtitleStyle:s=>s});
const has=method('_hasVisibleSubtitleAt',{defaultSubtitleMeta:()=>({})});
draw.call(editor,{},1376,768,1);assert.equal(painted.length,1);assert.equal(painted[0].fontSize,24);
assert.equal(has.call(editor,1),true);
for(const [visible,disabled] of [[false,false],[true,true]]) {
    track.visible=visible;meta.disabled=disabled;painted=[];
    draw.call(editor,{},1376,768,1);assert.equal(painted.length,0);assert.equal(has.call(editor,1),false);
}
const filter={id:'filter',type:'filter',visible:true,enabled:false,clips:[clip]};
assert.equal(activePortraitFilters([filter],new Map([[clip.id,{filterStrength:1}]]),1).length,1);
filter.visible=false;assert.equal(activePortraitFilters([filter],new Map([[clip.id,{filterStrength:1}]]),1).length,0);
const project={settings:{fps:24},media:[],tracks:[
    {id:'visual',type:'director',enabled:false,visible:true,clips:[{id:'v',start_ms:0,duration_ms:2000,use_audio_track_audio:true}]},
    {id:'audio',type:'audio',enabled:false,visible:false,muted:false,clips:[{id:'a',start_ms:0,duration_ms:2000}]},
]};
const selected=selectedClipProject(project,['v'],'Selection');
assert.deepEqual(selected.tracks.map(t=>t.id),['visual','audio']);
assert(selected.tracks.every(t=>!Object.hasOwn(t,'enabled')));
assert.equal(project.tracks[0].enabled,false,'source is read-only');
project.tracks[1].muted=true;
assert.equal(selectedClipProject(project,['v'],'Selection').tracks.length,1);
const continuation={type:'director',enabled:false,visible:true,clips:[
    {id:'a',start_ms:0,duration_ms:1000},{id:'b',start_ms:1000,duration_ms:1000,reference_previous:true}]};
applyContinuationSettings([continuation]);assert.equal(continuation.clips[0].save_latent,true);

const migrate=method('_migrateProjectDocument',{parseSchemaVersion:()=>4,migrateProjectSettingPrompts(){},T:k=>k,promptIncludesFromClipJson:()=>[]});
const migrated=migrate.call({_loadMediaStarsForDir(){},_hydrateMediaCatalog(){},_currentSchemaVersion:()=>4,_currentVersion:()=> 'test'},project);
assert(migrated.tracks.every(t=>!Object.hasOwn(t,'enabled')));
assert.equal(migrated.tracks[1].visible,false);assert.equal(migrated.tracks[1].muted,true);
console.log('PASS: visual visibility, subtitle drawing, audio mute, continuation and legacy cleanup');
