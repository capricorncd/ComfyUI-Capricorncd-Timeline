import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const method = name => {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0, name);
    return new Function('SETTING_PROMPT_KEYS', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)(['prepend_prompt', 'append_prompt']);
};
const assets = [
    {id: 'a', setting_description: '晴天咖啡厅。'},
    {id: 'b', setting_description: '戴眼镜的女孩'},
];
const clip = {id: 'clip', track: {locked: false}};
let index = 3, undo = 0, saves = 0, selectedTab;
const meta = {prompt: '', items: [
    {id: 'a', kind: 'image'},
    {id: 'disabled', kind: 'image', enabled: false},
    {id: 'video', kind: 'video'},
    {id: 'b', kind: 'image'},
]};
const app = {
    _aiOptimizeClipId: clip.id,
    _findClipById: id => id === clip.id ? clip : null,
    _ensureClipMeta: () => meta, _clipItems: m => m.items, _clipPreviewItemIndex: () => index,
    _findMediaById: id => assets.find(item => item.id === id), _findMedia: () => null,
    _meta: new Map([[clip.id, meta]]), _recordUndo() { undo++; }, _saveToWidgets() { saves++; },
    _refreshFinalPromptDisplay() {}, _setAiOptimizeSrcTab(tab) { selectedTab = tab; },
    _stripPromptComments: text => text.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join('\n'),
};
for (const name of ['_aiResourceSubjectEntry', '_insertAiResourceDescription', '_promptManagerValue', '_writePromptManagerValue', '_onPromptManagerSourceInput']) app[name] = method(name);
const entry = '- <Subject 1> 来自 <Picture 2>。戴眼镜的女孩。';
assert.equal(app._aiResourceSubjectEntry(clip), entry, 'enabled images only determine Picture number');
for (const [before, after] of [
    ['', entry],
    ['summary: 看向窗外', `${entry}\nsummary: 看向窗外`],
    ['subject_definitions:', `subject_definitions:\n${entry}`],
    ['subject_definitions:\n已有内容\nsummary: 故事', `subject_definitions:\n${entry}\n已有内容\nsummary: 故事`],
    ['说明\n  subject_definitions: 已有内容\nsummary:', `说明\n  subject_definitions: 已有内容\n${entry}\nsummary:`],
    ['subject_definitions:\r\n已有内容', `subject_definitions:\r\n${entry}\r\n已有内容`],
    ['# subject_definitions:\nsummary:', `${entry}\n# subject_definitions:\nsummary:`],
    ['说明 subject_definitions: 标记', `${entry}\n说明 subject_definitions: 标记`],
    ['# subject_definitions:\nsubject_definitions:\n正文', `# subject_definitions:\nsubject_definitions:\n${entry}\n正文`],
]) {
    meta.prompt = before;
    const previousUndo = undo, previousSaves = saves;
    app._insertAiResourceDescription();
    assert.equal(meta.prompt, after);
    assert.equal(undo, previousUndo + 1); assert.equal(saves, previousSaves + 1);
    assert.equal(selectedTab, 'clip');
}
meta.prompt = 'subject_definitions:\n<Subject 2> 是另一个主体。\n# <Subject 99> 注释\nsummary: <Subject 4> 走进咖啡厅';
assert.match(app._aiResourceSubjectEntry(clip), /^- <Subject 5>/, 'Subject uses its own non-conflicting number, not the Picture number');
app._insertAiResourceDescription();
assert.match(app._aiResourceSubjectEntry(clip), /^- <Subject 6>/, 'subsequent insertion does not redefine the previous subject');
// Rendered button state must not reserve or cache the next Subject number.
meta.prompt = 'subject_definitions:\n<Subject 1> old';
assert.match(app._aiResourceSubjectEntry(clip), /^- <Subject 2>/);
meta.prompt = 'subject_definitions:\n<Subject 8> latest\n# <Subject 99> ignored';
app._insertAiResourceDescription();
assert.match(meta.prompt, /^subject_definitions:\n- <Subject 9>/, 'click rereads edited model data');
assert(meta.prompt.includes('<Subject 8> latest'));
meta.prompt = 'summary: all subjects removed';
app._insertAiResourceDescription();
assert.match(meta.prompt, /^- <Subject 1>/, 'deleted subjects do not leave a cached counter');

// Commit the live Clip editor before leaving for the resource tab.
app.aiSrcText = { value: 'subject_definitions:\n<Subject 12> freshly pasted', readOnly: false };
app._aiOptimizeSrc = 'clip';
app._onPromptManagerSourceInput();
app._aiOptimizeSrc = 'resource'; app.aiSrcText.readOnly = true;
app._insertAiResourceDescription();
assert.match(meta.prompt, /^subject_definitions:\n- <Subject 13>/);
assert(meta.prompt.includes('<Subject 12> freshly pasted'));

// A hidden editor may still hold global text: never use it for Clip numbering.
app.aiSrcText.value = '<Subject 900> global text';
meta.prompt = 'subject_definitions:\n<Subject 3> actual clip';
app._insertAiResourceDescription();
assert.match(meta.prompt, /^subject_definitions:\n- <Subject 4>/);
app._aiOptimizeSrc = 'clip'; app.aiSrcText.readOnly = false;
app.aiSrcText.value = 'subject_definitions:\n<Subject 17> live clip input';
app._insertAiResourceDescription();
assert.match(meta.prompt, /^subject_definitions:\n- <Subject 18>/, 'active editor is read on click');
delete app.aiSrcText; delete app._aiOptimizeSrc;
index = 0; meta.prompt = '';
assert.equal(app._aiResourceSubjectEntry(clip), '- <Subject 1> 来自 <Picture 1>。晴天咖啡厅。', 'no duplicate trailing punctuation');
const previousUndo = undo;
for (index of [1, 2, 9]) app._insertAiResourceDescription();
index = 0; clip.track.locked = true; app._insertAiResourceDescription();
clip.track.locked = false; assets[0].setting_description = '  '; app._insertAiResourceDescription();
app._aiOptimizeClipId = 'missing'; app._insertAiResourceDescription();
assert.equal(undo, previousUndo, 'disabled, non-image, absent, locked or empty references cannot insert');
assert.match(source, /<cap-button class="cat-te-ai-resource-insert"/);
assert.match(source, /this\.aiResourceInsertBtn\.addEventListener\("click", \(\) => this\._insertAiResourceDescription\(\)\)/);
console.log('Resource prompt insertion: numbering, header placement, comments, CRLF, guards and undo passed');
