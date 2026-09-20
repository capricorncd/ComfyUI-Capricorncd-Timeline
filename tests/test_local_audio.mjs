import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name) {
    const begin = source.search(new RegExp('    (async )?' + name + '\\('));
    return new Function('genAudioUid', 'isVoiceoverTrackType', 'isDirectorTrackType', 'T', 'return ({' + source.slice(begin, source.indexOf('\n    }', begin) + 6) + '}).' + name)(
        () => 'cleaned', type => type === 'voiceover', type => type === 'image', key => key);
}
const insert = method('_insertDenoisedAudio');
const clip = { id: 'clip', track: { type: 'image' } };
const original = { id: 'original', file: 'old.mp4', muted: false };
const state = { draft: [original], audioDraft: [] };
const app = { _genEditState: state, _applyGenEditChanges() {}, _buildGenEditTimeline() {}, _syncGenEditInspector() {}, _scheduleGenEditPreview() {} };
assert(await insert.call(app, clip, { state, videoId: 'original', start: 3 }, { file: 'clean.wav', duration_sec: 5 }, () => true));
assert.equal(state.audioDraft[0].edit_start_sec, 3);
assert.equal(state.audioDraft[0].duration, 5);
assert.equal(original.muted, true);
assert.equal(original.file, 'old.mp4');
assert.equal(await insert.call(app, clip, { state: {}, videoId: 'original', start: 3 }, { file: 'unused.wav' }, () => true), false);
let added;
const meta = {};
const main = { _addAudioAtTime: async (...args) => { added = args; }, _ensureClipMeta: () => meta,
    _decorateClip() {}, _saveToWidgets() {}, _scheduleProgramPreview() {} };
assert(await insert.call(main, { track: { type: 'audio' } }, { start: 8, source: {} }, { file: 'clean.wav', duration_sec: 20 }, () => true));
assert.equal(added[1], 8);
assert.equal(meta.muted, true);
const sources = method('_clipDenoiseSources');
const context = { _ensureClipMeta: () => ({}), _clipGeneratedAudios: () => [{ id: 'a', file: 'song.wav', trim_in_sec: 2, trim_out_sec: 8, enabled: true }] };
assert.deepEqual(sources.call(context, { track: { type: 'image' }, src: 'video.mp4', hasAudio: true }), []);
assert.equal(sources.call(context, { track: { type: 'video' }, src: 'video.mp4', hasAudio: true, sourceOffset: 2, duration: 3, playbackRate: 2 })[0].playback_rate, 2);
assert.equal(sources.call(context, { track: { type: 'voiceover' }, duration: 10 })[0].duration_sec, 6);

