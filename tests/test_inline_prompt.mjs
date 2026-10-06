import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/components/InlinePromptEditor.js',import.meta.url),'utf8');
const {assetMentionRanges,InlinePromptEditor}=new Function('HTMLElement','customElements','makeT',source.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')+';return {assetMentionRanges,InlinePromptEditor};')(class {},{define(){}},dict=>key=>dict.en[key]);
const assets=[{id:'hero',name:'角色 A'},{id:'short',name:'角色'},{id:'punct',name:'A[1].png'}];
assert.deepEqual(assetMentionRanges('Hi @角色 A and @A[1].png!',assets).map(r=>[r.start,r.end,r.assets[0].id]),[[3,8,'hero'],[13,22,'punct']]);
assert.equal(assetMentionRanges('email@角色 @角色ABC',assets).length,0);
globalThis.Node={TEXT_NODE:3};
const text=value=>({nodeType:3,data:value});
const tag={dataset:{mention:'@角色 A'},childNodes:[text('label'),text('×')]};
const editor={childNodes:[text('Hi '),tag,text(' walks')]};
const host={editor,textOf:InlinePromptEditor.prototype.textOf};
assert.equal(host.textOf(editor),'Hi @角色 A walks');
assert.equal(InlinePromptEditor.prototype.offsetAt.call(host,editor,2),8);
assert.equal(InlinePromptEditor.prototype.offsetAt.call(host,editor.childNodes[2],2),10);
console.log('PASS: named reference ranges, longest names, escaped punctuation, tag serialization and caret offsets');

const committed = Object.assign(new EventTarget(), {value:'', selectionStart:0, selectionEnd:0,
    setSelectionRange(start, end) {this.selectionStart=start;this.selectionEnd=end;}});
let cursorAtInput;
committed.addEventListener('input', () => {cursorAtInput=committed.selectionStart;});
const composingEditor = {textarea:committed, editor:{},
    shadowRoot:{getSelection:()=>({rangeCount:1,anchorNode:{},anchorOffset:1,focusNode:{},focusOffset:1})},
    offsetAt:(node, offset)=>offset, textOf:()=> '@',
    nativeSelection:committed.setSelectionRange, configure(){}};
InlinePromptEditor.prototype.commitDom.call(composingEditor);
assert.equal(committed.value, '@');
assert.equal(cursorAtInput, 1, '@ suggestions must see the committed caret before input listeners run');
console.log('PASS: IME/native input publishes text and caret together for reference suggestions');

const appSource=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
const start=appSource.indexOf('    _unlinkPromptMention(');
const unlink=new Function('assetMentionRanges','return ({'+appSource.slice(start,appSource.indexOf('\n    }',start)+6)+'})._unlinkPromptMention')(assetMentionRanges);
const meta={prompt:'@角色 A remains',promptMediaIds:['hero']};
const app={_ensureClipMeta:()=>meta,_saveToWidgets(){}};
unlink.call(app,{track:{}},assets[0]);assert.deepEqual(meta.promptMediaIds,['hero']);
meta.prompt='No mention';meta.video_shots={points:[{description:'@角色 A'}]};
unlink.call(app,{track:{}},assets[0]);assert.deepEqual(meta.promptMediaIds,['hero']);
meta.video_shots.points=[];unlink.call(app,{track:{}},assets[0]);assert.deepEqual(meta.promptMediaIds,[]);
console.log('PASS: remaining prompt/keyframe mentions retain binding, final deletion unbinds');
