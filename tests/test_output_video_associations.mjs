import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    _renderOutputVideosPicker() {');
const end = source.indexOf('\n    _previewOutputAudioFile(', start);
class Element {
    constructor() {
        this.children = [];
        this.dataset = {};
        this.handlers = {};
        this.classes = new Set();
        this.classList = {add: name => this.classes.add(name)};
    }
    append(...items) { this.children.push(...items); }
    appendChild(item) { this.children.push(item); }
    replaceChildren() { this.children = []; }
    setAttribute() {}
    addEventListener(name, handler) { this.handlers[name] = handler; }
}
const render = new Function('document', 'IntersectionObserver', 'normalizeOutputVideoPath', 'OUTPUT_VIDEOS_TIME_RANGES', 'T', 'durationText', 'iconHtml',
    `return ({${source.slice(start, end)}})._renderOutputVideosPicker`)(
    {createElement: () => new Element()}, class {observe() {} disconnect() {}},
    file => file.replaceAll('\\', '/').replace(/^output\//, ''), [{id: '1d', hours: 24}], key => key, String, () => '');
const first = {id: 'first'}, second = {id: 'second'};
const app = {
    _outputPickerKind: 'video', _outputVideosClipId: first.id,
    _timeline: {tracks: [{clips: [first]}, {clips: [second], enabled: false}]},
    _meta: new Map([[first.id, {videos: [{file: 'output/current.mp4'}]}],
        [second.id, {videos: [{file: 'folder\\other.mp4', enabled: false}]}]]),
    _outputVideosCache: ['current.mp4', 'folder/other.mp4', 'new.mp4'].map(file => ({file, mtime: Date.now() / 1000, duration_sec: 5})),
    outputVideosBody: new Element(),
    _findClipById: id => id === first.id ? first : second,
    _ensureClipMeta(clip) { return this._meta.get(clip.id); },
    _clipGeneratedVideos: meta => meta?.videos || [],
    _clipGeneratedAudios: meta => meta?.audios || [],
    _hideOutputVideoHoverPreview() {}, _syncOutputVideosPickerTitle() {},
    _isOutputPickerClip: () => true,
    _addGeneratedVideosToClip(clip, files) { this._meta.get(clip.id).videos.push(...files.map(file => ({file}))); return true; },
};
render.call(app);
const [current, other, fresh] = app.outputVideosBody.children;
assert(current.classes.has('is-added'));
assert(current.classes.has('is-current-clip'));
assert(other.classes.has('is-added'), 'Disabled association on another track still counts');
assert(!other.classes.has('is-current-clip'));
assert(!fresh.classes.has('is-added'));
fresh.children[2].handlers.click();
assert(fresh.classes.has('is-added'));
assert(fresh.classes.has('is-current-clip'), 'Adding immediately highlights the current association');
app._outputVideosClipId = second.id;
render.call(app);
assert(!app.outputVideosBody.children[0].classes.has('is-current-clip'));
assert(app.outputVideosBody.children[1].classes.has('is-current-clip'));
app._outputPickerKind = 'audio';
render.call(app);
assert(app.outputVideosBody.children.every(row => !row.classes.has('is-added') && !row.classes.has('is-current-clip')), 'Audio picker retains its own association scope');
console.log('Output video associations: project scope, current Clip, normalized paths, disabled records, add and selection passed');
