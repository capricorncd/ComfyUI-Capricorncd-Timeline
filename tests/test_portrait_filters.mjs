import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { applyLutPixels, activePortraitFilters } from '../js/editor/PortraitFilters.js';
import {decodeClipTimingSecs} from '../js/timecode.js';
import {migrateContinuationSettings} from '../js/editor/ClipContinuation.js';
import {restoreH3ClipTiming} from '../js/editor/H3Timing.js';
const data=JSON.parse(await readFile(new URL('../js/filters/portrait.json',import.meta.url),'utf8'));
const original=[190,135,105,255,20,18,17,255,200,25,30,255];
const result=new Uint8ClampedArray(original);
applyLutPixels(result,data,'fair',0.7);
assert.ok(result[0]>original[0] && result[1]>original[1] && result[2]>original[2]);
assert.ok(result[0]-result[2]<original[0]-original[2], 'reduce yellow skin cast');
assert.ok(Math.abs(result[4]-original[4])<=1, 'preserve dark hair');
assert.ok(Math.abs(result[8]-original[8])<=2, 'preserve red jersey');
const unchanged=new Uint8ClampedArray(original);applyLutPixels(unchanged,data,'fair',0);
assert.deepEqual([...unchanged],original);
const tracks=[{id:'top',type:'filter',visible:true,clips:[{id:'a',startTime:1,endTime:2}]},
    {id:'bottom',type:'filter',visible:true,clips:[{id:'b',startTime:0,endTime:3}]}];
const meta=new Map([['a',{filterPreset:'fair',filterStrength:0.7}],['b',{filterPreset:'natural',filterStrength:1}]]);
assert.deepEqual(activePortraitFilters(tracks,meta,1),[{preset:'natural',strength:1},{preset:'fair',strength:0.7}]);
assert.equal(activePortraitFilters(tracks,meta,2).length,1);
tracks[1].visible=false;meta.get('a').disabled=true;
assert.equal(activePortraitFilters(tracks,meta,1).length,0);
const source=await readFile(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name, async=false){
    const start=source.indexOf(`    ${async?'async ':''}${name}(`);
    return new Function('decodeClipTimingSecs','migrateContinuationSettings','restoreH3ClipTiming','T','uid',
        `return ({${source.slice(start,source.indexOf('\n    }',start)+6)}}).${name}`)(decodeClipTimingSecs,migrateContinuationSettings,restoreH3ClipTiming,key=>key,()=> 'filter-id');
}
const saved={id:'filter-id',type:'filter',name:'White skin',start_ms:500,duration_ms:1000,filter_preset:'bright',filter_strength:0.25,enabled:false};
const rows=method('_clipsFromProjectTracks').call({_jsonClipMediaRows:()=>[]},{tracks:[{type:'filter',clips:[saved]}]},24);
const loadedMeta=new Map(), track={id:'track',type:'filter'};
let loadedClip;
const app={_meta:loadedMeta,_resolveTrackForClip:()=>track,getFps:()=>24,
    _addRestoredClip(t,c){loadedClip={...c,track:t};return loadedClip;},_decorateClip(){}};
await method('_addClipFromJson',true).call(app,rows[0]);
assert.equal(loadedClip.startTime,0.5);assert.equal(loadedClip.duration,1);
assert.equal(loadedMeta.get('filter-id').filterPreset,'bright');assert.equal(loadedMeta.get('filter-id').filterStrength,0.25);
assert.equal(loadedMeta.get('filter-id').disabled,true);
console.log('Portrait color, strength, visibility, stacking and boundaries passed');
