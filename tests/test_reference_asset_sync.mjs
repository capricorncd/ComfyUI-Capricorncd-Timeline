import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    return new Function('return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)();
}
const first = {id:'first', kind:'video', file:'first.mp4'};
const clip = {id:'clip', track:{type:'director'}, duration:5};
const original = {id:'ref_first', media_id:'first', muted:true, trim_in_sec:2};
const meta = {items:[first], referenceTimeline:{videos:[original], audios:[], per_track:true}};
let undos = 0;
const app = {
    _ensureClipMeta:()=>meta, _normalizeVisualMeta:()=>{},
    _ensureMedia:(kind,file)=>({id:file,kind,file,location:'output'}),
    _meta:new Map(), _clipItems:()=>meta.items,
    _recordUndo:()=>undos++, _clipPreviewItemIndex:()=>0,
    _setClipPreviewItemIndex:()=>{}, _syncClipPrimaryAppearance:()=>{},
    _renderMediaGrid:()=>{}, _saveToWidgets:()=>{},
    _refreshClipResourceViews:()=>{}, _scheduleProgramPreview:()=>{},
};
method('_insertItemIntoClip').call(app,clip,'second.mp4','video');
assert.equal(meta.referenceTimeline.videos.length,2);
assert.equal(meta.referenceTimeline.videos[0],original);
assert.equal(original.muted,true);
assert.equal(original.trim_in_sec,2);
assert.equal(meta.referenceTimeline.videos[1].location,'output');
method('_insertItemIntoClip').call(app,clip,'second.mp4','video');
assert.equal(meta.referenceTimeline.videos.length,2,'same asset does not duplicate child references');
method('_removeClipItemNow').call(app,clip,'first',0);
assert.deepEqual(meta.referenceTimeline.videos.map(row=>row.media_id),['second.mp4']);
assert.equal(meta.referenceTimeline.per_track,true);
clip.track.locked=true;
method('_removeClipItemNow').call(app,clip,'second.mp4',0);
assert.equal(meta.referenceTimeline.videos.length,1);
assert.equal(undos,3,'each permitted edit has one undo snapshot');
console.log('Reference asset sync: repeated add, removal, existing edits and track locking passed');
