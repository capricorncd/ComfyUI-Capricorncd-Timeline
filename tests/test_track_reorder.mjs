import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('T','alignmentT','uid','isSubtitleTrackType','isMediaTrackType','isDirectorTrackType','isVoiceoverTrackType',
        `return ({${source.slice(start,end)}}).${name}`)(k=>k,k=>k,()=>crypto.randomUUID(),
        t=>['text','subtitle'].includes(t),t=>['video','media'].includes(t),
        t=>['image','director'].includes(t),t=>t==='voiceover');
}
const makeTrack = (id,type)=>({id,type,el:id,headerEl:`h_${id}`,clips:[{id:`c_${id}`,startTime:2,duration:3}]});
const tracks = [makeTrack('s','text'), makeTrack('a','video'), makeTrack('b','media'),
    makeTrack('d','image'), makeTrack('e','director'), makeTrack('f','audio')];
let undo=0,saved=0,refreshed=0;
let dom=[],headers=[],menu;
const app={_timeline:{tracks,_tracksEl:{appendChild:el=>dom.push(el)},
    _trackHeadersEl:{appendChild:el=>headers.push(el)},_refresh(){refreshed++;}},
    _trackInfo:new Map(tracks.map((t,i)=>[t.id,{trackIndex:i}])),
    _meta:new Map(tracks.map((t,i)=>[t.clips[0].id,{trackIndex:i}])),
    _trackTypeRank:method('_trackTypeRank'),_canMoveTrack:method('_canMoveTrack'),
    _syncTrackOrder:method('_syncTrackOrder'),_moveTrack:method('_moveTrack'),
    _ensureClipMeta(clip){return this._meta.get(clip.id);},_clipGeneratedVideos:()=>[],
    _recordUndo(){undo++;},_syncTrackRoleRefs(){},_scheduleProgramPreview(){},_saveToWidgets(){saved++;},
    _buildCtxMenu:items=>{menu=items;return null;},
};
const before = tracks.flatMap(t=>t.clips.map(c=>[c.id,c.startTime,c.duration]));
const [subtitle,a,b,d,e,audio]=tracks;
assert(!app._canMoveTrack(subtitle,-1));
assert(!app._canMoveTrack(subtitle,1));
assert(!app._canMoveTrack(a,-1));
assert(app._canMoveTrack(a,1));
assert(app._canMoveTrack(b,-1));
assert(!app._canMoveTrack(b,1));
assert(!app._canMoveTrack(audio,1));
assert(!app._canMoveTrack(makeTrack('gone','video'),1));
app._moveTrack(a,1);
assert.deepEqual(tracks.map(t=>t.id),['s','b','a','d','e','f']);
assert.deepEqual(dom,['s','b','a','d','e','f']);
assert.deepEqual(headers,dom.map(id=>`h_${id}`));
tracks.forEach((t,i)=>{
    assert.equal(app._trackInfo.get(t.id).trackIndex,i);
    assert.equal(app._meta.get(t.clips[0].id).trackIndex,i);
});
assert.deepEqual([undo,saved,refreshed],[1,1,1]);
app._moveTrack(a,1);
assert.equal(undo,1, 'do not cross a type boundary');
dom=[];headers=[];
app._moveTrack(a,-1);
assert.deepEqual(tracks.flatMap(t=>t.clips.map(c=>[c.id,c.startTime,c.duration])),before);
assert.deepEqual([undo,saved],[2,2]);
method('_showTrackTypeMenu').call(app,a,{getBoundingClientRect:()=>({right:0,top:0})});
assert.equal(menu.find(item=>item.label==='move_up_title').disabled,true);
assert.equal(menu.find(item=>item.label==='move_down_title').disabled,false);
// A menu can become stale: execution rechecks the current neighbor.
const moveDown=menu.find(item=>item.label==='move_down_title');
tracks.splice(2,1);
moveDown.fn();
assert.equal(undo,2);
console.log('Track reorder: adjacent same-type swaps, DOM/index sync, stable clip timing and menu guards passed');

const sourceTrack = a;
sourceTrack.clips.push({ id: 'another', startTime: 8, duration: 1.25 });
sourceTrack.locked = true;
for (const clip of sourceTrack.clips) {
    clip.groupId = 'source-group';
    clip.waveformPeaks = [0, 1];
    app._meta.set(clip.id, { items: [{ file: 'shot.png' }] });
}
app._timeline.addTrackAt = (data, index) => {
    const track = {
        ...makeTrack('copy', data.type), ...data, clips: [],
        setLocked(value) { this.locked = value; },
        setMuted(value) { this.muted = value; },
        setVisible(value) { this.visible = value; },
        addClip(data) {
            assert(!this.locked);
            const clip = { ...data, id: crypto.randomUUID() };
            this.clips.push(clip);
            return clip;
        },
    };
    tracks.splice(index, 0, track);
    return track;
};
app._duplicateTrack = method('_duplicateTrack');
app._decorateClip = app._renderMediaGrid = () => {};
method('_showTrackTypeMenu').call(app, sourceTrack, { getBoundingClientRect: () => ({right: 0, top: 0}) });
menu.find(item => item.label === 'duplicate_track_menu').fn();
const copy = tracks[tracks.indexOf(sourceTrack) + 1];
assert.equal(copy.locked, true);
assert.deepEqual(copy.clips.map(c => [c.startTime, c.duration]), [[2, 3], [8, 1.25]]);
assert.equal(new Set([...sourceTrack.clips, ...copy.clips].map(c => c.id)).size, 4);
assert.notEqual(copy.clips[0].groupId, sourceTrack.clips[0].groupId);
assert.equal(copy.clips[0].groupId, copy.clips[1].groupId);
app._meta.get(copy.clips[0].id).items[0].file = 'alternate.png';
assert.equal(app._meta.get(sourceTrack.clips[0].id).items[0].file, 'shot.png');
assert.deepEqual([undo, saved], [3, 3], 'one undo and save per track action');
console.log('Track duplication: menu, placement, timings, fresh group/clip IDs and independent edits passed');
