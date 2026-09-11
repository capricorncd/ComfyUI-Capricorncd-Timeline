import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    const end = source.indexOf('\n    }', start) + 6;
    return new Function('T', 'isSubtitleTrackType', 'defaultSubtitleMeta', 'pickSubtitleStyle',
        `return ({${source.slice(start, end)}}).${name}`)(
        key=>key, type=>['text','subtitle'].includes(type), index=>({trackIndex:index}), style=>style || {});
}
const insert = method('_insertSubtitleBatch');
const menuAction = source.match(/fn: \(\) => this\._openSubtitleBatchDialog\(track, ([^)]+)\)/);
assert(menuAction);
let insertion;
new Function('track', 'tl', `this._openSubtitleBatchDialog(track, ${menuAction[1]});`).call(
    {_openSubtitleBatchDialog:(track, at)=>{insertion=[track,at];}}, 'sub', {currentTime:12.75});
assert.deepEqual(insertion,['sub',12.75], 'menu uses the playhead, not the right-click position');
function fixture() {
    const track = {id:'sub',type:'text',locked:false,clips:[],color:'#abc'};
    const calls = {undo:0,save:0,preview:0};
    const app = {
        _meta:new Map(), _trackInfo:new Map([['sub',{subtitleStyle:{fontSize:42,offsetY:5}}]]),
        _trackIndex:()=>2, _recordUndo(){calls.undo++;},
        _trackHasRoom:method('_trackHasRoom'), _ensureTimelineLength:end=>{calls.end=end;},
        _decorateClip(){}, _refreshTimelineDuration(){}, _saveToWidgets(){calls.save++;},
        _scheduleProgramPreview(){calls.preview++;},
        _timeline:{tracks:[track], currentTime:7.25, addClip(id, data){
            assert.equal(id, track.id);
            const clip = {...data,id:`s${track.clips.length}`,endTime:data.startTime+data.duration};
            track.clips.push(clip); return clip;
        }, selectClip:clip=>{calls.selected=clip;},setCurrentTime(t){calls.seek=t; this.currentTime=t;}},
    };
    return {app,track,calls};
}
{
    const {app,track,calls} = fixture();
    assert.equal(insert.call(app, track, 1.25, '\r\n \n第一行\r\n第二行\n\n第三行\n \n\t\n第四行\n\n'), '');
    assert.deepEqual(track.clips.map(c=>[c.startTime,c.duration]), [[1.25,3],[4.25,3],[8.25,3],[13.25,3]]);
    assert.deepEqual([...app._meta.values()].map(m=>m.text), ['第一行','第二行','第三行','第四行']);
    assert([...app._meta.values()].every(m=>m.fontSize===42 && m.offsetY===5));
    assert.deepEqual([calls.undo,calls.save,calls.preview,calls.end], [1,1,1,16.25]);
    assert.equal(calls.seek,undefined, 'batch insertion must not seek to its first subtitle');
    assert.equal(app._timeline.currentTime,7.25);
}
for (const text of ['', '\r\n  \n\t']) {
    const {app,track,calls} = fixture();
    assert.equal(insert.call(app, track, 0, text), 'subtitle_batch_empty');
    assert.equal(calls.undo,0);
    assert.equal(track.clips.length,0);
}
{
    const {app,track,calls} = fixture();
    track.clips.push({startTime:4,endTime:6});
    assert.equal(insert.call(app, track, 0, 'one\ntwo'), 'subtitle_batch_overlap');
    assert.equal(track.clips.length,1, 'no partial inserts before a conflict');
    assert.equal(calls.undo,0);
    // Existing clips in blank-line gaps are preserved.
    track.clips[0] = {startTime:3,endTime:4};
    assert.equal(insert.call(app, track, 0, 'one\n\ntwo'), '');
    assert.equal(track.clips.length,3);
}
for (const reason of ['locked','removed','wrong type']) {
    const {app,track,calls} = fixture();
    if (reason==='locked') track.locked=true;
    if (reason==='removed') app._timeline.tracks=[];
    if (reason==='wrong type') track.type='audio';
    assert.equal(insert.call(app, track, 0, 'text'), 'subtitle_batch_unavailable');
    assert.equal(calls.undo,0);
}
assert(!source.includes('_pasteSubtitleText'), 'do not restore the reverted Ctrl+V feature');
{
    const {app,track,calls} = fixture();
    const reference = {id:'ref',type:'subtitle',name:'中文',locked:true,clips:[
        {startTime:8.75,duration:1.25}, {startTime:1,duration:3},
        {startTime:4.5,duration:2.125}, {startTime:12,duration:4},
    ]};
    app._timeline.tracks.push(reference);
    const original = JSON.stringify(reference);
    assert.equal(insert.call(app, track, 4, '\n日本語1\n\n日本語2\n', 'ref'), '');
    assert.deepEqual(track.clips.map(c=>[c.startTime,c.duration]), [[4.5,2.125],[8.75,1.25]]);
    assert.deepEqual([...app._meta.values()].map(m=>m.text), ['日本語1','日本語2']);
    assert.equal(calls.end,10);
    assert.equal(calls.undo,1);
    assert.equal(JSON.stringify(reference),original, 'reference order, style and contents are untouched');
    assert([...app._meta.values()].every(m=>m.fontSize===42), 'keep destination styling');
}
for (const reference of [null, {id:'ref',type:'audio',clips:[]}]) {
    const {app,track,calls} = fixture();
    if (reference) app._timeline.tracks.push(reference);
    const error = insert.call(app,track,0,'one\ntwo','ref');
    assert.equal(error, 'subtitle_batch_sync_unavailable');
    assert.equal(track.clips.length,0);
    assert.equal(calls.undo,0);
    assert.equal(insert.call(app,track,0,'one',track.id),'subtitle_batch_sync_unavailable');
}
{
    const {app,track,calls} = fixture();
    app._timeline.tracks.push({id:'ref',type:'text',clips:[{startTime:2,duration:4},{startTime:9,duration:2}]});
    assert.equal(insert.call(app,track,3,'one\ntwo\n\nthree\nfour','ref'),'');
    assert.deepEqual(track.clips.map(c=>[c.startTime,c.duration]), [[2,4],[9,2],[11,3],[14,3]],
        'include subtitle covering seek; extra non-empty lines follow the last match');
    assert.equal(calls.end,17);
    assert.equal(calls.undo,1);
    track.clips=[];
    track.clips.push({startTime:10,endTime:12});
    assert.equal(insert.call(app,track,3,'one\ntwo','ref'),'subtitle_batch_overlap');
    assert.equal(calls.undo,1, 'overlap still rejects the whole batch');
    track.clips=[];
    assert.equal(insert.call(app,track,9,'one','ref'),'');
    assert.equal(track.clips[0].startTime,9, 'include exact insertion boundary');
}
for (const clips of [[], [{startTime:0,duration:3}]]) {
    const {app,track,calls} = fixture();
    app._timeline.tracks.push({id:'ref',type:'text',clips});
    assert.equal(insert.call(app,track,3,'one\n\ntwo','ref'),'');
    assert.deepEqual(track.clips.map(c=>[c.startTime,c.duration]), [[3,3],[6,3]],
        'no remaining references: start at seek, excluding a reference ending exactly there');
    assert.equal(calls.end,9);
}
{
    const {app,track,calls} = fixture();
    app._timeline.tracks.push({id:'ref',type:'text',clips:[{startTime:2,duration:4}]});
    track.clips.push({startTime:8,endTime:9});
    assert.equal(insert.call(app,track,2,'one\ntwo','ref'),'subtitle_batch_overlap');
    assert.equal(track.clips.length,1, 'extra 3-second rows also preserve existing destination subtitles');
    assert.equal(calls.undo,0);
}
assert(source.includes('this._subtitleBatchDialog?.close();'));
for (const at of [3, 7, 12]) {
    const {app,track,calls} = fixture();
    app._timeline.currentTime = at;
    app._timeline.tracks.push({id:'ref',type:'text',clips:[{startTime:2,duration:4},{startTime:9,duration:2}]});
    assert.equal(insert.call(app,track,at,'one\ntwo','ref'),'');
    assert.equal(app._timeline.currentTime,at, 'keep seek inside a reference, in a gap, or after all references');
    assert.equal(calls.seek,undefined);
    assert.equal(calls.selected,track.clips[0], 'still select the first inserted subtitle');
}
console.log('Batch subtitles: line spacing, defaults, style, overlap, locks and single undo passed');
