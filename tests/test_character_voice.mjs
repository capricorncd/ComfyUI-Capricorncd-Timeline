import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/editor/CharacterVoice.js', import.meta.url), 'utf8');
const CharacterVoice = new Function('T', source.replace(/^import .*;\r?\n/gm, '').replace('export class', 'class') + '; return CharacterVoice;')(key => key);
class Element {
    constructor() { this.children=[]; this.handlers={}; this.paused=0; this.value=''; }
    addEventListener(key, handler) { this.handlers[key]=handler; }
    pause() { this.paused++; }
    load() {}
    removeAttribute(key) { delete this[key]; }
    replaceChildren() { this.children=[]; }
    append(item) { this.children.push(item); }
}
globalThis.document={createElement:()=>new Element()};
const elements = new Map();
const host={querySelector(key){ if (!elements.has(key)) elements.set(key,new Element()); return elements.get(key); }};
const row={id:'character',kind:'image',file:'girl.png'};
const reference={id:'voice',kind:'audio',file:'voice.wav'};
const app={_projectResources:[row,reference],_audioFiles:['voice.wav'],undo:0,saved:0,
    _mediaPreviewItem:()=>({kind:'image',file:'girl.png'}), _findMedia:()=>row,
    _findMediaById:id=>app._projectResources.find(r=>r.id===id),
    _ensureMedia:kind=>kind==='audio'?reference:row,
    _recordUndo(){this.undo++;},_saveToWidgets(){this.saved++;},_audioUrl:f=>'/local/'+f};
const ui=new CharacterVoice(app,host);
ui.refresh();
assert.equal(ui.audio.hidden,true);
ui.select.value='voice.wav';
elements.get('[data-voice-action="bind"]').handlers.click();
assert.equal(row.voice_audio_id,'voice');
assert.equal(ui.audio.src,'/local/voice.wav');
assert.equal(ui.audio.hidden,false);
elements.get('[data-voice-action="unbind"]').handlers.click();
assert.equal(row.voice_audio_id,undefined);
assert.equal(ui.audio.hidden,true);
assert.equal(app._projectResources.length,2,'unbind must not delete audio');
assert.equal(app.undo,2);
assert.equal(app.saved,2);
row.voice_audio_id='missing';ui.refresh();
assert.equal(ui.status.textContent,'voice_reference_missing');
assert.equal(ui.audio.hidden,true);
console.log('Character voice binding, unbinding, audition source, missing reference and undo checks passed.');
