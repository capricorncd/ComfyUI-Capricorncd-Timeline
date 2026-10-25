import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/editor/H3DraftVersions.js',import.meta.url),'utf8');
const Manager=new Function('selectedKeyframeRun', source.slice(source.indexOf('export class ')).replace('export class ','return class '))(editor => {
    const point = editor._directorKeyframes.selection.point;
    const points = editor._directorKeyframes.points();
    const index = points.indexOf(point);
    return {keyframe_runs:[{fps:24, intervals:[{
        start_frame:point.time*24, end_frame:(points[index+1]?.time ?? 10)*24,
    }]}]};
});
const a={id:'a',startTime:0}, b={id:'b',startTime:4}, c={id:'c',startTime:8};
const track={type:'image',clips:[c,a,b]}; for(const clip of track.clips) clip.track=track;
const audio={id:'audio',track:{type:'audio'}};
const manager=Object.create(Manager.prototype);
let renders=0,selected,paused=0,shown=0;
manager.dialog={open:true,show(){shown++;this.open=true;},querySelectorAll:()=>[{pause(){paused++;}}]};
manager.editor={_restoreH3DraftHistory:async()=>{},_timeline:{tracks:[track,{type:'audio',clips:[audio]}],selectClip(clip){selected=clip;manager.followSelection(clip);}}};
manager.render=()=>{manager.stop();renders++;};
manager.open(a);manager.previewId='old-version';
manager.step(1);
assert.equal(manager.clipId,'b');assert.equal(selected,b);assert.equal(manager.previewId,null);
assert.equal(renders,2,'selection event and navigation render once');assert.equal(paused,2);
manager.followSelection(c);assert.equal(manager.clipId,'c');
manager.step(1);assert.equal(manager.clipId,'a','last Clip wraps to first');
manager.step(-1);assert.equal(manager.clipId,'c','first Clip wraps to last');
manager.followSelection(audio);assert.equal(manager.clipId,'c');
manager.followSelection(null);assert.equal(manager.clipId,'c');
manager.dialog.open=false;manager.followSelection(b);assert.equal(manager.clipId,'c');assert.equal(shown,0);
console.log('PASS: Clip order, timeline selection sync, circular navigation, preview reset, playback cleanup and closed-dialog guard');

const points=[{time:0},{time:2},{time:5}];
manager.editor.getFps=()=>24;
manager.editor._findClipById=id=>id==='a' ? a : null;
a.duration=10;
manager.editor._directorKeyframes={
    selection:null, target:clip=>({clip,start:0,rate:1,duration:10}),
    points:()=>points,
    select(target,point){this.selection={point}; manager.editor._timeline.selectClip(target.clip);},
};
manager.dialog.open=true; manager.open(a,{start_frame:48,end_frame:120,fps:24});
manager.step(1);
assert.equal(manager.interval.start_frame,120);
assert.equal(manager.editor._directorKeyframes.selection.point,points[2]);
manager.step(1);assert.equal(manager.interval.start_frame,0,'last keyframe wraps to first');
manager.step(-1);assert.equal(manager.interval.start_frame,120,'first keyframe wraps to last');
assert.equal(manager.clipId,'a','keyframe navigation stays on current Clip');
assert.equal(manager.keyframes(a).length,3);
manager.editor._directorKeyframes.target=clip=>({clip,start:10,rate:2,duration:20});
manager.editor._directorKeyframes.points=()=>[{time:9},{time:10},{time:14},{time:20},{time:30}];
assert.deepEqual(manager.keyframes(a).map(row=>row.frame),[0,48,120], 'source-trimmed keyframes map into Clip frames');
manager.editor._directorKeyframes.target=clip=>({clip,start:0,rate:1,duration:10});
manager.editor._directorKeyframes.points=()=>[points[2]];
manager.step(1);assert.equal(manager.interval.start_frame,120,'single keyframe has no other target');
console.log('PASS: keyframe mode loops through current Clip markers, syncs selection and preserves interval scope');

