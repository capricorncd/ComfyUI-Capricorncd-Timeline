import { stripPromptComments } from "../js/prompt_text.js";
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const method = name => {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    return new Function('stripPromptComments', 'SETTING_PROMPT_KEYS', 'normalizePromptIncludes', 'setRichPromptValue',
        `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(
        stripPromptComments, ['prepend_prompt', 'append_prompt'], value => value ?? ['clip'], (input, text) => { input.value = text; });
};
const clip = { id: 'managed' }, other = { id: 'sidebar' };
const meta = { prompt: 'Action\n// hidden action', promptIncludes: ['resource', 'clip'], items: [
    { id: 'a', enabled: true }, { id: 'b', enabled: false }, { id: 'c', useMediaPrompt: false },
] };
const settings = { prepend_prompt: 'Style\n// hidden style', append_prompt: 'Sound\n// hidden sound' };
const app = {
    _aiOptimizeClipId: clip.id, _selClip: other, _aiOptimizeSrc: 'clip',
    _findClipById: id => id === clip.id ? clip : null,
    _ensureClipMeta: target => target === clip ? meta : { prompt: 'Other Clip', items: [] },
    _clipItems: meta => meta.items, _findMediaById: id => ({ setting_description: id + '\n// hidden asset' }),
    _readSettingPrompt: key => settings[key], aiSrcText: { classList: { remove() {} } }, promptInput: {},
    aiSourceEditor: {}, aiResourcePane: {}, _clearAiResourcePreview() {}, _setAiOptimizeBusy() {},
    _recordUndo() { throw Error('readonly tab must not create undo entries'); },
};
for (const name of ['_stripPromptComments', '_composeFinalPrompt', '_refreshFinalPromptDisplay',
    '_promptManagerValue', '_writePromptManagerValue', '_onPromptManagerSourceInput',
    '_setAiOptimizeSrcTab', '_fillAiOptimizeSrc']) app[name] = method(name);

app._setAiOptimizeSrcTab('final');
assert.equal(app._aiOptimizeSrc, 'final');
assert.equal(app.aiSrcText.readOnly, true);
assert.equal(app.aiSourceEditor.hidden, false);
assert.equal(app.aiResourcePane.hidden, true);
assert.equal(app.aiSrcText.value, 'Style\n\na\n\nAction\n\nSound');
assert(!app.aiSrcText.value.includes('Other Clip'), 'use managed Clip, not unrelated sidebar selection');
assert.equal(app._writePromptManagerValue('final', 'corrupted'), false);
app.aiSrcText.value = 'accidental input';
app._onPromptManagerSourceInput();
assert.equal(meta.prompt, 'Action\n// hidden action');
app._fillAiOptimizeSrc();

meta.usePrependPrompt = false; meta.promptIncludes = ['clip'];
app._refreshFinalPromptDisplay();
assert.equal(app.aiSrcText.value, 'Action\n\nSound', 'include changes refresh full prompt');
meta.useAppendPrompt = false; meta.prompt = 'Latest generated action';
app._refreshFinalPromptDisplay();
assert.equal(app.aiSrcText.value, 'Latest generated action', 'AI result updates readonly display');
meta.promptIncludes = [];
app._refreshFinalPromptDisplay();
assert.equal(app.aiSrcText.value, '', 'nothing selected yields empty final text');
app._setAiOptimizeSrcTab('clip');
assert.equal(app.aiSrcText.readOnly, false);
assert.equal(app.aiSrcText.value, 'Latest generated action', 'switching back does not overwrite Clip prompt');
app._setAiOptimizeSrcTab('append_prompt');
assert.equal(app.aiSrcText.readOnly, false);
assert.equal(app.aiSrcText.value, settings.append_prompt);
const tabs = [...source.matchAll(/data-source-tab="([^"]+)"/g)].map(match => match[1]);
assert.deepEqual(tabs, ['clip', 'resource', 'prepend_prompt', 'append_prompt', 'final']);
const translations = readFileSync(new URL('../js/i18n/timeline_editor.js', import.meta.url), 'utf8');
assert.equal((translations.match(/full_prompt_tab:/g) || []).length, 3);
console.log('Full prompt tab: order, readonly, same composition, comments, include refresh and source isolation passed');

clip.track = {locked:false};
const point = {description:'Keyframe action'};
const target = {clip};
app._aiOptimizeKeyframe = {target, point};
meta.promptIncludes = ['clip'];
assert.equal(app._promptManagerValue('clip', clip), 'Keyframe action');
assert.equal(app._promptManagerValue('final', clip), 'Keyframe action');
let keyframeSaves = 0;
app._directorKeyframes = {
    save(savedTarget) {assert.equal(savedTarget, target); keyframeSaves++;}, refreshPanel() {},
};
assert(app._writePromptManagerValue('clip', 'Updated keyframe', {recordUndo:false}));
assert.equal(point.description, 'Updated keyframe');
assert.equal(meta.prompt, 'Latest generated action', 'keyframe edits preserve Clip prompt');
assert.equal(keyframeSaves, 1);
clip.track.locked = true;
assert.equal(app._writePromptManagerValue('clip', 'Locked edit'), false);
assert.equal(point.description, 'Updated keyframe');
app._aiOptimizeKeyframe = null;
assert.equal(app._promptManagerValue('clip', clip), 'Latest generated action');
console.log('Keyframe prompt manager: shared tabs, keyframe-only persistence, full prompt, lock and normal Clip restoration passed');
