import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _applyGenEditChanges() {');
const apply = new Function('return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '})._applyGenEditChanges;')();
const code = readFileSync(new URL('../js/editor/ReferenceTimeline.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace(/^export /gm, '');
const referenceTimeline = new Function(code + '; return referenceTimeline;')();

for (const stored of [false, true]) {
    const catalog = [{id:'v',kind:'video',file:'video.mp4'}, {id:'a',kind:'audio',file:'audio.wav'},
        {id:'p',kind:'image',file:'picture.png'}];
    const meta = {items:structuredClone(catalog), mediaIds:['v','a','p']};
    const clip = {id:'clip',duration:10,track:{locked:false}};
    let undos = 0, saves = 0, refreshes = 0;
    const app = {_ensureClipMeta:()=>meta, _clipItems:m=>m.items, _findMediaById:id=>catalog.find(row=>row.id===id),
        _findClipById:()=>clip, _normalizeGenEditAudioDraft:structuredClone,
        _recordUndo:()=>undos++, _saveToWidgets:()=>saves++, _scheduleProgramPreview(){},
        _syncClipPrimaryAppearance(){}, _refreshClipResourceViews:()=>refreshes++};
    const refs = referenceTimeline(app,clip);
    if (stored) meta.referenceTimeline = structuredClone(refs);
    app._genEditState = {reference:true,clipId:clip.id,draft:[],audioDraft:refs.audios};
    apply.call(app);
    assert.deepEqual(meta.mediaIds,['a','p']);
    assert.equal(referenceTimeline(app,clip).videos.length,0,'Removed references do not reappear on reload');
    app._genEditState.audioDraft = [];
    apply.call(app);
    assert.deepEqual(meta.mediaIds,['p']);
    assert.equal(referenceTimeline(app,clip).audios.length,0);
    assert.equal(catalog.length,3,'The global library is unchanged');
    assert.equal(undos,1); assert.equal(saves,2); assert.equal(refreshes,2);

    meta.items.unshift(catalog[0]); meta.mediaIds.unshift('v');
    meta.referenceTimeline.videos = [{id:'part1',media_id:'v',file:'video.mp4'},
        {id:'part2',media_id:'v',file:'video.mp4'}];
    app._genEditState.draft = [meta.referenceTimeline.videos[1]];
    apply.call(app);
    assert.deepEqual(meta.mediaIds,['v','p'],'Retain the asset while another split segment uses it');
    assert.equal(meta.referenceTimeline.videos[0].id,'part2');
    app._genEditState.draft = [];
    apply.call(app);
    assert.deepEqual(meta.mediaIds,['p'],'Remove the asset after its last segment is removed');
}
console.log('Reference removal synchronizes Clip assets, retains split references and leaves the global library unchanged.');