const timeSource=source.slice(source.indexOf('export function draftStartTime'),source.indexOf('export function draftGeneratedTime'));
const time=new Function(timeSource.replace('export function','return function'))();
assert.equal(time({keyframe_segment:{start_frame:24*65+7,fps:24}}),'01:05.07');
assert.equal(time({keyframe_segment:{start_frame:30*60,fps:30}}),'01:00.00');
assert.equal(time({fps:24}),'00:00.00');

const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const restoreSource = appSource.slice(appSource.indexOf('    async _restoreSnapshot(snapshot)'));
const filterSource = restoreSource.slice(restoreSource.indexOf('        for (const track of project.tracks'), restoreSource.indexOf('        this._loadStoryboards'));
const restoreProject = {tracks: [{clips: [{h3_drafts: [{id: 'deleted'}, {id: 'kept'}]}]}]};
new Function('project', filterSource).call({_deletedH3DraftIds: new Set(['deleted'])}, restoreProject);
assert.deepEqual(restoreProject.tracks[0].clips[0].h3_drafts, [{id: 'kept'}]);
assert.deepEqual(restoreProject.tracks[0].clips[0].h3_draft_removed, ['deleted']);
console.log('PASS: restoring history excludes recycled versions and keeps other versions');
const versions = [
    {id: 'whole'},
    {id: 'previous', keyframe_segment: {fps: 24, start_frame: 0, end_frame: 120}},
    {id: 'part1', keyframe_segment: {fps: 24, start_frame: 120, end_frame: 240}},
    {id: 'part2', keyframe_segment: {fps: 24, start_frame: 240, end_frame: 360}},
    {id: 'next', keyframe_segment: {fps: 24, start_frame: 360, end_frame: 480}},
    {id: 'old-range', keyframe_segment: {fps: 24, start_frame: 120, end_frame: 480}},
    {id: 'other-fps', keyframe_segment: {fps: 30, start_frame: 120, end_frame: 240}},
];
manager.editor._ensureClipMeta = () => ({h3Drafts: versions});
assert.deepEqual(manager.rows(a, {fps: 24, start_frame: 120, end_frame: 360}).map(row => row.id), ['part1', 'part2']);
assert.equal(manager.rows(a, null).length, versions.length, 'Clip manager still lists all previews');
console.log('PASS: keyframe manager includes its continuation parts and excludes other intervals, ranges and fps');

const generatedTime = new Function(source.slice(source.indexOf('export function draftGeneratedTime'),
    source.indexOf('export class H3DraftVersions')).replace('export function', 'return function'))();
const renderStart = source.indexOf('    render() {');
const sorted = new Function('draftGeneratedTime', 'clip',
    source.slice(source.indexOf('        const rows =', renderStart), source.indexOf('        const listScroll =', renderStart))
    + 'return {rows, current};');
const unsorted = [
    {id: 'unknown'},
    {id: 'old', source_output: 'CapTimelineEditor/project/20261015-235959_clip_kf1.mp4'},
    {id: 'new', source_output: 'CapTimelineEditor/project/20261016-142540_clip_kf2.mp4', keyframe_segment: {start_frame: 240, fps: 24}},
    {id: 'middle', source_output: 'CapTimelineEditor/project/20261016-134755_clip_kf1.mp4'},
    {id: 'same-time', source_output: 'CapTimelineEditor\\project\\20261016-142540_clip_kf1.mp4'},
];
const owner = {rows: () => unsorted, previewId: null};
let result = sorted.call(owner, generatedTime, a);
assert.deepEqual(result.rows.map(row => row.id), ['new', 'same-time', 'middle', 'old', 'unknown']);
assert.equal(result.current.id, 'new', 'opening defaults to the newest generated preview');
assert.deepEqual(unsorted.map(row => row.id), ['unknown', 'old', 'new', 'middle', 'same-time'], 'display sorting does not mutate saved versions');
owner.previewId = 'old';
assert.equal(sorted.call(owner, generatedTime, a).current.id, 'old', 'refresh preserves the selected preview');
console.log('PASS: previews sort newest first across dates and keyframes, unknown times last, stable ties and selection');
