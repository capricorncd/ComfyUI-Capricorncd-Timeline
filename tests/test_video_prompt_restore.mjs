import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { videoPromptUpdates } from '../js/editor/VideoPromptRestore.js';

const record = (id, text) => ({clip_id:id, prompts:[{id:'h3_clip_prompt', name:'prompt', text}, {name:'negative', text:'wrong'}, {name:'text', text:'unrelated'}]});
assert.deepEqual(videoPromptUpdates(record('a', 'actual')), [{id:'a', text:'actual'}]);
assert.deepEqual(videoPromptUpdates({kind:'composition', clips:[{generation:record('a','one')}, {generation:record('a','two')}]}), []);
assert.deepEqual(videoPromptUpdates(null), []);
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _restoreVideoPrompts(generation) {');
const restore = new Function('videoPromptUpdates', `return ({${source.slice(start,source.indexOf('\n    }',start)+6)}})._restoreVideoPrompts`)(videoPromptUpdates);
const clips = new Map([['a', {id:'a',track:{}}], ['b',{id:'b',track:{locked:true}}]]);
const metadata = new Map([['a',{prompt:'old',seed:42}]]);
let undo = 0, saved = 0;
const editor = {_findClipById:id=>clips.get(id), _ensureClipMeta:clip=>metadata.get(clip.id), _meta:metadata,
    _recordUndo(){undo++;}, _saveToWidgets(){saved++;}, _syncSelectedClip(){}, _refreshFinalPromptDisplay(){}};
const generation = {kind:'composition', clips:['a','b','missing'].map(id=>({generation:record(id, 'new')}))};
assert.equal(restore.call(editor,generation), 1);
assert.deepEqual(metadata.get('a'), {prompt:'new',seed:42});
assert.equal(undo,1);
assert.equal(saved,1);
console.log('PASS: recorded prompts, ambiguous IDs, locked/missing clips, single undo and save');
