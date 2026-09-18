import assert from 'node:assert/strict';
class Element {
 constructor(tag=''){this.tag=tag;this.children=[];this.attrs={};this.listeners={};this.classList={toggle(){}};}
 append(...items){this.children.push(...items);} appendChild(item){this.append(item);}
 replaceChildren(){this.children=[];} setAttribute(k,v){this.attrs[k]=v;}
 addEventListener(k,fn){this.listeners[k]=fn;} dispatchEvent(e){this.event=e;}
 focus(){active.shadowRoot.activeElement=this;}
 attachShadow(){this.shadowRoot={querySelector:()=>new Element()};return this.shadowRoot;}
}
globalThis.HTMLElement=Element;
globalThis.document={createElement:tag=>new Element(tag)};
const registry=new Map();globalThis.customElements={get:key=>registry.get(key),define:(key,value)=>registry.set(key,value)};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;Object.assign(this,options);}};
const {ContextMenu}=await import('../js/components/ContextMenu.js');
const active=new ContextMenu();
const items=[{label:'复制  Ctrl+C',icon:'copy'},{separator:true},{label:'禁止',disabled:true},{label:'删除',icon:'trash',shortcut:'Delete',danger:true}];
active.setItems(items);
assert.equal(active._items.children[1].tag,'hr');
const [copy,disabled,del]=active._buttons;
assert.equal(copy.children[0].children[1].textContent,'复制');
assert.equal(copy.children[0].children[2].textContent,'Ctrl+C');
assert(copy.children[0].children[0].innerHTML.includes('<svg'));
assert.equal(del.children[0].children[2].textContent,'Delete');
assert.equal(del.attrs.variant,'danger');
copy.listeners.click({stopPropagation(){}});assert.equal(active.event.detail,items[0]);
active.event=null;disabled.listeners.click({stopPropagation(){}});assert.equal(active.event,null);
active.focus();assert.equal(active.shadowRoot.activeElement,copy);
const key=k=>active.listeners.keydown({key:k,stopPropagation(){},preventDefault(){}});
key('ArrowDown');assert.equal(active.shadowRoot.activeElement,del);
key('ArrowDown');assert.equal(active.shadowRoot.activeElement,copy);
key('End');assert.equal(active.shadowRoot.activeElement,del);
key('Home');assert.equal(active.shadowRoot.activeElement,copy);
key('Escape');assert.equal(active.event.type,'menu-close');assert(active.event.detail.restoreFocus);
active.setItems([{label:'新菜单'}]);assert.equal(active._buttons.length,1);
console.log('ContextMenu component: columns, icons, separators, disabled actions and keyboard navigation passed');
