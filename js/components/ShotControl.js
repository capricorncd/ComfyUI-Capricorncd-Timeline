import "./Button.js";
import { formatTimecode } from "../timecode.js";

export function shotPrompt(points) {
    const shots = [...points].sort((a, b) => a.time - b.time);
    return shots.length ? 'detailed_description:\n' + shots.map((point, index) => `[Shot ${index + 1}] ${point.description.trim()}`).join('\n') : '';
}

export class ShotControl extends HTMLElement {
    constructor() {
        super();
        this.points = [];
        this.start = this.end = 0;
        this.fps = 24;
        this.selected = null;
        this.attachShadow({mode: 'open'}).innerHTML = `
            <style>
                :host { display: block; min-width: 0; }
                .toolbar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                .actions { margin-left: auto; }
                .track { position: relative; margin: 8px 14px; padding-bottom: 30px; }
                input { width: 100%; margin: 0; accent-color: var(--cat-accent, #64d8c5); }
                .markers { position: relative; }
                .markers cap-button { position: absolute; transform: translateX(-50%); }
                textarea { box-sizing: border-box; width: 100%; min-height: 70px; margin-top: 8px; resize: vertical;
                    background: var(--cat-input, #172327); color: var(--cat-text); border: 1px solid var(--cat-border); border-radius: 6px; padding: 8px; }
                .hint { color: var(--cat-muted); font-size: 0.85em; margin: 6px 0; }
                .time { font-variant-numeric: tabular-nums; }
            </style>
            <div class="toolbar"><strong></strong><span class="time"></span><cap-button data-add></cap-button><cap-button data-delete></cap-button><div class="actions"><slot name="actions"></slot></div></div>
            <div class="track"><input type="range" min="0" max="0" step="1"><div class="markers"></div></div>
            <div class="hint"></div><textarea disabled></textarea>`;
        this.cursor = this.shadowRoot.querySelector('input');
        this.description = this.shadowRoot.querySelector('textarea');
        this.addButton = this.shadowRoot.querySelector('[data-add]');
        this.deleteButton = this.shadowRoot.querySelector('[data-delete]');
        this.cursor.oninput = () => this.seek(Number(this.cursor.value));
        this.cursor.onkeydown = event => {
            if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
            event.preventDefault(); event.stopPropagation();
            this.seek(Number(this.cursor.value) + (event.key === 'ArrowLeft' ? -1 : 1));
        };
        this.addButton.onclick = () => {
            if (this.cursor.disabled) return;
            const time = Number(this.cursor.value) / this.fps;
            let point = this.points.find(point => Math.round(point.time * this.fps) === Number(this.cursor.value));
            if (!point) { point = {time, description: ''}; this.points.push(point); this.changed(); }
            this.select(point);
        };
        this.deleteButton.onclick = () => this.removeSelected();
        this.description.oninput = () => {
            if (!this.selected) return;
            this.selected.description = this.description.value; this.changed();
        };
    }

    configure(points, fps, start, end, labels) {
        this.points = points;
        this.fps = fps;
        this.start = start; this.end = end;
        this.labels = labels;
        this.selected = null;
        this.cursor.min = start; this.cursor.max = Math.max(start, end - 1);
        this.cursor.disabled = end <= start;
        this.addButton.disabled = end <= start;
        this.cursor.setAttribute('aria-label', labels.cursor);
        this.shadowRoot.querySelector('strong').textContent = labels.title;
        this.shadowRoot.querySelector('.hint').textContent = labels.hint;
        this.addButton.textContent = labels.add;
        this.deleteButton.textContent = labels.remove;
        this.description.setAttribute('aria-label', labels.description);
        this.description.placeholder = labels.description;
        this.select(null); this.update(start);
    }

    update(frame) {
        this.cursor.value = Math.max(this.start, Math.min(this.end - 1, Math.floor(frame + 1e-9)));
        const fps = Math.ceil(this.fps);
        this.shadowRoot.querySelector('.time').textContent = formatTimecode(Number(this.cursor.value) * 1000 / fps, fps);
    }

    seek(frame) {
        if (this.cursor.disabled) return;
        this.update(frame);
        this.dispatchEvent(new CustomEvent('seek', {detail: {frame: Number(this.cursor.value)}}));
    }

    select(point) {
        this.selected = point;
        this.description.disabled = !point;
        this.description.value = point?.description || '';
        this.deleteButton.disabled = !point;
        this.renderMarkers();
    }

    removeSelected() {
        if (!this.selected) return;
        this.points.splice(this.points.indexOf(this.selected), 1);
        this.select(null); this.changed();
    }

    changed() {
        this.points.sort((a, b) => a.time - b.time);
        this.dispatchEvent(new Event('change'));
    }

    renderMarkers() {
        const markers = this.shadowRoot.querySelector('.markers');
        markers.replaceChildren();
        this.points.filter(point => point.time * this.fps >= this.start - 1e-6 && point.time * this.fps < this.end - 1e-6).forEach((point, index) => {
            const button = document.createElement('cap-button');
            button.setAttribute('size', 'small');
            button.setAttribute('aria-pressed', String(point === this.selected));
            button.textContent = String(index + 1);
            button.title = `[Shot ${index + 1}] ${point.description}`;
            button.style.left = `${100 * (point.time * this.fps - this.start) / Math.max(1, this.end - this.start - 1)}%`;
            button.onclick = () => { this.select(point); this.seek(Math.round(point.time * this.fps)); };
            button.onkeydown = event => {
                if (event.key !== 'Delete' && event.key !== 'Backspace') return;
                event.preventDefault(); event.stopPropagation(); this.select(point); this.removeSelected();
            };
            markers.append(button);
        });
    }
}

if (!customElements.get('cap-shot-control')) customElements.define('cap-shot-control', ShotControl);
