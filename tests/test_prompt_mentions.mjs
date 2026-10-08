import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const src=readFileSync(new URL('../js/components/PromptMentions.js',import.meta.url),'utf8');
const inlineSource=readFileSync(new URL('../js/components/InlinePromptEditor.js',import.meta.url),'utf8');
const assetMentionRanges=new Function('HTMLElement','customElements','makeT',inlineSource.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')+';return assetMentionRanges;')(class {},{define(){}},dict=>key=>dict.en[key]);
const h3Source = readFileSync(new URL('../js/components/H3PromptCompletion.js',import.meta.url),'utf8');
let uiLocale = 'en';
const {h3Query} = new Function('getLocale', 'makeT',h3Source.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')+';return {h3Query};')(() => uiLocale, dict=>key=>dict.en[key]);
const {mentionQuery,retentionQuery,retentionOptions,PromptMentions}=new Function('HTMLElement','customElements','makeT','iconHtml','assetMentionRanges','replaceRichPromptRange','h3Query',src.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')+';return {mentionQuery,retentionQuery,retentionOptions,PromptMentions};')(class {},{define(){}},dict=>key=>dict.en[key],()=> '',assetMentionRanges,(ta,text,start,end)=>{ta.setRangeText(text,start,end,'end');ta.dispatchEvent(new Event('input'));},h3Query);
assert.deepEqual(mentionQuery('Hello @角色',9),{start:6,end:9,query:'角色'});
assert.equal(mentionQuery('@角色 A ',6),null);
assert.equal(mentionQuery('normal',6),null);
assert.equal(mentionQuery('@a\ntext',7),null);
assert.deepEqual(mentionQuery('@x @y',5),{start:3,end:5,query:'y'});
const calls=[];
const picker={textarea:{focus(){},setRangeText(...args){calls.push(args)},dispatchEvent(e){calls.push(e.type)}},match:{start:3,end:5},dispatchEvent(e){calls.push(e.detail)},close(){this.hidden=true}};
globalThis.CustomEvent=class {constructor(type,opts){this.detail=opts.detail}};
PromptMentions.prototype.select.call(picker,{id:'id2',name:'角色 A'});
assert.deepEqual(calls[0],['@角色 A ',3,5,'end']);assert.equal(calls[1],'input');assert.equal(calls[2].id,'id2');assert(picker.hidden);
const appSource=readFileSync(new URL('../js/CapTimelineEditorApp.js',import.meta.url),'utf8');
function method(name){const start=appSource.indexOf('    '+name+'(');return new Function('return ({'+appSource.slice(start,appSource.indexOf('\n    }',start)+6)+'}).'+name)();}
const row={id:'m1',kind:'image',file:'folder/hero.png'};
const app={_defaultMediaName:method('_defaultMediaName'),_parseMediaMeta:method('_parseMediaMeta'),_getMediaMeta:method('_getMediaMeta'),_writeMediaMeta:method('_writeMediaMeta'),_findMedia:()=>row,_ensureMedia:()=>row,_mediaStarsByDir:{},_mediaStarsId:()=> 'hero',_saveMediaStarsForDir(){this.saved=true}};
assert.equal(app._getMediaMeta('image',row.file).name,'hero');
app._writeMediaMeta('image',row.file,{name:'新角色',settingDescription:'Description'});
assert.equal(row.name,'新角色');assert.equal(app._getMediaMeta('image',row.file).name,'新角色');
assert.equal(app._parseMediaMeta(JSON.parse(JSON.stringify(app._mediaStarsByDir.hero))).name,'新角色');
assert.equal(row.setting_description,'Description');
app._writeMediaMeta('image',row.file,{name:'  '});assert.equal(row.name,'hero');
const dbl=appSource.slice(appSource.indexOf('tl._tracksEl?.addEventListener("dblclick"'),appSource.indexOf('const scroll = tl.scrollEl;',appSource.indexOf('tl._tracksEl?.addEventListener("dblclick"')));
assert(dbl.includes('_openAiOptimizeModal(clip)'));assert(!dbl.includes('_directorKeyframes.add'));
console.log('PASS: @ queries, named insertion, stable selection ID, media name persistence/defaults, double-click prompt routing');

const linkStart=appSource.indexOf('    _linkPromptMention(');
const link=new Function('isDirectorTrackType','return ({'+appSource.slice(linkStart,appSource.indexOf('\n    }',linkStart)+6)+'})._linkPromptMention')(()=>true);
const meta={items:[{id:'video',kind:'video'}]};
const host={_ensureClipMeta:()=>meta,_recordUndo(){},_saveToWidgets(){this.saved=true;}};
link.call(host,{track:{}},{id:'hero'});link.call(host,{track:{}},{id:'hero'});
assert.deepEqual(meta.items,[{id:'video',kind:'video'}],'mentions do not change visible clip media');
assert.deepEqual(meta.promptMediaIds,['hero']);assert(host.saved);
assert(appSource.includes('prompt_media_ids: [...(m.promptMediaIds || [])]'));
console.log('PASS: prompt-only references stay separate from visible materials and persist');

globalThis.document = Object.assign(new EventTarget(),{createElement:()=>Object.assign(new EventTarget(),{configure(){},remove(){}})});
globalThis.window = new EventTarget();
const textarea = Object.assign(new EventTarget(), {value:'@', selectionStart:1, selectionEnd:1,after(){}});
const livePicker = Object.assign(Object.create(PromptMentions.prototype), {
    search:{value:''}, render(){this.results=this.assets;}, place(){}, onKey(){}, hidden:true,
});
livePicker.bind(textarea, () => [{id:'hero', name:'角色'}]);
const composingInput = new Event('input');
composingInput.isComposing = true;
textarea.dispatchEvent(composingInput);
assert(livePicker.hidden, 'do not open during IME composition');
textarea.dispatchEvent(new Event('compositionend'));
assert.equal(livePicker.hidden, false, 'open after IME commits @ without another input event');
livePicker.disconnectedCallback();
assert(livePicker.controller.signal.aborted);
livePicker.connectedCallback();
textarea.dispatchEvent(new Event('input'));
assert.equal(livePicker.hidden, false, 'reconnect restores prompt input listeners');
assert.equal(livePicker.results[0].id, 'hero');
livePicker.disconnectedCallback();
console.log('PASS: IME commit and reconnect keep @ suggestions active');

for (const kind of ['Subject','Picture','Video','Audio']) {
    const value = `retention_analysis:\n<${kind} 12>: `;
    assert.deepEqual(retentionQuery(value, value.length), {start:value.length,end:value.length,query:'',kind});
}
for (const value of ['text <Subject 1>: ', '<Subject 1>:', '<Unknown 1>: ', '<Subject 1>: fully_preserved.', '<Subject 1>:\n']) assert.equal(retentionQuery(value,value.length), null);
const annotated = 'retention_analysis:\n<Subject 1> (appears in [Shot 1]): par';
assert.equal(retentionQuery(annotated,annotated.length)?.kind, 'Subject');
for (const value of ['<Subject 1>: ', 'summary:\n<Subject 1>: ', 'retention_analysis:\n<Subject 1>: fully_preserved.\ndetailed_description:\n<Subject 2>: ']) assert.equal(retentionQuery(value,value.length), null);
const middle = 'retention_analysis:\n<Subject 1>: partially_preserved.';
const cursor = middle.indexOf('partially') + 3;
assert.equal(retentionQuery(middle,cursor).end,middle.length-1);
assert.deepEqual(retentionOptions('Audio').map(row=>row.name), ['fully_copy','partially_copy','reference','weak_reference']);
assert.equal(retentionOptions('Video')[0].name,'fully_preserved');
calls.length=0; picker.mode='retention'; picker.match={start:13,end:13};
PromptMentions.prototype.select.call(picker,{name:'fully_preserved'});
assert.deepEqual(calls[0],['fully_preserved',13,13,'end']);
assert.equal(calls.length,2,'retention insertion does not emit an asset selection');
console.log('PASS: retention triggers, visual/audio choices and plain marker insertion');

const query = text => h3Query(text,text.length);
assert.equal(query(':h3').options.length,7);
assert(query('summary: :h3').options.every(row=>!row.name.startsWith('[')));
assert(query('summary: ::h3').options.some(row=>row.name==='[video editing + reference generation + audio reuse]'));
assert(!query('summary: [video editing + ::h3').options.some(row=>row.name==='video editing'));
assert.equal(query('summary: [video editing + ::h3').options.find(row=>row.name==='audio reuse').insert,'audio reuse]');
assert.equal(query('normal text'),null);
assert.equal(query('summary: '),null);
assert.equal(query('::h3').options.length,0);
assert.equal(query('detailed_description:\n[Shot 1] action\n::h3').options[0].insert,'[Shot 2] At 00:00.000, ');
assert.equal(query('subject_definitions:\n<Subject 1> hero\n::h3').options[0].name,'<Subject 2>');
assert(query('non_diegetic_music: ::h3').options.some(row=>row.name==='N/A'));
const input = 'retention_analysis:\n<Audio 1>: ::h3';
assert.equal(retentionQuery(input,query(input).start).kind,'Audio');
console.log('PASS: :h3 sections, ::h3 scoped children, combination deduplication and numbering');

for (const [locale, language] of [['zh','Chinese'],['en','English'],['ja','Japanese']]) {
    uiLocale = locale;
    const match = h3Query('prefix ::d', 10);
    assert.equal(match.options[0].insert, `<d>[${language}]</d>`);
    assert.equal(match.options.length, 3);
    const ta = {value:'prefix ::d suffix', focus(){},
        setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end)},
        setSelectionRange(start,end){this.selectionStart=start;this.selectionEnd=end},
        dispatchEvent(){picker.match=null}};
    const picker = {textarea:ta, mode:'h3', match, close(){}};
    PromptMentions.prototype.select.call(picker, match.options[0]);
    assert.equal(ta.value, `prefix <d>[${language}]</d> suffix`);
    assert.equal(ta.value.slice(ta.selectionStart), '</d> suffix');
    assert.equal(ta.selectionStart, ta.selectionEnd);
}
assert.equal(h3Query('::description', 13), null);
assert.equal(h3Query('text::d', 7), null);
console.log('PASS: dialogue language ordering, insertion, cursor and exact trigger');
