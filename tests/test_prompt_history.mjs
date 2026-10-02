import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source=readFileSync(new URL('../js/components/PromptHistoryActions.js',import.meta.url),'utf8');
class Element {
    constructor(){this.children=[];this.style={setProperty(){}};}
    append(...items){this.children.push(...items);}
    replaceChildren(){this.children=[];}
    setAttribute(){}
    addEventListener(){}
    showModal(){}
    close(){this.closed=true;}
}
globalThis.document={createElement:()=>new Element()};
const code=source.slice(source.indexOf('export class'),source.indexOf('customElements.define')).replace('export ','');
const Actions=new Function('HTMLElement','t','setRichPromptValue','iconHtml',code+';return PromptHistoryActions;')(
    Element,key=>key,(ta,text)=>{ta.value=text;},()=>'<svg/>');
const actions=Object.create(Actions.prototype);
let data={schema_version:1,items:[]};
const events=[];
actions.textarea={value:'saved prompt',dispatchEvent:event=>events.push(event.type)};
actions.read=()=>data;actions.write=value=>{data=value;};actions.feedback=()=>{};
actions.save({});actions.save({});
assert.equal(data.items.length,1,'same prompt is deduplicated');
actions.shadowRoot=new Element();
actions.append=()=>{throw new Error('Dialog must be mounted in the rendered shadow tree, not unslotted light DOM');};
actions.history();
const dialog=actions.shadowRoot.children[0], card=dialog.children[1].children[0];
actions.textarea.value='edited';
card.children[2].onclick();
assert.equal(actions.textarea.value,'saved prompt');
assert.deepEqual(events,['focus','input','change']);
assert(dialog.closed);
card.children[3].onclick();
assert.equal(data.items.length,0);
const imported = {schema_version:1,items:[{id:'foreign',text:'other project',created_at:'2026-10-02T00:00:00Z'}, {id:'foreign',text:'other project'}]};
assert.equal(actions.importDocument(imported),1);
assert.equal(actions.importDocument(imported),0);
assert.equal(data.items.length,1);
assert.notEqual(data.items[0].id,'foreign');
const before=JSON.stringify(data);
assert.throws(()=>actions.importDocument({items:[{text:42}]}));
assert.throws(()=>actions.importDocument({schema_version:2,items:[]}));
assert.equal(JSON.stringify(data),before,'invalid imports do not modify existing history');
assert.equal(actions.importDocument({schema_version:1,items:[]}),0);
console.log('PASS: prompt history save, deduplication, restore events and delete');
