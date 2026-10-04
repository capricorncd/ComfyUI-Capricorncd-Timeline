import assert from 'node:assert/strict';
import {renameAssetMentions as rename} from '../js/prompt_asset_rename.js';
assert.equal(rename('@角色 看向 @角色。角色', '角色', '新角色'), '@新角色 看向 @新角色。角色');
assert.equal(rename('@角色 A 与 @角色', '角色', '新角色', ['角色 A']), '@角色 A 与 @新角色');
assert.equal(rename('x@hero @heroine @hero @hero_2', 'hero', 'new'), 'x@hero @heroine @new @hero_2');
assert.equal(rename('@a[1].png', 'a[1].png', '$new'), '@$new');
assert.equal(rename('@old', 'old', 'new'), '@new');
assert.equal(rename('', 'old', 'new'), '');
console.log('PASS: complete names, overlapping names, Unicode, regex characters and literal replacements');

const {readFileSync} = await import('node:fs');
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _renameMediaPromptReferences(');
const method = new Function('renameAssetMentions', 'SETTING_PROMPT_KEYS', 'setRichPromptValue',
    `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._renameMediaPromptReferences`)(rename, ['prepend_prompt'], (input, value) => input.value = value);
const meta = {prompt:'@old walks', promptMediaIds:['asset-id'], promptSkills:[{text:'Preserve @old'}], generatedVideos:[{prompt:'@old historical'}]};
meta.video_shots = {points: [{description: '@old close-up'}]};
const editor = {
    _meta:new Map([['clip',meta]]),
    _projectResources:[{id:'asset-id',name:'new',video_shots:{points:[{description:'Follow @old'}]}}],
    _storyboards:[{description:'@old enters'}],
    _settingPromptInputs:{prepend_prompt:{value:'Use @old'}},
    _syncScalarsToProjectJson(){this.synced=true;}, _updatePromptPanel(){},
};
method.call(editor,'old','new');
assert.equal(meta.prompt,'@new walks');
assert.equal(meta.video_shots.points[0].description, '@new close-up');
assert.equal(meta.promptSkills[0].text,'Preserve @new');
assert.deepEqual(meta.promptMediaIds,['asset-id']);
assert.equal(meta.generatedVideos[0].prompt,'@old historical');
assert.equal(editor._projectResources[0].video_shots.points[0].description,'Follow @new');
assert.equal(editor._settingPromptInputs.prepend_prompt.value,'Use @new');
assert.equal(editor._storyboards[0].description,'@new enters');
assert(editor.synced);
editor.aiOptimizeModal = {hidden: false};
editor.aiSrcText = {value: '@new walks'};
editor._fillAiOptimizeSrc = () => {editor.aiSrcText.value = meta.prompt;};
editor._syncAiPromptTargetControls = () => {};
method.call(editor, 'new', 'renamed');
assert.equal(editor.aiSrcText.value, '@renamed walks', 'Open prompt manager refreshes after asset renaming');
console.log('PASS: current prompts and keyframes update; asset IDs and generation history remain intact');
