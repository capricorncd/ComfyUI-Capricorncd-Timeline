import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const classes = ['sub-apply-all', 'media-primary-action', 'clip-swiper-nav', 'clip-thumb-sort',
    'clip-thumb-delete', 'clip-seed-random', 'ai-optimize-btn', 'clip-videos-open', 'vo-audio-add', 'vo-audio-edit'];
for (const name of classes) {
    const tags = [...source.matchAll(/<([\w-]+)\b[^>]*class="([^"]*)"[^>]*>/g)]
        .filter(match => match[2].split(' ').includes('cat-te-' + name));
    assert(tags.length, name + ' exists');
    assert(tags.every(match => match[1] === 'cap-button'), name + ' uses shared button');
}
assert.match(source, /actionBtn\.setAttribute\("variant", this\._mediaBatchMode \? "danger" : "neutral"\)/);
assert.match(source, /actionBtn\.disabled = this\._mediaBatchMode && selectedCount === 0/);
assert.match(source, /bind\(this.subApplyAllBtn, "click", \(\) => this\._applySubtitleStyleToAllUnlocked\(\)\)/);

// The migrated style-copy action still copies only styles, skips locked tracks and records one undo.
const start = source.indexOf('    _applySubtitleStyleToAllUnlocked()');
const action = new Function('isSubtitleTrackType', 'pickSubtitleStyle', 'T',
    'return ({' + source.slice(start, source.indexOf('\n    }', start) + 6) + '})._applySubtitleStyleToAllUnlocked')(
        type => type === 'subtitle', meta => ({font_size: meta.font_size, color: meta.color}), key => key);
const tracks = [false, false, true].map((locked, i) => ({
    id: 'track' + i, type: 'subtitle', locked,
    clips: [{id: 'clip' + i, startTime: i * 3, duration: 3}],
}));
tracks.forEach(track => track.clips[0].track = track);
const meta = new Map(tracks.map((track, i) => [track.clips[0].id, {text: 'line' + i, font_size: i ? 20 : 40, color: i ? '#fff' : '#abc'}]));
let undo = 0, saves = 0, previews = 0;
const app = {
    _selClip: tracks[0].clips[0], _meta: meta, _trackInfo: new Map(),
    _ensureClipMeta: clip => meta.get(clip.id), _allTextTracks: () => tracks,
    _recordUndo() { undo++; }, _decorateClip() {},
    _saveToWidgets() { saves++; }, _scheduleProgramPreview() { previews++; },
};
action.call(app);
assert.deepEqual(meta.get('clip1'), {text:'line1', font_size:40, color:'#abc'});
assert.deepEqual(meta.get('clip2'), {text:'line2', font_size:20, color:'#fff'});
assert.equal(tracks[1].clips[0].startTime, 3);
assert.equal(tracks[1].clips[0].duration, 3);
assert(!app._trackInfo.has('track2'));
assert.equal(undo, 1); assert.equal(saves, 1); assert.equal(previews, 1);
app._selClip = null; action.call(app); assert.equal(undo, 1);
console.log('Sidebar buttons: component coverage, add/delete state, subtitle styles, locks and undo passed');
