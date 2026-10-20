import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {filterRefMods, refModAssets, refModPlaybackRate, REFMOD_PREVIEW_RATE_KEY} from '../js/editor/RefMods.js';

const rows = [{name:'短剧甲/角色/女主_全身',description:'黑发、蓝色长裙',has_preview:true,preview_type:'image'},
    {name:'短剧甲/角色/女主_半身',description:'黑发、蓝色长裙',has_preview:true,preview_type:'video'},
    {name:'打斗/近身/回旋踢',description:'转身踢腿'}, {name:'特效/爆炸/火球',description:'橙色火焰'}];
assert.equal(filterRefMods(rows, '短剧甲').length, 2);
assert.equal(filterRefMods(rows, '蓝色 半身').length, 1);
assert.equal(filterRefMods(rows, '', '打斗').length, 1);
assert.equal(filterRefMods(rows, '', '短剧').length, 0, 'folder matching requires a directory boundary');
const assets = refModAssets(rows, path => '/prefix' + path);
assert.equal(assets[1].kind, 'video');
assert.equal(assets[0].name, rows[0].name);
assert.equal(assets[1].preview, '/prefix/refmods/preview?name=' + encodeURIComponent(rows[1].name));
assert.equal(assets[2].preview, '');
assert.equal(refModPlaybackRate({getItem:()=>null}), 2);
assert.equal(refModPlaybackRate({getItem:()=>4}), 4);
assert.equal(refModPlaybackRate({getItem:()=>999}), 2);
assert(REFMOD_PREVIEW_RATE_KEY);

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name, parameters, args) {
    const start = source.indexOf(`    ${name}(`);
    return new Function(...parameters, 'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '}).' + name)(...args);
}
const link = method('_linkPromptMention', ['isDirectorTrackType'], [()=>true]);
const meta = {};
let undos = 0;
const app = {_ensureClipMeta:()=>meta, _recordUndo(){undos++;}, _saveToWidgets(){}};
const clip = {track:{}};
link.call(app, clip, assets[0]); link.call(app, clip, assets[0]); link.call(app, clip, assets[1]);
assert.equal(meta.refMods.length, 2);
assert.equal(undos, 2);
assert.equal(meta.promptMediaIds, undefined, 'RefMods do not become visible media or frame anchors');
assert.equal(meta.refMods[0].strength, 1);
console.log('RefMods: nested path search, preview URLs, playback speed and distinct Clip bindings passed');
