import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoPromptUpdates } from '../js/editor/VideoPromptRestore.js';

const record = (id, text) => ({clip_id:id, prompts:[{id:'h3_clip_prompt', name:'prompt', text}, {name:'negative', text:'wrong'}, {name:'text', text:'unrelated'}]});
assert.deepEqual(videoPromptUpdates(record('a', 'actual')), [{id:'a', text:'actual'}]);
assert.deepEqual(videoPromptUpdates({kind:'composition', clips:[{generation:record('a','one')}, {generation:record('a','two')}]}), []);
assert.deepEqual(videoPromptUpdates(null), []);
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const methods = {};
for (const name of ['_restoreVideoPrompts', '_generatedPromptTarget', '_fillGeneratedPrompts']) {
    const start = source.indexOf(`    ${name}(`);
    methods[name] = new Function('videoPromptUpdates', `return ({${source.slice(start,source.indexOf('\n    }',start)+6)}}).${name}`)(videoPromptUpdates);
}
const clips = new Map([['a', {id:'a',track:{}}], ['b',{id:'b',track:{locked:true}}]]);
const metadata = new Map([['a',{prompt:'old',seed:42}]]);
let undo = 0, saved = 0;
let history = {schema_version:1,items:[]};
const editor = {...methods, _promptHistoryDocument:()=>structuredClone(history), _savePromptHistory:data=>{history=data;}, _findClipById:id=>clips.get(id), _ensureClipMeta:clip=>metadata.get(clip.id), _meta:metadata,
    _recordUndo(){undo++;}, _saveToWidgets(){saved++;}, _syncSelectedClip(){}, _refreshFinalPromptDisplay(){}};
const generation = {kind:'composition', clips:['a','b','missing'].map(id=>({generation:record(id, 'new')}))};
assert.equal(editor._restoreVideoPrompts(generation), 1);
assert.deepEqual(metadata.get('a'), {prompt:'new',seed:42});
assert.equal(undo,1);
assert.equal(saved,1);
console.log('PASS: recorded prompts, ambiguous IDs, locked/missing clips, single undo and save');

assert.equal(history.items[0].text, 'old');
assert.equal(editor._restoreVideoPrompts(generation), 0);
assert.equal(history.items.length, 1);
const point = {time:2, description:'old keyframe'};
const target = {start:1,rate:2};
let keyframeSaved = 0;
editor._directorKeyframes = {target:()=>target, points:()=>[point], save:()=>keyframeSaved++};
const segment = {clip_id:'a', start_frame:12, fps:24};
const keyframe = {...record('a__kf1_1','new keyframe'), keyframe_segment:segment};
assert.equal(editor._restoreVideoPrompts(keyframe), 1);
assert.equal(point.description,'new keyframe');
assert.equal(metadata.get('a').prompt,'new');
assert.equal(history.items[0].text,'old keyframe');
assert.equal(keyframeSaved,1);
assert.equal(editor._restoreVideoPrompts({...keyframe,keyframe_segment:{...segment,start_frame:13}}),0);
assert.equal(videoPromptUpdates({kind:'composition',clips:[{generation:record('a','clip')},{generation:keyframe}]}).length,2);
console.log('PASS: shared fill, history backup, repeated fill, exact keyframe mapping and missing targets');

assert.equal(editor._restoreVideoPrompts({...record('a','continuation'), keyframe_segment:{...segment,start_frame:48,interval_start_frame:12}}),1);
assert.equal(point.description,'continuation');
assert.equal(history.items[0].text,'new keyframe');
