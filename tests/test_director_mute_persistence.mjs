import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier, context, next) {
    if (specifier.includes('i18n/timeline_widget.js')) return {url: 'data:text/javascript,export const t = key => key;', shortCircuit: true};
    return next(specifier, context);
}});
const { normalizeVolumePoints, migrateAudioFades, volumeAt } = await import('../js/timeline/AudioEnvelope.js');

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const globals = {
    isSubtitleTrackType: () => false, isVoiceoverTrackType: () => false, isMediaTrackType: () => false,
    encodeClipTimingMs: (start, duration) => ({ startMs: start * 1000, durationMs: duration * 1000 }),
    decodeClipTimingSecs: (start, duration) => ({ startTime: start / 1000, duration: duration / 1000 }),
    normalizeClipVolume: value => value ?? 1, normalizePromptIncludes: () => [],
    defaultImageMeta: () => ({}), restoreH3ClipTiming: row => row,
    clipItemsFromLegacy: () => [],
    defaultAudioMeta: () => ({}), normalizePlaybackRate: value => value || 1,
    normalizeVolumePoints, migrateAudioFades, volumeAt,
    promptIncludesFromClipJson: () => [], mediaFlagAt: (flags, index) => flags[index] !== false,
    T: key => key, DEFAULT_CLIP_NAME: 'Director', SETTING_PROMPT_KEYS: [], PY_SCALAR_DEFAULTS: {},
};
function method(name) {
    const start = source.search(new RegExp('    (async )?' + name + '\\('));
    const end = start + source.slice(start).search(/\n    }\r?\n/) + 6;
    return new Function(...Object.keys(globals), 'return ({' + source.slice(start, end) + '}).' + name)(...Object.values(globals));
}
for (const kind of [null, 'image', 'video']) {
    for (const muted of [true, false, undefined]) {
        const items = kind ? [{ id: 'media', kind, file: 'source.' + (kind === 'video' ? 'mp4' : 'png') }] : [];
        const clip = { id: 'director', name: 'Director', startTime: 0, duration: 8 };
        const track = { id: 'track', type: 'image', clips: [clip] };
        const app = {
            _timeline: { tracks: [track], getZoom: () => 1 }, _trackInfo: new Map(),
            _meta: new Map([[clip.id, { muted, items }]]), getFps: () => 24, _trackIndex: () => 0,
            _normalizeVisualMeta() {}, _clipItems: meta => meta.items, _canChangeClipSpeed: () => false,
            _clampH3MotionContextLength: () => 0, _normalizeClipSeed: () => 42,
            _clipGeneratedVideos: () => [], _normalizeGenEditAudioDraft: () => [],
            _currentVersion: () => 1, _currentSchemaVersion: () => 1, _serializeMediaCatalog: () => items, _w: () => null,
            _jsonClipMediaRows: () => items, _resolveTrackForClip: () => track,
            _addRestoredClip: (target, data) => data, _imgUrl: file => file,
            _generatedVideosFromJson: () => [], _previewModeFromJson: () => 'generated',
            _decorateClip() {}, _syncClipPrimaryAppearance() {},
        };
        const saved = JSON.parse(JSON.stringify(method('_buildProject').call(app)));
        assert.equal(saved.tracks[0].clips[0].muted, !!muted);
        const [row] = method('_clipsFromProjectTracks').call(app, saved, 24);
        app._meta.clear();
        await method('_addClipFromJson').call(app, row);
        assert.equal(app._meta.get(clip.id).muted, !!muted, `Restore ${kind || 'empty'} director mute`);
        delete row.muted;
        await method('_addClipFromJson').call(app, row);
        assert.equal(app._meta.get(clip.id).muted, false, 'Old projects default to unmuted');
    }
}
console.log('Director mute survives project JSON save and restore for empty, image and video source clips');

{
    const clip = { id: 'audio', name: '旁白：第一句', src: 'folder/original.wav', startTime: 2, duration: 5 };
    const track = { id: 'audio-track', type: 'audio', clips: [clip] };
    const media = { id: 'recording', file: clip.src, kind: 'audio' };
    let restored;
    const app = {
        _timeline: { tracks: [track], getZoom: () => 1 }, _trackInfo: new Map(),
        _meta: new Map([[clip.id, { mediaId: media.id, volume: 2,
            volumePoints: [{source_ms: 0, gain: 1.5}, {source_ms: 5000, gain: 1.5}] }]]), getFps: () => 24, _trackIndex: () => 0,
        _findMediaById: () => media, _canChangeClipSpeed: () => true,
        _currentVersion: () => 1, _currentSchemaVersion: () => 1, _serializeMediaCatalog: () => [media], _w: () => null,
        _jsonClipMediaRows: () => [media], _resolveTrackForClip: () => track,
        _addRestoredClip: (target, data) => (restored = data), _audioUrl: file => file,
        _fetchPeaks: async () => ({ peaks: [[]] }), _decorateClip() {},
    };
    const saved = JSON.parse(JSON.stringify(method('_buildProject').call(app)));
    assert.equal(saved.tracks[0].clips[0].name, clip.name);
    const [row] = method('_clipsFromProjectTracks').call(app, saved, 24);
    await method('_addClipFromJson').call(app, row);
    assert.equal(restored.name, clip.name);
    assert.equal(restored.src, clip.src, 'Renaming the clip must not change its media source');
    const restoredMeta = app._meta.get(clip.id);
    assert.equal(restoredMeta.volume, 2, '200% volume survives reload');
    assert.equal(restored.waveformVolume, 2, 'restored waveform uses saved amplification');
    assert.deepEqual(restoredMeta.volumePoints, saved.tracks[0].clips[0].volume_points);
    const gains = [];
    const gainNode = {gain: {cancelScheduledValues() {},
        setValueAtTime: value => gains.push(value), linearRampToValueAtTime: value => gains.push(value)}};
    method('_scheduleAudioFadeGain').call(app, gainNode, 0, 0, 5, 0, 0, 5,
        restoredMeta.volume, restoredMeta.volumePoints);
    assert.ok(gains.length >= 2);
    assert.ok(gains.every(value => value === 3), 'restored volume and envelope schedule 300% playback gain');
    gains.length = 0;
    Object.assign(restored, {startTime: 2, endTime: 7, duration: 5, sourceOffset: 0, track});
    Object.assign(app, {
        _stopAudioPlayback() {}, _collectAudibleClips: () => [restored],
        _ensurePlaybackContext: () => ({currentTime: 0, destination: {},
            createBufferSource: () => ({playbackRate: {}, connect() {}, start() {}}),
            createGain: () => ({...gainNode, connect() {}})}),
        _scheduleGeneratedVideoWebAudio() {}, _scheduleAudioFadeGain: method('_scheduleAudioFadeGain'),
    });
    app._timeline.currentTime = 0;
    method('_startAudioPlayback').call(app);
    assert.ok(gains.length >= 2 && gains.every(value => value === 3), 'timeline playback applies restored amplification');
    gains.length = 0;
    restoredMeta.volume = 3.86;
    restoredMeta.volumePoints = [];
    method('_startAudioPlayback').call(app);
    assert.deepEqual(gains, [3.86], '386% without envelope reaches the playback gain unchanged');
    delete row.name;
    await method('_addClipFromJson').call(app, row);
    assert.equal(restored.name, 'original.wav', 'Older clips without titles use the filename');
}
console.log('Renamed audio titles survive project JSON save and restore without changing source files');
