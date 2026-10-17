import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _replacePromptText(');
const replace = new Function('setRichPromptValue', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._replacePromptText`)((input, value) => { input.value = value; });
function input(value, readOnly = false) { return {value, readOnly, classList:{contains:()=>false}, dispatchEvent() {}}; }
function fixture() {
    const current = input('人物.* 人物.*');
    const global = input('人物.*');
    const readonly = input('人物.*', true);
    const meta = {prompt:'人物.*', video_shots:{points:[{description:'人物.*'}]}, generatedVideos:[{prompt:'人物.*'}]};
    const media = {name:'人物.*', file:'人物.*.png', setting_description:'人物.*'};
    const app = {_meta:new Map([['clip',meta]]), _projectResources:[media], _storyboards:[{description:'人物.*'}],
        _overlay:{querySelectorAll:()=>[current, global, readonly]}, _historyReady:true, undo:0, saves:0,
        _recordUndo(){this.undo++;}, _saveToWidgets(){this.saves++;}, _syncScalarsToProjectJson(){}, _updatePromptPanel(){}};
    return {app,current,global,readonly,meta,media};
}
{
    const f=fixture();replace.call(f.app,f.current,'人物.*','$&',false);
    assert.equal(f.current.value,'$& $&');assert.equal(f.meta.prompt,'人物.*');assert.equal(f.global.value,'人物.*');
    assert.equal(f.app.undo,1);assert.equal(f.app.saves,1);
}
{
    const f=fixture();replace.call(f.app,f.current,'人物.*','人物.*新',true);
    assert.equal(f.current.value,'人物.*新 人物.*新');assert.equal(f.global.value,'人物.*新');
    assert.equal(f.meta.video_shots.points[0].description,'人物.*新');assert.equal(f.media.setting_description,'人物.*新');
    assert.equal(f.app._storyboards[0].description,'人物.*新');assert.equal(f.readonly.value,'人物.*');
    assert.equal(f.meta.generatedVideos[0].prompt,'人物.*');assert.equal(f.media.file,'人物.*.png');
    assert.equal(f.app.undo,1);assert.equal(f.app._historyReady,true);
}
{
    const f=fixture();replace.call(f.app,f.current,'','x',true);replace.call(f.app,f.current,'absent','x',true);
    assert.equal(f.app.undo,0);replace.call(f.app,f.current,'人物.*','',false);assert.equal(f.current.value,' ');
}
console.log('PASS: current/all scopes, literal matches, non-recursive replacement, empty replacement, no-op and history isolation');
