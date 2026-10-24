import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _replaceMediaReference(');
const replace = new Function('isDirectorTrackType', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._replaceMediaReference`)(type => type === 'image');
for (const type of ['image', 'video']) {
    const media = {id: 'media', kind: 'video', file: 'old.mp4', prompt: 'Old description', setting_description: 'Old description', generation_prompt: 'Old prompt'};
    const duplicate = {id: 'duplicate', kind: 'video', file: 'new.mp4'};
    const clip = {id: 'clip', duration: 12, sourceOffset: 0, playbackRate: 1, _applyPosition() {}};
    const edits = {edit_start_sec: 2, trim_in_sec: 3, trim_out_sec: 9, playback_rate: 0.5,
        scale: 1.3, offset_x: 0.2, muted: false, volume: 0.7};
    const meta = {items: [{id: 'media', kind: 'video', file: 'old.mp4'}],
        referenceTimeline: {videos: [{id: 'ref_media', media_id: 'media', file: 'old.mp4', ...edits},
            {id: 'ref_duplicate', media_id: 'duplicate', file: 'new.mp4', ...edits}], audios: []}};
    let probes = 0;
    const app = {_timeline: {tracks: [{type, clips: [clip]}]}, _meta: new Map([['clip', meta]]),
        _projectResources: [media, duplicate], _recordUndo() {},
        _findMedia: (kind, file) => media.file === file ? media : duplicate.file === file ? duplicate : null,
        _clipItems: () => [{id: media.id, kind: media.kind, file: media.file}],
        _normalizeVisualMeta() {}, _syncClipPrimaryAppearance() {}, _videoUrl: file => file,
        async _probeVideoDuration() {probes++; return 5;}, _refreshTimelineDuration() {},
        _swapMediaListEntry() {}, _writeMediaMeta() {}, _getMediaMeta: () => ({})};
    replace.call(app, 'old.mp4', 'new.mp4', 'video', true, {setting_description: type === 'image' ? 'New description' : '', generation_prompt: 'New prompt'});
    await Promise.resolve();
    assert.equal(media.file, 'new.mp4');
    assert.equal(media.setting_description, type === 'image' ? 'New description' : '');
    assert.equal(media.prompt, media.setting_description, 'legacy description cannot restore old content');
    assert.equal(media.generation_prompt, 'New prompt');
    assert.equal(clip.duration, type === 'image' ? 12 : 5);
    assert.equal(probes, type === 'image' ? 0 : 1);
    assert.equal(app._projectResources.length, 1);
    for (const reference of meta.referenceTimeline.videos) {
        assert.equal(reference.media_id, 'media');
        assert.equal(reference.file, 'new.mp4');
        for (const [name, value] of Object.entries(edits)) assert.equal(reference[name], value);
    }
}

const regenerateStart = source.indexOf('    async _regenerateCroppedMedia(');
const regenerate = new Function('api', `return ({${source.slice(regenerateStart, source.indexOf('\n    }', regenerateStart) + 6)}})._regenerateCroppedMedia`)(
    {fetchApi: async (url, request) => {
        requests.push({url, payload: JSON.parse(request.body)});
        return {ok: true, json: async () => ({file: `new-crop-${requests.length}.${requests.length === 1 ? 'png' : 'mp4'}`})};
    }},
);
const requests = [];
for (const kind of ['image', 'video']) {
    const original = {id: 'source', kind, file: `old.${kind === 'image' ? 'png' : 'mp4'}`};
    const crop = {id: 'crop', kind, file: `old-crop.${kind === 'image' ? 'png' : 'mp4'}`,
        ...(kind === 'image' ? {image_crop: {source_id: 'source', rect: {x: 0.1, y: 0.2, width: 0.5, height: 0.6}, ratio: 'custom'}}
            : {video_trim: {source_id: 'source', start: 2, duration: 3, rate: 1.5}})};
    const app = {_projectResources: [original, crop, {id: 'unrelated', kind, image_crop: {source_id: 'other'}}],
        _findMedia: (type, file) => type === kind && file === original.file ? original : null,
        assetsDirInput: {value: 'assets'}};
    const uploaded = {kind, file: `new.${kind === 'image' ? 'png' : 'mp4'}`, location: 'input'};
    const result = await regenerate.call(app, {kind, file: original.file}, uploaded);
    assert.deepEqual(result, [{row: crop, file: `new-crop-${requests.length}.${kind === 'image' ? 'png' : 'mp4'}`}]);
    assert.equal(crop.file.startsWith('old-crop'), true, 'generation does not mutate references');
    assert.equal(requests.at(-1).payload.file, uploaded.file);
    assert.equal(requests.at(-1).url, `/audio_keyframe_timeline/${kind === 'image' ? 'crop_image' : 'trim_video'}`);
    if (kind === 'image') assert.deepEqual(requests.at(-1).payload.rect, crop.image_crop.rect);
    else assert.deepEqual(requests.at(-1).payload, {file: uploaded.file, location: 'input', start: 2, duration: 3, rate: 1.5});
}
console.log('Media replacement and cropped derivative regeneration passed.');
