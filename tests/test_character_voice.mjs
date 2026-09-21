import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/editor/CharacterVoice.js', import.meta.url), 'utf8');
const CharacterVoice = new Function('T', source.replace(/^import .*;\r?\n/gm, '').replace('export class', 'class') + '; return CharacterVoice;')(key => key);
class Element {
    setAttribute(key, value) { this[key] = value; }
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
const excerpt = {id:'excerpt', kind:'audio', file:'excerpt.wav'};
app._extractAudioFromMedia = async (file, options) => {
    assert.equal(options.durationSec, 2);
    assert.deepEqual(options.mix, [{file, location:'input', trim_in_sec:3, duration_sec:2, playback_rate:1.5}]);
    return excerpt.file;
};
const ensureMedia = app._ensureMedia;
app._ensureMedia = (kind, file) => {
    if (file !== excerpt.file) return ensureMedia(kind, file);
    if (!app._projectResources.includes(excerpt)) app._projectResources.push(excerpt);
    return excerpt;
};
app._imgUrl = file => '/images/' + file;
app._getVideoThumbnail = async file => '/thumbnails/' + file;
app._getMediaMeta = (kind, file) => ({mediaType: file === 'girl.png' ? 'character' : file === 'prop.png' ? 'prop' : file === 'scene.mp4' ? 'scene' : ''});
app._timeline = {pause() {}};
app._openMediaPreview = (file, kind) => { app.preview = {file, kind}; };
ui.openForAudioClip({duration:2, sourceOffset:3, playbackRate:1.5, src:'replacement.wav'});
assert.equal(picker.querySelector('select').children.length, 1, 'only visual assets are character candidates');
picker.querySelector('select').value = row.id;
const saves = app.saved;
await picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(row.voice_audio_id, excerpt.id);
assert.equal(app.saved, saves + 1);
assert.deepEqual(app.preview, {file:'girl.png', kind:'image'});
assert.equal(picker.removed, true);
ui.refresh();
assert.equal(ui.audio.src, '/local/excerpt.wav', 'preview auditions the newly bound recording');
ui.openForAudioClip({duration:2, sourceOffset:3, playbackRate:1.5, src:'voice.wav'});
picker.querySelector('select').value = row.id;
app._projectResources = [row, reference, replacement];
await picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(row.voice_audio_id, excerpt.id, 'project switch must not bind a stale selection');
assert.equal(app.saved, saves + 1);
ui.openForAudioClip({duration:2, sourceOffset:3, playbackRate:1.5, src:'voice.wav'});
picker.querySelector('[data-action="close"]').handlers.click();
assert.equal(app.saved, saves + 1, 'cancel must not change the binding');
app._projectResources = [reference];
ui.openForAudioClip({duration:2, sourceOffset:3, playbackRate:1.5, src:'voice.wav'});
assert.equal(picker.querySelector('[data-action="bind"]').disabled, true);
assert.equal(picker.querySelector('[role="status"]').textContent, 'audio_bind_empty_category');
console.log('Audio Clip character picker: binding, audition, cancellation, project switch and empty candidates passed.');

app._projectResources = [row, reference, {id:'prop', kind:'image', file:'prop.png'}, {id:'scene', kind:'video', file:'scene.mp4'}, {id:'other', kind:'image', file:'unknown.png'}];
ui.openForAudioClip({duration:2, sourceOffset:3, playbackRate:1.5, src:'voice.wav'});
assert.equal(picker.querySelector('select').value, 'character');
assert.equal(picker.querySelector('.cat-te-bind-character-preview').children[0].src, '/images/girl.png');
for (const type of ['prop', 'scene', 'other', 'character']) {
    picker.querySelector(`[data-type="${type}"]`).handlers.click();
    assert.equal(picker.querySelector('select').value, type);
    assert.equal(picker.querySelector('select').children.length, 1);
    assert.equal(picker.querySelector(`[data-type="${type}"]`)['aria-selected'], 'true');
    assert.equal(picker.querySelector('[data-action="bind"]').disabled, false);
}
picker.querySelector('[data-type="prop"]').handlers.click();
assert.equal(picker.querySelector('.cat-te-bind-character-preview').children[0].src, '/images/prop.png');
await picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(app._projectResources.find(r => r.id === 'prop').voice_audio_id, excerpt.id);
assert.deepEqual(app.preview, {file:'prop.png', kind:'image'});
console.log('Asset tabs: category filtering, default character, uncategorized assets and binding passed.');

app._extractAudioFromMedia = async () => { throw new Error('Extraction failed'); };
ui.openForAudioClip({src:'voice.wav', duration:2});
const beforeFailure = app.saved;
await picker.querySelector('[data-action="bind"]').handlers.click();
assert.equal(app.saved, beforeFailure);
assert.equal(picker.open, true);
assert.equal(picker.querySelector('[role="status"]').textContent, 'Extraction failed');
assert.equal(picker.querySelector('[data-action="bind"]').disabled, false);
console.log('Trimmed reference extraction: offset, duration, speed, separate asset and failure handling passed.');
