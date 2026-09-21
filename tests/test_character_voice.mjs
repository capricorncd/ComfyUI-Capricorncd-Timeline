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
assert(!host.innerHTML.includes('data-voice-action="bind"'));
ui.refresh();
assert.equal(ui.audio.hidden,true);
ui.select.value='voice.wav';
ui.select.handlers.change();
assert.equal(row.voice_audio_id,'voice');
assert.equal(ui.audio.src,'/local/voice.wav');
assert.equal(ui.audio.hidden,false);
const replacement={id:'voice2',kind:'audio',file:'replacement.wav'};
app._projectResources.push(replacement);
app._ensureMedia=(kind,file)=>kind==='audio'?app._projectResources.find(r=>r.file===file):row;
ui.select.value='replacement.wav';
ui.select.handlers.change();
assert.equal(row.voice_audio_id,'voice2');
assert.equal(ui.audio.src,'/local/replacement.wav');
assert.equal(ui.select.value,'replacement.wav');
assert.equal(ui.select.children[0].disabled,true);
elements.get('[data-voice-action="unbind"]').handlers.click();
assert.equal(row.voice_audio_id,undefined);
assert.equal(ui.audio.hidden,true);
assert.equal(app._projectResources.length,3,'unbind must not delete audio');
assert.equal(app.undo,3);
assert.equal(app.saved,3);
row.voice_audio_id='missing';ui.refresh();
assert.equal(ui.status.textContent,'voice_reference_missing');
assert.equal(ui.audio.hidden,true);
console.log('Character voice binding, unbinding, audition source, missing reference and undo checks passed.');

row.voice_audio_id = 'voice';
ui.refresh();
assert.equal(ui.language.value, '');
ui.language.value = 'Chinese';
ui.language.handlers.change();
assert.equal(row.voice_language, 'Chinese');
ui.refresh();
assert.equal(ui.language.value, 'Chinese');
ui.language.value = '';
ui.language.handlers.change();
assert.equal(row.voice_language, undefined);
assert.equal(app.undo, 5);
assert.equal(app.saved, 5);
console.log('Character language: empty default, immediate save, restoration and clearing passed');

class Picker extends Element {
    constructor() { super(); this.fields = new Map(); this.style = {setProperty() {}}; }
    setAttribute() {}
    querySelector(key) {
        if (!this.fields.has(key)) this.fields.set(key, new Element());
        return this.fields.get(key);
    }
    showModal() { this.open = true; }
    close() { this.open = false; this.handlers.close(); }
    remove() { this.removed = true; }
}
let picker;
document.createElement = tag => tag === 'cap-dialog' ? (picker = new Picker()) : new Element();
app._overlay = {append() {}};
app._timeline = {pause() {}};
app._openMediaPreview = (file, kind) => { app.preview = {file, kind}; };
ui.openForAudioClip({src:'replacement.wav'});
assert.equal(picker.querySelector('select').children.length, 1, 'only visual assets are character candidates');
picker.querySelector('select').value = row.id;
const saves = app.saved;
picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(row.voice_audio_id, replacement.id);
assert.equal(app.saved, saves + 1);
assert.deepEqual(app.preview, {file:'girl.png', kind:'image'});
assert.equal(picker.removed, true);
ui.refresh();
assert.equal(ui.audio.src, '/local/replacement.wav', 'preview auditions the newly bound recording');
ui.openForAudioClip({src:'voice.wav'});
picker.querySelector('select').value = row.id;
app._projectResources = [row, reference, replacement];
picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(row.voice_audio_id, replacement.id, 'project switch must not bind a stale selection');
assert.equal(app.saved, saves + 1);
ui.openForAudioClip({src:'voice.wav'});
picker.querySelector('[data-action="close"]').handlers.click();
assert.equal(app.saved, saves + 1, 'cancel must not change the binding');
app._projectResources = [reference];
ui.openForAudioClip({src:'voice.wav'});
assert.equal(picker.querySelector('[data-action="bind"]').disabled, true);
assert.equal(picker.querySelector('[role="status"]').textContent, 'audio_bind_no_character');
console.log('Audio Clip character picker: binding, audition, cancellation, project switch and empty candidates passed.');
