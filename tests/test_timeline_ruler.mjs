import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const utils = readFileSync(new URL('../js/timeline/utils.js', import.meta.url), 'utf8');
const intervalStart = utils.indexOf('export function getRulerInterval');
const intervalEnd = utils.indexOf('\n/** Generate', intervalStart);
const getRulerInterval = new Function(utils.slice(intervalStart, intervalEnd).replace('export ', '') + '; return getRulerInterval;')();
const formatStart = utils.indexOf('export const formatTime');
const formatEnd = utils.indexOf('\n};', formatStart) + 3;
const formatTime = new Function(utils.slice(formatStart, formatEnd).replace('export ', '') + '; return formatTime;')();
const rulerSource = readFileSync(new URL('../js/timeline/TimeRuler.js', import.meta.url), 'utf8');
const TimeRuler = new Function('getRulerInterval', rulerSource.replace(/^import .*;\r?\n/, '').replace('export class', 'class') + '; return TimeRuler;')(getRulerInterval);

for (const fps of [24, 25, 30, 60, 120]) {
  for (const pps of [5, 50, 150, 500, 2500, 10000]) {
    const interval = getRulerInterval(pps, fps);
    assert(interval.minorFrames >= 1);
    assert(Number.isInteger(interval.minorFrames));
    assert.equal(interval.majorFrames % interval.minorFrames, 0);
    assert(Math.abs(interval.minor * fps - interval.minorFrames) < 1e-8);
  }
}
assert.deepEqual(getRulerInterval(2500), { major: 0.05, minor: 0.01 });

const ticks = [], labels = [];
const ctx = {
  createLinearGradient: () => ({ addColorStop() {} }), fillRect() {},
  beginPath() {}, moveTo(x, y) { if (y < 30) ticks.push(x); }, lineTo() {}, stroke() {},
  fillText(text, x) { labels.push({ text, x }); },
};
globalThis.document = { createElement: () => ({ style: {}, addEventListener() {}, getContext: () => ctx }) };
globalThis.getComputedStyle = () => ({ fontSize: '12px', getPropertyValue: () => '' });
const pps = 2500, inset = 12, origin = 14.85 * pps;
const timeline = { fps: 24, timeFormat: 'frames', pixelsPerSecond: pps, startInset: inset,
  scrollEl: { scrollLeft: origin + inset, clientWidth: 700, offsetWidth: 717 },
  formatTime: t => formatTime(t, 24) };
const ruler = new TimeRuler(timeline);
ruler.render();
const previous = labels.find(l => l.text === '0:14.23');
const next = labels.find(l => l.text === '0:15.00');
assert(previous && next);
assert(!ticks.some(x => x > previous.x - 3 && x < next.x - 3), 'No ticks between adjacent frames');
assert.equal(next.x - 3, Math.round(15 * pps - origin) + 0.5);
assert.equal(ruler.canvas.style.width, '700px');
assert.equal(ruler.canvas.width, 700);
console.log('Ruler ticks align to whole frames, including 14.23 → 15.00 at 24 fps.');
