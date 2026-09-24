import { getRulerInterval } from './utils.js';

export class TimeRuler {
  constructor(timeline) {
    this.timeline = timeline;
    this.height = 34;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'tl-ruler';
    this.canvas.height = this.height;
    this._setupEvents();
  }

  get el() { return this.canvas; }

  _setupEvents() {
    this.canvas.addEventListener('mousedown', (e) => {
      this.timeline._beginSeekScrub(e);
    });
  }

  render() {
    const tl = this.timeline;
    const pps = tl.pixelsPerSecond;
    const scrollLeft = tl.scrollEl.scrollLeft;
    const viewWidth = tl.scrollEl.clientWidth || tl.scrollEl.offsetWidth;

    if (viewWidth <= 0) return;

    this.canvas.width = viewWidth;
    const ctx = this.canvas.getContext('2d');
    const W = viewWidth, H = this.height;
    const style = getComputedStyle(this.canvas);
    const surface = style.getPropertyValue('--cat-surface').trim() || '#192226';
    const raised = style.getPropertyValue('--cat-raised').trim() || '#202c31';
    const muted = style.getPropertyValue('--cat-muted').trim() || '#a3b5b8';
    const border = style.getPropertyValue('--cat-border').trim() || '#34464b';

    // Background gradient
    const bg = ctx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, raised);
    bg.addColorStop(1, surface);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    const { major, minor } = getRulerInterval(pps);
    const startTime = scrollLeft / pps;
    const endTime = (scrollLeft + viewWidth) / pps;

    // Minor ticks
    const minorStart = Math.floor(startTime / minor) * minor;
    for (let t = minorStart; t <= endTime + minor; t = +(t + minor).toFixed(10)) {
      if (t < 0) continue;
      const x = Math.round(t * pps - scrollLeft) + 0.5;
      const isMajor = Math.round(t / major) * major === Math.round(t * 1e6) / 1e6
        || Math.abs(t % major) < minor * 0.01
        || Math.abs(t % major - major) < minor * 0.01;

      ctx.strokeStyle = isMajor ? muted : border;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? H * 0.35 : H * 0.65);
      ctx.lineTo(x, H);
      ctx.stroke();

      if (isMajor) {
        ctx.fillStyle = muted;
        ctx.font = `${parseFloat(style.fontSize) * 10 / 12}px "SF Mono", "Fira Mono", monospace`;
        ctx.fillText(this.timeline.formatTime(t), x + 3, H * 0.35 - 2);
      }
    }

    // Bottom border line
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, H - 0.5);
    ctx.lineTo(W, H - 0.5);
    ctx.stroke();
  }
}
