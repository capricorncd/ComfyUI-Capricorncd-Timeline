import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/editor/H3DraftVersions.js',import.meta.url),'utf8');
const Manager=new Function(source.slice(source.indexOf('export class ')).replace('export class ','return class '))();
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
manager.step(1);assert.equal(manager.clipId,'c');
manager.step(-1);assert.equal(manager.clipId,'b');
manager.followSelection(a);manager.step(-1);assert.equal(manager.clipId,'a');
manager.followSelection(audio);assert.equal(manager.clipId,'a');
manager.followSelection(null);assert.equal(manager.clipId,'a');
manager.dialog.open=false;manager.followSelection(b);assert.equal(manager.clipId,'a');assert.equal(shown,0);
console.log('PASS: Clip order, timeline selection sync, boundary navigation, preview reset, playback cleanup and closed-dialog guard');

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
