import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../js/editor/ImageCrop.js',import.meta.url),'utf8');
class Element {
 constructor(){this.fields=new Map();this.value='';}
 querySelector(key){if(!this.fields.has(key))this.fields.set(key,new Element());return this.fields.get(key);}
 set innerHTML(value){this.fields.clear();}
 showModal(){this.open=true;} close(){this.open=false;}
 setStatus(message){this.message=message;}
 getContext(){return {clearRect(){},drawImage(){},fillRect(){},strokeRect(){}};}
}
let sequence=0, requests=[];
const api={async fetchApi(path,opts){requests.push(JSON.parse(opts.body));return {ok:true,json:async()=>({file:`crop-${++sequence}.png`})};}};
const Image=class {naturalWidth=1000;naturalHeight=800;async decode(){}};
const {ImageCrop,fitCrop}=new Function('api','T','document','Image',source.replace(/^import .*;\r?\n/gm,'').replaceAll('export ','')+';return {ImageCrop,fitCrop};')(api,key=>key,{createElement:()=>new Element()},Image);
for(const aspect of [1,16/9,4/3,9/16,3/4]){
 const r=fitCrop({x:0,y:0,width:1,height:1},aspect);
 assert(Math.abs(r.width/r.height-aspect)<1e-9);assert(r.x>=0&&r.y>=0&&r.x+r.width<=1&&r.y+r.height<=1);
}
const row={id:'asset',kind:'image',file:'original.png',name:'Character',generation_prompt:'original prompt'};
const app={_projectResources:[row],_mediaStatus:new Map(),_findMediaById(id){return this._projectResources.find(r=>r.id===id);},
 _ensureMedia(kind,file,extras={}){let r=this._projectResources.find(r=>r.file===file);if(!r){r={id:'original-id',kind,file,...extras};this._projectResources.push(r);}return r;},
 _imgUrl:file=>file,_recordUndo(){},_replaceMediaReference(old,file){assert.equal(old,row.file);row.file=file;},
 _saveToWidgets(){this.saved=structuredClone(this._projectResources);},_renderMediaGrid(){},_scheduleProgramPreview(){}};
const ui=new ImageCrop(app,{append(){}});
await ui.open(row);
ui.dialog.querySelector('[data-ratio]').value='1:1';ui.dialog.querySelector('[data-ratio]').onchange();
await ui.dialog.querySelector('[data-apply]').onclick();
assert.equal(row.file,'crop-1.png');assert.equal(row.image_crop.source_id,'original-id');
assert.equal(app._projectResources[1].file,'original.png');
assert.equal(app._projectResources[1].generation_prompt,'original prompt');
const rect=structuredClone(row.image_crop.rect);
await ui.open(row);
assert.equal(ui.dialog.querySelector('[data-ratio]').value,'1:1');
await ui.dialog.querySelector('[data-apply]').onclick();
assert.deepEqual(requests[1].rect,rect);assert.equal(requests[1].file,'original.png');
await ui.open(row);
ui.dialog.querySelector('[data-ratio]').value='original';ui.dialog.querySelector('[data-reset]').onclick();
await ui.dialog.querySelector('[data-apply]').onclick();
assert.deepEqual(requests[2].rect,{x:0,y:0,width:1,height:1});
assert.equal(app._projectResources.length,2,'Repeated cropping must keep one original and one bound asset');
assert.deepEqual(app.saved[0].image_crop,row.image_crop);
console.log('Crop aspect ratios, source preservation, repeated edits, expansion and persistence passed');
