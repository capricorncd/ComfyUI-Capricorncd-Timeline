import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const source = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const start = source.indexOf('export const formatTime =');
const end = source.indexOf('\n};', start) + 3;
const formatTime = new Function(source.slice(start, end).replace('export ', '') + '; return formatTime;')();

const duration = (137 + 4 / 24) - (127 + 4 / 24);
assert.equal(Math.round(duration * 24), 240);
assert.equal(formatTime(duration, 24), '0:10.00');
assert.equal(formatTime(239 / 24, 24), '0:09.23');
assert.equal(formatTime(60 - 1e-12, 24), '1:00.00');
assert.equal(formatTime(3600 - 1e-12, 24), '60:00.00');
for (const fps of [24, 25, 30, 60, 120]) {
    for (const frames of [0, 1, fps - 1, fps, 60 * fps - 1, 60 * fps]) {
        const text = formatTime(frames / fps - 1e-12, fps);
        const [minutes, seconds, remainder] = text.split(/[:.]/).map(Number);
        assert(remainder < fps);
        assert.equal((minutes * 60 + seconds) * fps + remainder, frames);
    }
}
assert.equal(formatTime(9.9999), '0:10.000');
assert.equal(formatTime(59.9999), '1:00.000');
console.log('Timeline time formatting carries frame and millisecond boundaries correctly.');