const uiSource = readFileSync(new URL('../js/editor/LocalAudioJobs.js', import.meta.url), 'utf8');
class Element {
    constructor() { this.fields = new Map(); this.children = []; this.handlers = {}; this.parentElement = { firstChild: {} }; this.options = []; }
    setAttribute() {}
    append(child) { this.children.push(child); }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    configure(totalFrames) { this.totalFrames = this.endFrame = totalFrames; this.startFrame = 0; }
    update(frame, playing) { this.currentFrame = frame; this.playing = playing; }
    async play() { this.paused = false; }
    querySelector(key) { if (!this.fields.has(key)) this.fields.set(key, new Element()); return this.fields.get(key); }
    set innerHTML(value) { this.fields.clear(); }
    showModal() { this.open = true; }
    close() { this.open = false; }
    reportValidity() { return true; }
    pause() { this.paused = true; }
    load() {}
    removeAttribute(name) { delete this[name]; }
}
const storage = new Map();
const LocalAudioJobs = new Function('document', 'T', 'setTimeout', 'api', 'localStorage', 'AudioOptions', uiSource.slice(uiSource.indexOf('export class')).replace('export class', 'class') + '; return LocalAudioJobs;')(
    { createElement: () => new Element() }, key => key, callback => callback(), { apiURL: path => path },
    { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    class { setModel() {} values() { return {}; } });
async function music(stale = false, failure = false) {
    const target = { id: 'voice', name: 'music', duration: 1200.25, track: {} };
    const calls = [], attached = [];
    const application = {
        _timeline: { pause() {} }, _projectResources: [], _findClipById: () => target,
        _ensureClipMeta: () => ({ prompt: '[Verse] lyrics', stylePrompt: 'piano' }),
        _addGeneratedAudiosToClip: (...args) => attached.push(args),
    };
    const ui = new LocalAudioJobs(application, { append() {} });
    ui.request = async (path, payload) => {
        calls.push([path, payload]);
        if (path === 'start') {
            if (stale) application._projectResources = [];
            return { id: 'job', status: failure ? 'failed' : 'succeeded', error: failure ? 'Worker error' : null };
        }
        return { files: [{ file: 'bgm.wav', duration_sec: 12 }] };
    };
    ui.open(target);
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(calls[0][1].lyrics, '[Verse] lyrics');
    assert.equal(calls[0][1].style, 'piano');
    assert.equal(calls[0][1].max_duration, 1200.25);
    assert.equal(attached.length, stale || failure ? 0 : 1);
    if (attached.length) assert.equal(attached[0][0], target);
    assert.equal(ui.busy, false);
    assert.equal(ui.dialog.closeDisabled, false);
}
await music();
await music(true);
await music(false, true);
for (const scope of ['clip', 'full']) {
    const target = { id: 'voice', track: {}, duration: 2 };
    let submitted, inserted;
    const application = { _timeline: { pause() {} }, _projectResources: [], _findClipById: () => target,
        _ensureClipMeta: () => ({}), _insertDenoisedAudio: async (...args) => { inserted = args; return true; } };
    const ui = new LocalAudioJobs(application, { append() {} });
    ui.request = async (path, data) => {
        if (path === 'start') { submitted = data; return { id: 'job', status: 'succeeded' }; }
        return { files: [{ file: 'clean.wav', duration_sec: scope === 'full' ? 20 : 2 }] };
    };
    ui.open(target, { start: 7, sources: [{ file: 'source.mp4', location: 'input', trim_in_sec: 4, duration_sec: 2, playback_rate: 1 }] });
    ui.dialog.querySelector('[data-scope]').value = scope;
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(submitted.scope, scope);
    assert.equal(submitted.trim_in_sec, 4);
    assert.equal(inserted[1].start, 7);
    assert.equal(inserted[2].duration_sec, scope === 'full' ? 20 : 2);
}
console.log('Local audio UI: BGM, full/clip denoising, track placement, original muting and stale target passed');

for (const kind of ['sfx', 'separation']) {
    const target = { id: 'voice', name: 'clip', track: {}, duration: 40 };
    let payload;
    const attached = [];
    const app = { _timeline: { pause() {} }, _projectResources: [], _findClipById: () => target,
        _ensureClipMeta: () => ({ prompt: 'rain', seed: 42 }),
        _addGeneratedAudiosToClip: (clip, files) => attached.push(...files),
        _insertDenoisedAudio: async (clip, context, file) => { assert.equal(context.start, 7); attached.push(file); return true; } };
    const ui = new LocalAudioJobs(app, { append() {} });
    const files = kind === 'sfx' ? [{ file: 'effect.wav' }] : [{ file: 'speaker_1.wav' }, { file: 'speaker_2.wav' }];
    ui.request = async (path, data) => {
        if (path === 'start') { payload = data; return { id: 'job', status: 'succeeded' }; }
        return { files };
    };
    ui.open(target, kind === 'sfx' ? null : { start: 7, sources: [{file: 'audio.wav', location: 'input', duration_sec: 2}] }, kind);
    if (kind === 'sfx') {
        assert.equal(ui.dialog.querySelector('[data-duration]').value, 40);
        ui.dialog.querySelector('[data-lyrics]').value = 'wind';
    }
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(payload.kind, kind);
    if (kind === 'sfx') { assert.equal(payload.prompt, 'wind'); assert.equal(payload.seconds, 40); }
    assert.deepEqual(attached, files);
}
console.log('SFX prompt editing/binding and two-speaker insertion passed');

const subtitles = [{ id: 'late', startTime: 7, track: {} }, { id: 'early', startTime: 2, track: {} }];
const subtitleMeta = { late: { text: 'Second\nline' }, early: { text: 'First' } };
let speechArgs;
const speechApp = { _findMediaById: () => null, _ensureClipMeta: clip => subtitleMeta[clip.id], _findClipById: id => subtitles.find(clip => clip.id === id),
    _localAudioJobs: { open: (...args) => { speechArgs = args; } } };
method('_openLocalSubtitleSpeech').call(speechApp, subtitles);
assert.equal(speechArgs[2], 'tts');
assert.equal(speechArgs[3].text, 'First\nSecond line');
assert.equal(speechArgs[3].start, 2);
assert(speechArgs[3].valid());
subtitleMeta.late.text = 'Changed';
assert.equal(speechArgs[3].valid(), false);
const character = { id: 'character', voice_audio_id: 'reference', voice_language: 'Chinese' };
speechApp._findMediaById = id => id === 'character' ? character : id === 'reference' ? { kind: 'audio', file: 'character.wav' } : null;
subtitleMeta.early.characterMediaId = 'character';
subtitleMeta.late.characterMediaId = 'character';
method('_openLocalSubtitleSpeech').call(speechApp, subtitles);
assert.equal(speechArgs[3].reference, 'character.wav');
assert.equal(speechArgs[3].language, 'Chinese');
subtitleMeta.late.characterMediaId = 'other';
assert.equal(speechArgs[3].valid(), false);
method('_openLocalSubtitleSpeech').call(speechApp, subtitles);
assert.equal(speechArgs[3].reference, '', 'Do not apply one character to a mixed-character selection');


for (const kind of ['tts', 'vc']) {
    const target = { id: 'target', track: {}, duration: 2 };
    let submitted;
    const inserted = [];
    const app = { _timeline: { pause() {} }, _projectResources: [], _findClipById: () => target,
        _ensureClipMeta: () => ({}), _addAudioAtTime: async (...args) => inserted.push(args),
        _insertDenoisedAudio: async (...args) => { inserted.push(args); return true; } };
    const ui = new LocalAudioJobs(app, { append() {} });
    ui.request = async (path, data) => {
        if (path.startsWith('voices')) return [{id: 'vivian', vc_available: true, preview_url: '/v1/voices/vivian/audio', description: 'Bright voice'}];
        if (path === 'start') { submitted = data; return { id: 'job', status: 'succeeded' }; }
        return { files: [{file: 'speech.wav', duration_sec: 3}] };
    };
    ui.open(target, kind === 'vc' ? {start: 5, sources: [{file: 'video.mp4', duration_sec: 2}]} : null, kind,
        { text: 'First\nSecond', start: 5, valid: () => true });
    ui.dialog.querySelector('[data-voice]').value = 'vivian';
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(submitted.kind, kind);
    assert.equal(submitted.speaker, 'vivian');
    assert.equal(inserted.length, 1);
    if (kind === 'tts') { assert.equal(submitted.text, 'First\nSecond'); assert.equal(submitted.max_duration, undefined); assert.equal(inserted[0][1], 5); }
}
console.log('Subtitle ordering/single submission, stale subtitle guard and VC routing passed');

{
    const target = { id: 'subtitle', track: {}, duration: 2 };
    const recording = { src: 'reference.mp3', name: 'Renamed voice' };
    const application = { _timeline: { pause() {}, tracks: [{ clips: [recording] }] },
        _projectResources: [{ kind: 'audio', file: 'reference.mp3', name: 'Original name' }, { kind: 'video', file: 'reference.mp4' }],
        _findClipById: () => target, _ensureClipMeta: () => ({}),
        _audioUrl: file => '/audio/' + file, _videoUrl: file => '/video/' + file };
    const ui = new LocalAudioJobs(application, { append() {} });
    let submitted;
    ui.request = async (path, payload) => {
        if (path.startsWith('voices')) throw new Error('Bearer API Key required');
        submitted = payload;
        throw new Error('Bearer API Key required');
    };
    const speech = { text: 'Hello', start: 0, valid: () => true };
    ui.open(target, null, 'tts', speech);
    const reference = ui.dialog.querySelector('[data-reference]');
    assert.equal(reference.children[0].textContent, 'Renamed voice');
    assert.equal(reference.children[0].value, 'reference.mp3');
    const preview = ui.dialog.querySelector('[data-reference-preview]');
    const trim = ui.dialog.querySelector('[data-reference-trim]');
    const range = ui.dialog.querySelector('[data-reference-range]');
    assert.equal(trim.hidden, true);
    reference.value = 'reference.mp3';
    reference.onchange();
    assert.equal(trim.hidden, false);
    assert.equal(preview.src, '/audio/reference.mp3');
    preview.paused = false;
    reference.value = 'reference.mp4';
    reference.onchange();
    assert.equal(preview.paused, true);
    assert.equal(preview.src, '/video/reference.mp4');
    reference.value = '';
    reference.onchange();
    assert.equal(trim.hidden, true);
    assert.equal(preview.src, undefined);
    reference.value = 'reference.mp3';
    reference.onchange();
    preview.paused = false;
    ui.stopPreview();
    assert.equal(preview.paused, true);
    await Promise.resolve();
    await Promise.resolve();
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(submitted, undefined, 'Do not send an unloaded reference');
    assert.equal(ui.dialog.querySelector('[role="status"]').textContent, 'local_voice_trim_not_ready');
    preview.duration = 12;
    preview.onloadedmetadata();
    assert.equal(range.endFrame, 12000);
    range.startFrame = 2000;
    range.endFrame = 4500;
    range.handlers.rangechange({ detail: { frame: 2000 } });
    assert.equal(preview.currentTime, 2);
    await range.handlers.toggleplay();
    assert.equal(preview.paused, false);
    preview.currentTime = 4.5;
    preview.ontimeupdate();
    assert.equal(preview.paused, true);
    assert.equal(preview.currentTime, 2);
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(submitted.reference_file, 'reference.mp3');
    assert.equal(submitted.reference_start_sec, 2);
    assert.equal(submitted.reference_end_sec, 4.5);
    assert.equal(ui.dialog.querySelector('[role="status"]').textContent, 'Bearer API Key required');
    assert.equal(ui.dialog.querySelector('[data-submit]').disabled, false);
    assert.equal(ui.busy, false);
    recording.name = 'Updated voice';
    ui.open(target, null, 'tts', speech);
    assert.equal(ui.dialog.querySelector('[data-reference]').children[0].textContent, 'Updated voice');
    await Promise.resolve();
    await Promise.resolve();
    submitted = null;
    speech.valid = () => false;
    await ui.dialog.querySelector('[data-submit]').onclick();
    assert.equal(submitted, null);
    assert.equal(ui.dialog.querySelector('[role="status"]').textContent, 'local_audio_target_changed');
}
console.log('Reference clip titles, original file submission and visible failure feedback passed');

{
    storage.clear();
    const target = { id: 'subtitle', track: {} };
    const application = { _timeline: { pause() {} }, _projectResources: [{ kind: 'audio', file: 'voice.wav' }],
        _findClipById: () => target, _ensureClipMeta: () => ({}), _audioUrl: file => '/audio/' + file };
    const speech = { text: 'Hello', start: 0, valid: () => true };
    const open = async () => {
        const ui = new LocalAudioJobs(application, { append() {} });
        ui.request = async () => [{ id: 'first' }, { id: 'last' }];
        ui.open(target, null, 'tts', speech);
        await Promise.resolve();
        return ui.dialog;
    };
    let dialog = await open();
    const voice = dialog.querySelector('[data-voice]');
    voice.value = 'last';
    voice.handlers.change();
    const language = dialog.querySelector('[data-language]');
    language.value = 'Chinese';
    language.onchange();
    const reference = dialog.querySelector('[data-reference]');
    reference.value = 'voice.wav';
    reference.onchange();
    reference.handlers.change();
    const preview = dialog.querySelector('[data-reference-preview]');
    preview.duration = 10;
    preview.onloadedmetadata();
    const range = dialog.querySelector('[data-reference-range]');
    range.startFrame = 2000;
    range.endFrame = 6000;
    range.handlers.rangechange({ detail: { frame: 2000 } });
    dialog = await open();
    assert.equal(dialog.querySelector('[data-voice]').value, 'last');
    assert.equal(dialog.querySelector('[data-language]').value, 'Chinese');
    assert.equal(dialog.querySelector('[data-reference]').value, 'voice.wav');
    const restoredPreview = dialog.querySelector('[data-reference-preview]');
    restoredPreview.duration = 5;
    restoredPreview.onloadedmetadata();
    const restoredRange = dialog.querySelector('[data-reference-range]');
    assert.equal(restoredRange.startFrame, 2000);
    assert.equal(restoredRange.endFrame, 5000, 'Clamp saved trim to the current recording duration');
    assert.equal(restoredPreview.currentTime, 2);
    restoredPreview.duration = 1;
    restoredPreview.onloadedmetadata();
    assert.equal(restoredRange.startFrame, 0, 'Discard trim whose start is outside the recording');
    assert.equal(restoredRange.endFrame, 1000);
    application._projectResources.push({ kind: 'audio', file: 'character.wav' });
    speech.reference = 'character.wav';
    speech.language = 'Japanese';
    dialog = await open();
    assert.equal(dialog.querySelector('[data-reference]').value, 'character.wav');
    assert.equal(dialog.querySelector('[data-language]').value, 'Japanese');
    assert.equal(dialog.querySelector('[data-reference-preview]').src, '/audio/character.wav');
    assert.equal(dialog.querySelector('[data-voice]').disabled, true);
    delete speech.reference;
    delete speech.language;
    application._projectResources = [];
    dialog = await open();
    assert.equal(dialog.querySelector('[data-reference]').value, '');
    assert.equal(dialog.querySelector('[data-reference-trim]').hidden, true);
    storage.set('cap_timeline_tts_defaults', JSON.stringify({ speaker: 'removed' }));
    dialog = await open();
    assert.equal(dialog.querySelector('[data-voice]').value, 'first');
    assert.equal(dialog.querySelector('[data-language]').value, 'Auto');
    storage.set('cap_timeline_tts_defaults', '{broken');
    dialog = await open();
    assert.equal(dialog.querySelector('[data-voice]').value, 'first');
    storage.clear();
}
console.log('TTS preferences survive new dialogs, restore reference trims and handle missing or shortened media');

const directorContext = {
    _ensureClipMeta: () => ({}),
    _collectGeneratedVideoAudioJobs: () => [
        { file: 'generated.mp4', location: 'output', tin: 2, absStart: 11, absEnd: 16, volume: 0.5 },
        { file: 'detached.wav', location: 'input', tin: 3, absStart: 12, absEnd: 16, volume: 1, volumePoints: [{ source_ms: 3000, gain: 0.5 }] },
    ],
};
const directorSources = sources.call(directorContext, { track: { type: 'image' }, startTime: 10, duration: 10 }, true);
assert.equal(directorSources.length, 1);
assert.equal(directorSources[0].duration_sec, 10);
assert.equal(directorSources[0].mix.length, 2);
assert.equal(directorSources[0].mix[0].edit_start_sec, 1);
assert.equal(directorSources[0].mix[0].trim_in_sec, 2);
assert.equal(directorSources[0].mix[0].volume, 0.5);
assert.equal(directorSources[0].mix[1].location, 'input');
console.log('Director processing submits one timeline mix with offsets and volume');
