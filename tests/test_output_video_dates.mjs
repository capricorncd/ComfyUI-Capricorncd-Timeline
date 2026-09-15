import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
const rangesStart = source.indexOf('const OUTPUT_VIDEOS_TIME_RANGES =');
const ranges = new Function('T', source.slice(rangesStart, source.indexOf('\n];', rangesStart) + 3) + '; return OUTPUT_VIDEOS_TIME_RANGES;')(key => key);
const begin = source.indexOf('        const range = OUTPUT_VIDEOS_TIME_RANGES.find', source.indexOf('    _renderOutputVideosPicker()'));
const end = source.indexOf('        this.outputVideosBody.replaceChildren();', begin);
const filter = new Function('OUTPUT_VIDEOS_TIME_RANGES', 'q', source.slice(begin, end) + 'return { rows };');
const timestamp = date => new Date(date).getTime() / 1000;
const files = [
    ['before.mp4', '2026-03-07T23:59:59'],
    ['start.mp4', '2026-03-08T00:00:00'],
    ['end.mp4', '2026-03-08T23:59:59.999'],
    ['after.mp4', '2026-03-09T00:00:00'],
].map(([file, date]) => ({ file, mtime: timestamp(date) }));
function select(date, range = 'custom', q = '', ascending = false) {
    const app = {
        _outputVideosTimeRange: range, _outputVideosCache: files, _outputVideosSortAscending: ascending,
        outputVideosDate: { value: date }, outputVideosDateRange: {},
    };
    const result = filter.call(app, ranges, q);
    assert.equal(app.outputVideosDateRange.hidden, range !== 'custom');
    return { ...result, names: result.rows.map(row => row.file) };
}
assert.deepEqual(select('2026-03-08').names, ['end.mp4', 'start.mp4']);
assert.deepEqual(select('2026-03-08', 'custom', '', true).names, ['start.mp4', 'end.mp4']);
assert.equal(select('').rows.length, 0);
assert.deepEqual(select('2026-03-08', 'custom', 'end').names, ['end.mp4']);
assert.deepEqual(ranges.map(range => range.id), ['1h', '4h', '1d', 'older', 'custom']);
const originalNow = Date.now;
Date.now = () => (files[1].mtime + 24 * 3600) * 1000;
try {
    assert.deepEqual(select('', 'older').names, ['before.mp4']);
    assert.deepEqual(select('', '1d').names, ['after.mp4', 'end.mp4', 'start.mp4']);
} finally {
    Date.now = originalNow;
}
assert.deepEqual(files.map(row => row.file), ['before.mp4', 'start.mp4', 'end.mp4', 'after.mp4'], 'Sorting must not mutate the shared cache');
const shiftStart = source.indexOf('    _shiftOutputVideoDate(days)');
const shift = new Function('return ({' + source.slice(shiftStart, source.indexOf('\n    }', shiftStart) + 6) + '})._shiftOutputVideoDate')();
for (const [date, days, expected] of [
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-03-09', -1, '2026-03-08'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2025-12-31', 1, '2026-01-01'],
    ['2024-03-01', -1, '2024-02-29'],
]) {
    const app = { outputVideosDate: { value: date } };
    shift.call(app, days);
    assert.equal(app.outputVideosDate.value, expected);
}
const app = { outputVideosDate: { value: '2000-01-01' } };
shift.call(app, 0);
const today = new Date();
assert.equal(app.outputVideosDate.value, `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
console.log('Output dates: local day bounds, sorting, older filter, today default and calendar navigation passed');
