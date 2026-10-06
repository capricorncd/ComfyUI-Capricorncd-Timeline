import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const start = source.indexOf('    async _ensureGenVideoAudioBuffer(');
const load = new Function('mediaKindFromFilename', `return ({${source.slice(start, source.indexOf('\n    }', start) + 6)}})._ensureGenVideoAudioBuffer`)(
    file => file.endsWith('.mp4') ? 'video' : 'audio');
const urls = [];
const buffer = {duration: 10};
const app = {_genAudioBufferCache: new Map(),
    _assetFileUrl: (file, kind, location) => `${location}/${kind}/${file}`,
    _outputVideoUrl: file => `output/${file}`,
    async _fetchPeaks(url) { urls.push(url); return {buffer}; }};
assert.equal(await load.call(app, 'source.mp4', 'input'), buffer);
assert.equal(await load.call(app, 'voice.wav', 'input'), buffer);
assert.equal(await load.call(app, 'generated.mp4', 'output'), buffer);
assert.deepEqual(urls, ['input/video/source.mp4', 'input/audio/voice.wav', 'output/generated.mp4']);
await load.call(app, 'source.mp4', 'input');
assert.equal(urls.length, 3);
console.log('Reference video audio uses the video file endpoint; audio/output paths and buffer caching remain correct.');
