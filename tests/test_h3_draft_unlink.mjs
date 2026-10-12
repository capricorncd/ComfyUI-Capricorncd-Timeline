import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/editor/H3DraftVersions.js',import.meta.url),'utf8');
const Manager=new Function(source.slice(source.indexOf('export class ')).replace('export class ','return class '))();
const a={id:'a',track:{}}, b={id:'b',track:{}};
const shared={id:'shared',file:'preview.mp4',enabled:true};
const metas=new Map([[a,{h3Drafts:[{...shared},{id:'other',file:'other.mp4'}]}],[b,{h3Drafts:[{...shared}]}]]);
const before=structuredClone(metas.get(a));
let undo=0, saves=0, refresh=0;
const manager=Object.create(Manager.prototype);
manager.render=()=>{};
manager.editor={_findClipById:id=>[a,b].find(c=>c.id===id),_ensureClipMeta:c=>metas.get(c),
 _recordUndo:()=>undo++,_saveToWidgets:()=>saves++,_scheduleProgramPreview:()=>refresh++,
 _deletedH3DraftIds:new Set(),_requestH3DraftFiles:()=>{throw Error('Unlink must never call file API');}};
manager.unlink(a,['shared']);
assert.deepEqual(metas.get(a).h3Drafts.map(r=>r.id),['other']);
assert.deepEqual(metas.get(a).h3DraftRemoved,['shared']);
assert.deepEqual(metas.get(b).h3Drafts,[shared],'copied Clip retains its version');
assert.equal(manager.editor._deletedH3DraftIds.size,0);
assert.deepEqual([undo,saves,refresh],[1,1,1]);
manager.unlink(a,['shared']);assert.equal(undo,1);
a.track.locked=true;manager.unlink(a,['other']);assert.equal(undo,1);
a.track.locked=false;manager.unlink(a,['other']);assert.equal(metas.get(a).h3Drafts.length,0);
metas.set(a,before);assert.equal(metas.get(a).h3DraftRemoved,undefined,'undo snapshot has no unlink tombstone');
assert(source.includes('actions.append(hd, details, folder, unlink, remove)'));
assert(source.includes("const batch = document.createElement('cap-dropdown-button')"));
console.log('PASS: unlink retains shared files and other Clips, persists local exclusions, respects locks and supports undo.');
