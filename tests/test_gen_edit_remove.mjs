import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
  const start = source.indexOf('    ' + name + '(');
  const end = source.indexOf('\n    }', start) + 6;
  assert(start >= 0);
  return new Function('T', 'iconHtml', 'ICONS',
    'return ({' + source.slice(start,end) + '}).' + name)(key=>key, name=>name, {});
}
class Element {
  constructor() { this.handlers={}; this.children=[]; this.dataset={}; this.style={}; this.classList={toggle(){},add(){}}; }
  replaceChildren() { this.children=[]; }
  append(...children) { this.children.push(...children); }
  addEventListener(name,fn) { this.handlers[name]=fn; }
  querySelector() { return this.icon; }
  getBoundingClientRect() { return {right:50,top:20}; }
}
globalThis.document={createElement:()=>new Element()};
function fixture() {
  const tracks=['image','image','audio'].map(type=>({type,locked:false,visible:true,muted:false,
    actionsEl:new Element(),headerEl:new Element(),setLocked(value){this.locked=value;}}));
  tracks.forEach(t=>{t.headerEl.icon=new Element();});
  const clips=tracks.map((track,i)=>({id:`ui${i}`,name:`file${i}`,track}));
  tracks.forEach((track,i)=>{track.clips=[clips[i]];});
  const st={draft:[{id:'g0'},{id:'g1'}],audioDraft:[{id:'a2',from_gen_id:'g0'}],selectedId:'g0',
    clipMap:new Map([['ui0','g0'],['ui1','g1']]),audioMap:new Map([['ui2','a2']]),
    timeline:{tracks,currentTime:2.5,pause(){},setCurrentTime(t){this.currentTime=t;}}};
  const app={_genEditState:st,_deleteGenEditClips:method('_deleteGenEditClips'),
    _setupGenEditTrackDeleteMenu:method('_setupGenEditTrackDeleteMenu'),
    _openDeleteConfirm(message,fn){this.message=message;this.confirm=fn;},
    _buildCtxMenu(items){this.menu=items; return new Element();},
    _pullGenEditDraftFromTimeline(){}, _removeCtxMenu(){}, _scheduleTrackTypeMenuHide(){},
    _applyGenEditChanges(){this.saved=true;}, _buildGenEditTimeline(){this.rebuilt=true;},
    _syncGenEditInspector(){}, _scheduleGenEditPreview(){},_closeGenEditModal(){this.closed=true;},
  };
  return {app,st,tracks,clips};
}
{
  const {app,st,tracks,clips}=fixture();
  method('_setupGenEditTrackControls').call(app,tracks[0],'g0');
  assert.equal(tracks[0].actionsEl.children.length,3,'no clipped trash button');
  tracks[0].headerEl.icon.handlers.mouseenter();
  assert.equal(app.menu[0].label,'delete_track_menu');
  app.menu[0].fn();
  assert.equal(app.message,'gen_edit_confirm_delete');
  assert.equal(st.draft.length,2,'wait for confirmation');
  tracks[0].setLocked(true);app.confirm();
  assert.equal(st.draft.length,2,'lock also protects a pending confirmation');
  tracks[0].headerEl.icon.handlers.mouseenter();assert.equal(app.menu[0].disabled,true);
  tracks[0].setLocked(false);
  app._deleteGenEditClips([clips[0]]);app.confirm();
  assert.deepEqual(st.draft,[{id:'g1'}]);
  assert.equal(st.audioDraft.length,1,'keep audio already separated onto another track');
  assert(app.saved && app.rebuilt);assert.equal(st.timeline.currentTime,2.5);assert(!app.closed);
}
{
  const {app,st,tracks}=fixture();
  method('_setupGenEditAudioTrackControls').call(app,tracks[2]);
  assert.equal(tracks[2].actionsEl.children.length,3);
  tracks[2].headerEl.icon.handlers.mouseenter();app.menu[0].fn();app.confirm();
  assert.equal(st.audioDraft.length,0);assert.equal(st.draft.length,2);
  assert(app.rebuilt,'empty audio track is omitted when rebuilding');
}
{
  const {app,st,tracks,clips}=fixture();
  const mutedClasses=new Set();
  clips[2].el={classList:{toggle(name,on){if(on) mutedClasses.add(name); else mutedClasses.delete(name);}}};
  tracks[2].setMuted=function(value){this.muted=value;};
  method('_setupGenEditAudioTrackControls').call(app,tracks[2]);
  const mute=tracks[2].actionsEl.children[2];
  mute.handlers.click({stopPropagation(){}});
  assert.equal(st.audioDraft[0].muted,true);
  assert(mutedClasses.has('cat-te-clip-muted'),'mute uses the main timeline grayscale class');
  mute.handlers.click({stopPropagation(){}});
  assert.equal(st.audioDraft[0].muted,false);
  assert(!mutedClasses.has('cat-te-clip-muted'),'unmute restores the clip color');
  assert.match(source,/c\.el\.classList\.toggle\("cat-te-clip-muted", aTrack\.muted \|\| row\.muted === true\)/,
    'rebuilding the dialog preserves muted styling');
}
{
  const {app,st,tracks,clips}=fixture();
  tracks[1].locked=true;app._deleteGenEditClips(clips);app.confirm();
  assert.deepEqual(st.draft,[{id:'g1'}],'mixed selection skips locked tracks');
  assert.equal(st.audioDraft.length,0);
}
{
  const {app,st,clips}=fixture();app._deleteGenEditClips(clips);app.confirm();
  assert.equal(st.draft.length,0);assert.equal(st.audioDraft.length,0);assert(app.closed);
}
{
  const {app,st,clips}=fixture();app._deleteGenEditClips(clips);
  app._genEditState={};app.confirm();assert.equal(st.draft.length,2,'ignore stale confirmation');
}
assert.match(source,/tl.on\("clip:delete", \(\{ clips \}\) => this\._deleteGenEditClips\(clips\)\)/);
assert.match(source,/if \(!tl.getSelectedClips\(\).includes\(c\)\) tl.selectClip\(c\)/);
let menuVisible=true;
const closeApp={
  _overlay:{querySelector:()=>menuVisible?{remove(){menuVisible=false;}}:null},
  _fontPicker:{close:()=>false},_removeCtxMenu:method('_removeCtxMenu'),
  _destroyGenEditTimeline(){assert.equal(menuVisible,false);},_genEditState:{},
  _timeline:{_keyboardSuspended:true},genEditModal:{hidden:false},_scheduleProgramPreview(){},
};
method('_closeGenEditModal').call(closeApp);
assert.equal(menuVisible,false);assert.equal(closeApp._genEditState,null);
assert.equal(closeApp._timeline._keyboardSuspended,false);
console.log('Gen-edit deletion: hover menus, selection, confirmation, locks, empty tracks and stale sessions passed');
