export class PlayHead {
  constructor(timeline) {
    this.timeline = timeline;
    this.el = this._build();
  }

  _build() {
    const el = document.createElement('div');
    el.className = 'tl-playhead';

    const head = document.createElement('div');
    head.className = 'tl-playhead-head';

    const line = document.createElement('div');
    line.className = 'tl-playhead-line';

    el.appendChild(head);
    el.appendChild(line);

    head.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.timeline._beginSeekScrub(e);
    });

    return el;
  }

  update() {
    const x = this.timeline.currentTime * this.timeline.pixelsPerSecond;
    this.el.style.transform = `translateX(${x}px)`;
  }
}
