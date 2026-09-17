import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({
  resolve(specifier, context, next) {
    if (specifier.includes('i18n/timeline_widget.js')) {
      return {url:'data:text/javascript,export const t = key => key;',shortCircuit:true};
    }
    return next(specifier, context);
  },
});
const { AudioEnvelope, migrateAudioFades, normalizeVolumePoints, volumeAt } = await import('../js/timeline/AudioEnvelope.js');

const points = migrateAudioFades([], 2, 5, 1, 2);
assert.deepEqual(points, [
  {source_ms:2000,gain:0}, {source_ms:3000,gain:1},
  {source_ms:5000,gain:1}, {source_ms:7000,gain:0},
]);
assert.equal(volumeAt(points, 2500), 0.5);
assert.equal(volumeAt(points, 6000), 0.5);
assert.deepEqual(migrateAudioFades(points, 2, 5, 0, 0), points);
assert.deepEqual(normalizeVolumePoints(JSON.parse(JSON.stringify(points))), points);
const overlapping = migrateAudioFades([], 0, 2, 2, 2);
assert.equal(volumeAt(overlapping, 1000), 1);
assert.equal(volumeAt(overlapping, 1500), 0.5);

class Element {
  constructor() { this.children=[]; this.handlers={}; this.dataset={}; this.classList={add(){}}; }
  setAttribute(k,v) { if(k==='data-point') this.dataset.point=v; this[k]=v; }
  appendChild(el) { this.children.push(el); }
  replaceChildren() { this.children=[]; }
  addEventListener(k,fn) { this.handlers[k]=fn; }
  removeEventListener(k) { delete this.handlers[k]; }
  getBoundingClientRect() { return {left:0,top:0,width:500,height:100}; }
}
globalThis.document={createElementNS:()=>new Element(),documentElement:new Element()};
globalThis.window=new Element();
const events=[];
const timeline={pixelsPerSecond:100,selectClip(){},emit:(name)=>events.push(name)};
const clip={sourceOffset:2,duration:5,track:{timeline,locked:false}};
const envelope=new AudioEnvelope(clip,new Element());
assert.equal(envelope.svg.children[0].points, '0,50 1000,50');
const event=(x,y,target={dataset:{}})=>({button:0,clientX:x,clientY:y,target,stopPropagation(){},preventDefault(){}});
envelope.svg.handlers.dblclick(event(250,50));
assert.equal(envelope.points.length,3);
assert.equal(envelope.selected.source_ms,4500);
envelope.svg.handlers.mousedown(event(250,50,{dataset:{point:'1'}}));
window.handlers.mousemove(event(250,43.5));
assert.equal(envelope.selected.gain,1.52);
assert(envelope.svg.children.some(el=>el.class==='tl-volume-guide'));
window.handlers.mousemove(event(250,0));
assert.equal(envelope.selected.gain,5);
window.handlers.mousemove(event(250,100));
assert.equal(envelope.selected.gain,0);
window.handlers.mousemove(event(250,49));
assert.equal(envelope.selected.gain,1);
window.handlers.mouseup(event(250,49));
assert.equal(envelope.deleteSelected(),true);
assert.equal(envelope.points.length,2);
assert.equal(envelope.deleteSelected(),false);
clip.track.locked=true;
envelope.svg.handlers.dblclick(event(200,50));
assert.equal(envelope.points.length,2);
assert.equal(events.filter(e=>e==='clip:volumeend').length,3);
envelope.points=[{source_ms:2000,gain:0},{source_ms:7000,gain:5}];
envelope.render();
assert.equal(envelope.svg.children[0].points,'0,100 0,100 200,50 1000,0 1000,0');
console.log('Audio envelope migration, serialization and interaction tests passed');

const { Clip } = await import('../js/timeline/Clip.js');
const wave = { _waveform: [0.2, 1], sourceOffset: 2, duration: 2, playbackRate: 1,
  _visibleWavePeaks: () => [0.2, 1], _waveBarCount: () => 2, audioEnvelope: { points: [] } };
const svg = new Element();
Clip.prototype._paintWaveform.call(wave, svg);
const barHeight = () => -Number(svg.children[0].children[0].d.match(/^M0\.5,1v([^M]+)/)[1]);
const originalHeight = barHeight();
wave.audioEnvelope.points = [{ source_ms: 2000, gain: 2 }, { source_ms: 4000, gain: 2 }];
Clip.prototype._paintWaveform.call(wave, svg);
assert(barHeight() > originalHeight, 'boosted audio must have taller waveform bars');
wave.audioEnvelope.points = [{ source_ms: 2000, gain: 0 }];
Clip.prototype._paintWaveform.call(wave, svg);
assert(barHeight() === 0, 'silence must sit on the baseline');

const overview = { _waveform: [0, 0.8, 0, 0], sourceDuration: 4, sourceOffset: 0, duration: 4, playbackRate: 1 };
assert.deepEqual(Clip.prototype._visibleWavePeaks.call(overview, 8), [0, 0, 0.8, 0.8, 0, 0, 0, 0]);
assert.deepEqual(Clip.prototype._visibleWavePeaks.call(overview, 2), [0.8, 0]);
assert.equal(Clip.prototype._waveBarCount.call({duration: 60, track: {timeline: {pixelsPerSecond: 40}}}), 1200);
