import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/editor/H3DraftVersions.js', import.meta.url), 'utf8');
const generatedTime = new Function(source.slice(source.indexOf('export function draftGeneratedTime'), source.indexOf('export class H3DraftVersions')).replace('export function', 'return function'))();
const Manager = new Function('draftT', 'draftGeneratedTime', source.slice(source.indexOf('export class ')).replace('export class ', 'return class '))(key => key, generatedTime);
const clip = {id:'clip', track:{locked:false}};
const row = {id:'candidate', file:'draft/candidate.mp4', source_output:'20261022-002813_clip_kf1.mp4', keyframe_segment:{fps:24,start_frame:120,end_frame:240}};
const meta = {h3Drafts:[],h3DraftRemoved:['candidate']};
let picker, changes = 0;
const manager = Object.create(Manager.prototype);
manager.stop = () => {};
manager.interval = {fps:24,start_frame:120,end_frame:240};
manager.editor = {
    _openGen:1, _findClipById:() => clip, _ensureClipMeta:() => meta,
    _deletedH3DraftIds:new Set(['candidate']),
    _requestH3DraftFiles:async () => ({versions:[row,{...row,id:'other',keyframe_segment:{fps:24,start_frame:0,end_frame:120}}]}),
    _openOutputMediaPicker:(target,kind,config) => {assert.equal(target,clip);assert.equal(kind,'video');picker=config;},
};
manager.change = (apply,id) => {assert.equal(id,clip.id);changes++;apply(meta);};
manager.associate(clip);
const rows = await picker.load();
assert.equal(rows.length,1);
assert.equal(rows[0].mtime, new Date(2026,9,22,0,28,13).getTime()/1000);
assert.equal(changes,0,'browsing must not mutate');
clip.track.locked = true;assert.equal(picker.add(rows[0]),false);
clip.track.locked = false;
assert.equal(picker.add({...rows[0],durationPromise:Promise.resolve(5),duration_sec:5}),true);
assert.deepEqual(meta.h3Drafts,[{...row,enabled:true}]);
assert.deepEqual(meta.h3DraftRemoved,[]);
assert.equal(manager.editor._deletedH3DraftIds.size,0);
assert.equal(picker.add(rows[0]),false,'no duplicates');
manager.editor._openGen++;assert.equal(picker.add({...rows[0],id:'late'}),false);
assert.equal(changes,1);
console.log('PASS: shared picker candidates, generation time, range filtering, locks, duplicate prevention, restoration and editor lifetime');
