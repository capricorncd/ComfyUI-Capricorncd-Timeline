import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/editor/ClipExport.js', import.meta.url), 'utf8');
class Element {
    constructor() { this.fields = new Map(); this.value = ''; }
    setAttribute() {}
    append() {}
    querySelector(key) {
        if (!this.fields.has(key)) this.fields.set(key, new Element());
        return this.fields.get(key);
    }
    setStatus(text, state) { this.textContent = text; this.state = state; }
    showModal() { this.open = true; }
    close() { this.open = false; }
}
const requests = [];
let fail = false;
const api = { async fetchApi(path, options) {
    requests.push([path, JSON.parse(options.body)]);
    return { ok: !fail, json: async () => fail ? { error: 'Failed to encode' }
        : { filename: 'clip.mp4', subfolder: 'cap_clip_exports', outputs: [{ filename: 'clip.mp4', subfolder: 'cap_clip_exports' }] } };
} };
const { clipExportProject, ClipExport } = new Function('api', 'T', 'document', source.slice(source.indexOf('export function'))
    .replaceAll('export function', 'function').replaceAll('export class', 'class') + ';return {clipExportProject, ClipExport};')(
    api, key => key, { createElement: () => new Element() });
const audio = { id: 'audio', name: 'Voice', start_ms: 10000, duration_ms: 2500, media_ids: ['sound'],
    source: { in_ms: 3000 }, volume: 0.5, playback_rate: 2, volume_points: [{ source_ms: 3000, gain: 0.2 }] };
const project = { name: 'Project', settings: { fps: 24, width: 1280, height: 720 },
    media: [{ id: 'sound', kind: 'audio' }, { id: 'movie', kind: 'video' }, { id: 'picture', kind: 'image' }],
    tracks: [{ type: 'audio', muted: true, enabled: false, clips: [audio, { ...audio, id: 'other' }] },
        { type: 'director', clips: [{ id: 'director', start_ms: 20000, duration_ms: 3000,
            generated_videos: [{ file: 'clip.mp4', trim_in_sec: 1, trim_out_sec: 2, edit_start_sec: 0.5 }],
            gen_edit_audios: [{ file: 'sound.wav', source_offset: 2, duration: 1, edit_start_sec: 1 }] }] },
        { type: 'media', clips: [{ id: 'video', media_ids: ['movie'], duration_ms: 5000 }, { id: 'image', media_ids: ['picture'] }] },
        { type: 'voiceover', clips: [{ id: 'voiceover', duration_ms: 4000, generated_audios: [{ file: 'voice.wav' }] }] },
        { type: 'subtitle', clips: [{ id: 'subtitle' }] }, { type: 'director', clips: [{ id: 'empty' }] }] };
const snapshot = structuredClone(project);
const selected = clipExportProject(project, 'audio');
assert.equal(selected.audio, true);
assert.equal(selected.duration, 2.5);
assert.equal(selected.project.tracks.length, 1);
assert.equal(selected.project.tracks[0].clips.length, 1);
assert.equal(selected.project.tracks[0].clips[0].start_ms, 0);
assert.deepEqual(selected.project.tracks[0].clips[0].source, { in_ms: 3000 });
assert.equal(selected.project.tracks[0].clips[0].playback_rate, 2);
assert.equal(selected.project.tracks[0].muted, false);
for (const id of ['director', 'video']) assert.equal(clipExportProject(project, id).audio, false);
assert.equal(clipExportProject(project, 'voiceover').audio, true);
for (const id of ['image', 'subtitle', 'empty', 'missing']) assert.equal(clipExportProject(project, id), null);
assert.deepEqual(clipExportProject(project, 'director').project.tracks[0].clips[0].gen_edit_audios,
    project.tracks[1].clips[0].gen_edit_audios);
assert.deepEqual(project, snapshot);

const ui = new ClipExport(new Element());
ui.open(project, 'audio');
const field = key => ui.dialog.querySelector(key);
field('[data-format]').value = 'wav';
await field('[data-export]').onclick();
const [path, payload] = requests.at(-1);
assert.equal(path, '/audio_keyframe_timeline/compose_video');
assert.equal(payload.export_video, false);
assert.equal(payload.export_audio, true);
assert.deepEqual(payload.export_range, { start_frame: 0, end_frame: 60 });
assert.equal(payload.project.tracks[0].clips[0].id, 'audio');
assert.equal(field('cap-status-message').state, 'success');
assert.equal(ui.dialog.closeDisabled, false);
await field('[data-folder-open]').onclick();
assert.equal(requests.at(-1)[0], '/audio_keyframe_timeline/reveal_output');
ui.open(project, 'director');
assert.equal(field('[data-video]').checked, true);
assert.equal(field('[data-audio]').checked, false);
fail = true;
await field('[data-export]').onclick();
assert.equal(field('cap-status-message').state, 'error');
assert.equal(ui.busy, false);
console.log('Clip export: isolated project, exact range, formats, unsupported clips, source preservation and feedback passed');

const appSource = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const begin = appSource.indexOf('    _exportGenEditClip(');
const exportTrim = new Function('return ({' + appSource.slice(begin, appSource.indexOf('\n    }', begin) + 6) + '})._exportGenEditClip')();
let trimResult;
const app = { _genEditState: { timeline: { pause() {} }, audioMap: new Map([['trim-audio', 'row']]), clipMap: new Map(),
    audioDraft: [{ id: 'row', file: 'audio.wav', source_offset: 2, duration: 1, volume: 0.7, volume_points: [] }], draft: [] },
    _pullGenEditDraftFromTimeline() {}, _buildProject: () => structuredClone(project),
    _clipExport: { open(project, id) { trimResult = clipExportProject(project, id); } } };
exportTrim.call(app, { id: 'trim-audio', duration: 1, name: 'Trim audio' });
assert.equal(trimResult.audio, true);
assert.equal(trimResult.duration, 1);
assert.equal(trimResult.project.tracks[0].clips[0].source.in_ms, 2000);
assert.equal(trimResult.project.tracks[0].clips[0].volume, 0.7);
console.log('Trim-window audio exports only its own source range');
