import { bindDragSession, clamp } from './utils.js';

export function normalizeVolumePoints(points) {
  const byTime = new Map();
  for (const p of Array.isArray(points) ? points : []) {
    if (!Number.isFinite(p?.source_ms) || !Number.isFinite(p?.gain)) continue;
    byTime.set(Math.max(0, p.source_ms), clamp(p.gain, 0, 2));
  }
  return [...byTime].sort((a, b) => a[0] - b[0]).map(([source_ms, gain]) => ({ source_ms, gain }));
}

export function volumeAt(points, ms) {
  if (!points.length) return 1;
  if (ms <= points[0].source_ms) return points[0].gain;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (ms <= b.source_ms) return a.gain + (b.gain - a.gain) * (ms - a.source_ms) / (b.source_ms - a.source_ms);
  }
  return points.at(-1).gain;
}

export function migrateAudioFades(points, offset, duration, fadeIn, fadeOut) {
  const envelope = normalizeVolumePoints(points);
  if (!(fadeIn > 0 || fadeOut > 0) || duration <= 0) return envelope;
  const scale = Math.min(1, duration / (fadeIn + fadeOut));
  fadeIn *= scale;
  fadeOut *= scale;
  const start = offset * 1000, end = (offset + duration) * 1000;
  const times = new Set([start, end, start + fadeIn * 1000, end - fadeOut * 1000]);
  for (const p of envelope) if (p.source_ms >= start && p.source_ms <= end) times.add(p.source_ms);
  // The product of an existing curve and a fade is quadratic.
  if (envelope.length) for (let ms = start; ms < end; ms += 10) times.add(ms);
  const result = envelope.filter(p => p.source_ms < start || p.source_ms > end);
  for (const ms of times) {
    const t = (ms - start) / 1000;
    const fade = Math.min(1, fadeIn > 0 ? t / fadeIn : 1, fadeOut > 0 ? (duration - t) / fadeOut : 1);
    result.push({source_ms: ms, gain: volumeAt(envelope, ms) * Math.max(0, fade)});
  }
  return normalizeVolumePoints(result);
}

export class AudioEnvelope {
  constructor(clip, host) {
    this.clip = clip;
    this.points = [];
    this.selected = null;
    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('tl-volume-envelope');
    this.svg.setAttribute('viewBox', '0 0 1000 100');
    this.svg.setAttribute('preserveAspectRatio', 'none');
    host.appendChild(this.svg);
    this.svg.addEventListener('dblclick', e => {
      e.stopPropagation(); e.preventDefault();
      if (clip.track.locked || e.target.dataset.point != null) return;
      const r = this.svg.getBoundingClientRect();
      const ms = Math.round((clip.sourceOffset + clamp((e.clientX-r.left)/r.width, 0, 1) * clip.duration) * 1000);
      this.begin();
      if (!this.points.length) this.points = [{source_ms: clip.sourceOffset*1000, gain:1}, {source_ms:(clip.sourceOffset+clip.duration)*1000, gain:1}];
      const point = {source_ms:ms, gain:volumeAt(this.points, ms)};
      this.points = normalizeVolumePoints([...this.points, point]);
      this.selected = this.points.find(p => p.source_ms === ms);
      this.finish();
    });
    this.svg.addEventListener('mousedown', e => {
      if (e.button !== 0) return;
      e.stopPropagation(); e.preventDefault();
      if (clip.track.locked) return;
      clip.track.timeline.selectClip(clip);
      const index = e.target.dataset.point;
      if (index == null) return;
      this.selected = this.points[Number(index)];
      const point = this.selected;
      this.render();
      const r = this.svg.getBoundingClientRect();
      let changed = false;
      bindDragSession(e, { onMove: ev => {
        if (clip.track.locked) return;
        if (!changed && Math.hypot(ev.clientX-e.clientX, ev.clientY-e.clientY)<3) return;
        if (!changed) { this.begin(); changed = true; }
        let gain = clamp(2*(1-(ev.clientY-r.top)/r.height), 0, 2);
        const levels = [1, ...this.points.filter(p=>p!==point).map(p=>p.gain)];
        const nearest = levels.reduce((a,b)=>Math.abs(b-gain)<Math.abs(a-gain)?b:a);
        if (Math.abs(nearest-gain)*r.height/2 <= 5) gain=nearest;
        point.gain = Math.round(gain*1000)/1000;
        const i=this.points.indexOf(point);
        const min = Math.max(clip.sourceOffset*1000, i ? this.points[i-1].source_ms+1 : 0);
        const max = Math.min((clip.sourceOffset+clip.duration)*1000, i+1<this.points.length ? this.points[i+1].source_ms-1 : Infinity);
        if (min<=max) point.source_ms=clamp(Math.round((clip.sourceOffset+(ev.clientX-r.left)/r.width*clip.duration)*1000),min,max);
        this.render(point.gain);
      }, onEnd: () => { if(changed) this.finish(); else this.render(); } });
    });
    this.render();
  }
  begin() { this.clip.track.timeline.emit('clip:volumestart', {clip:this.clip}); }
  finish() { this.render(); this.clip.track.timeline.emit('clip:volumeend', {clip:this.clip}); }
  deleteSelected() {
    if (!this.selected) return false;
    if (!this.clip.track.locked) {
      this.begin(); this.points=this.points.filter(p=>p!==this.selected); this.selected=null; this.finish();
    }
    return true;
  }
  render(guide=null) {
    const c=this.clip, start=c.sourceOffset*1000, end=(c.sourceOffset+c.duration)*1000;
    const x=ms=>(ms-start)/(end-start)*1000, y=g=>(2-g)*50;
    const visible=this.points.filter(p=>p.source_ms>=start&&p.source_ms<=end);
    const path=[{source_ms:start,gain:volumeAt(this.points,start)},...visible,{source_ms:end,gain:volumeAt(this.points,end)}];
    this.svg.replaceChildren();
    const add=(tag,attrs)=>{ const el=document.createElementNS(this.svg.namespaceURI,tag); for(const [k,v] of Object.entries(attrs))el.setAttribute(k,String(v));this.svg.appendChild(el);return el; };
    add('polyline',{points:path.map(p=>`${x(p.source_ms)},${y(p.gain)}`).join(' '),class:'tl-volume-line'});
    add('polyline',{points:path.map(p=>`${x(p.source_ms)},${y(p.gain)}`).join(' '),class:'tl-volume-hit'});
    if(guide!==null) add('line',{x1:0,x2:1000,y1:y(guide),y2:y(guide),class:'tl-volume-guide'});
    for(const p of visible){
      const rect=this.svg.getBoundingClientRect();
      const dot=add('ellipse',{cx:x(p.source_ms),cy:y(p.gain),rx:5000/Math.max(1,rect.width||c.duration*c.track.timeline.pixelsPerSecond),ry:500/Math.max(1,rect.height||50),class:`tl-volume-point${p===this.selected?' selected':''}`,'data-point':this.points.indexOf(p)});
      const title=document.createElementNS(this.svg.namespaceURI,'title');title.textContent=`${Math.round(p.gain*100)}%`;dot.appendChild(title);
    }
  }
}
