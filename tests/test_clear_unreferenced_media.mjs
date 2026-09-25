import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const start = source.indexOf(`    ${name}(`);
    assert(start >= 0);
    return new Function(`return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}}).${name}`)();
}
const media = (id, kind = 'image', extra = {}) => ({id, kind, file: `${id}.${kind === 'image' ? 'png' : kind === 'audio' ? 'wav' : 'mp4'}`, ...extra});
const catalog = [media('used'), media('unused'), media('trim', 'video', {video_trim: {source_id:'original'}}),
    media('original', 'video', {video_trim: {source_id:'ancestor'}}), media('ancestor', 'video'),
    media('crop', 'image', {image_crop:{source_id:'crop-source'}}), media('crop-source'),
    media('shot'), media('character', 'image', {voice_audio_id:'voice'}), media('voice','audio'),
    media('generated','video'), media('edit-audio','audio'), media('speech','audio'),
    media('shot-plan','video',{video_shots:{source_id:'shot-source'}}), media('shot-source','video'),
    media('duplicate','image',{file:'used.png'})];
const clips = [{enabled:false, visible:false, media_ids:['used','trim','crop','shot-plan'], character_media_id:'character',
    generated_videos:[{file:'generated.mp4',enabled:false}], gen_edit_audios:[{file:'edit-audio.wav',muted:true}],
    generated_audios:[{file:'speech.wav',enabled:false}]}];
let undo = 0, saves = 0, renders = 0, closed = 0, snapshot;
const app = {
    _timeline:{}, _projectResources:catalog, _storyboards:[{image_id:'shot'}],
    _buildProject() { return {media:this._projectResources,tracks:[{enabled:false,locked:true,clips}]}; },
    _projectMediaUsage:method("_projectMediaUsage"),
    _unreferencedProjectMedia:method('_unreferencedProjectMedia'),
    _mediaBatchSelected:new Set(['image:unused.png','image:used.png']),
    _mediaBatchKey:(kind,file) => `${kind}:${file}`,
    _mediaStatus:new Map(), _videoThumbCache:new Map(),
    _recordUndo() { undo++; snapshot=structuredClone(this._projectResources); },
    _applyMediaCatalogFromProject(project) { this._projectResources=project.media; },
    _saveToWidgets() { saves++; }, _renderMediaGrid() { renders++; },
    _mediaPreviewState:{source:'library',items:[{kind:'image',file:'unused.png'}]},
    _closeMediaPreview() { closed++; this._mediaPreviewState=null; },
    _deleteDiskAsset() { throw Error('must not delete files'); },
};
const usage = app._projectMediaUsage();
assert(usage.used.has('image:used.png'));
assert(usage.referenced.has('video:original.mp4'));
assert(!usage.used.has('video:original.mp4'));
assert(!usage.referenced.has('image:unused.png'));
assert.deepEqual(app._unreferencedProjectMedia().map(row=>row.id), ['unused']);
method('_clearUnreferencedProjectMedia').call(app);
assert(!app._projectResources.some(row=>row.id==='unused'));
assert.equal(app._projectResources.length,catalog.length-1);
assert.deepEqual([undo,saves,renders,closed],[1,1,1,1]);
assert.deepEqual([...app._mediaBatchSelected],['image:used.png']);
method('_clearUnreferencedProjectMedia').call(app);
assert.equal(undo,1,'no-op does not add undo history');
app._projectResources=snapshot;
assert.deepEqual(app._projectResources,catalog,'undo snapshot restores all metadata and dependencies');
app._timeline=null;
assert.deepEqual(app._unreferencedProjectMedia(),[]);
console.log('Unreferenced media: disabled/locked clips, storyboards, voice, trim chains, crops, shot sources, generated media, duplicates, undo and no disk deletion passed');
