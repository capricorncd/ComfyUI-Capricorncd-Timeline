import "./Button.js";
import "./PromptMentions.js";
import { formatTimecode } from "../timecode.js";

export function shotPrompt(points) {
    const shots = [...points].sort((a, b) => a.time - b.time);
    return shots.length ? 'detailed_description:\n' + shots.map((point, index) => {
        const ms = Math.round(point.time * 1000);
        const minutes = String(Math.floor(ms / 60000)).padStart(2, '0');
        const seconds = String(Math.floor(ms / 1000) % 60).padStart(2, '0');
        const millis = String(ms % 1000).padStart(3, '0');
        return `[Shot ${index + 1}] At ${minutes}:${seconds}.${millis}, ${point.description.trim()}`;
    }).join('\n') : '';
}

export class ShotControl extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'}).innerHTML = `
            <style>
                :host { display: grid; gap: 10px; min-width: 0; padding: 12px 0; }
                :host([hidden]) { display: none; }
                header, .actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
                .time { margin-left: auto; color: var(--cat-muted); font-variant-numeric: tabular-nums; }
                label { display: grid; gap: 6px; }
                textarea { box-sizing: border-box; width: 100%; min-height: 110px; resize: vertical; font: inherit; line-height: 1.6;
                    background: var(--cat-input); color: var(--cat-text); border: 1px solid var(--cat-border); border-radius: 6px; padding: 8px; }
                .hint { color: var(--cat-muted); font-size: 0.85em; margin: 0; }
            </style>
            <header><strong></strong><span class="time"></span></header>
            <label><span></span><textarea></textarea></label>
            <p class="hint"></p><div class="actions"><cap-button data-delete></cap-button><cap-button data-insert></cap-button></div>`;
        this.description = this.shadowRoot.querySelector('textarea');
        this.description.addEventListener('input', () => this.dispatchEvent(new CustomEvent('prompt-change', {detail: this.description.value})));
        this.description.addEventListener('blur', () => this.dispatchEvent(new Event('prompt-commit')));
        for (const action of ['delete', 'insert']) this.shadowRoot.querySelector(`[data-${action}]`).onclick = () => this.dispatchEvent(new Event(action));
    }
    setMentionSource(getAssets) {
        if (!this.mentions) {
            this.mentions = document.createElement('cap-prompt-mentions');
            this.shadowRoot.append(this.mentions);
            this.mentions.addEventListener('asset-mention', event => this.dispatchEvent(new CustomEvent('asset-mention', {detail: event.detail})));
        }
        this.mentions.bind(this.description, getAssets);
    }
    configure(point, time, fps, locked, labels) {
        this.mentions?.close();
        this.hidden = !point;
        if (!point) return;
        this.shadowRoot.querySelector('strong').textContent = labels.title;
        this.shadowRoot.querySelector('.time').textContent = formatTimecode(time * 1000, fps);
        this.shadowRoot.querySelector('label span').textContent = labels.description;
        this.shadowRoot.querySelector('.hint').textContent = labels.hint;
        this.description.value = point.description || '';
        this.description.disabled = locked;
        for (const action of ['delete', 'insert']) {
            const button = this.shadowRoot.querySelector(`[data-${action}]`);
            button.textContent = labels[action]; button.disabled = locked;
        }
    }
}

export class ShotMarkers extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'}).innerHTML = `
            <style>
                :host { display: block; position: absolute; left: -1px; right: -1px; bottom: 4px; height: 18px; z-index: 4; pointer-events: none; }
                 .markers { position: relative; height: 18px; }
                .marker { position: absolute; top: 0; width: 18px; height: 18px; transform: translateX(-50%); pointer-events: auto; cursor: pointer; }
                svg { display: block; width: 18px; height: 18px; pointer-events: none; }
                polygon { fill: var(--cat-text, #e4edeb); stroke: var(--cat-bg, #172327); stroke-width: 1.5; }
                .selected polygon, .marker:focus polygon { fill: var(--cat-accent, #64d8c5); stroke: var(--cat-text, #e4edeb); stroke-width: 2; }
            </style><div class="markers"></div>`;
        this.addEventListener('mousedown', event => { event.stopPropagation(); event.preventDefault(); });
        this.addEventListener('dblclick', event => { event.stopPropagation(); event.preventDefault(); });
        this.shadowRoot.addEventListener('mousedown', event => {
            if (event.button !== 0) return;
            const marker = event.target.closest('[data-index]');
            if (marker) this.dispatchEvent(new CustomEvent('point-select', {detail: Number(marker.dataset.index)}));
        });
        this.shadowRoot.addEventListener('keydown', event => {
            const marker = event.target.closest('[data-index]');
            if (marker && ['Enter', ' '].includes(event.key)) {
                event.preventDefault(); event.stopPropagation();
                this.dispatchEvent(new CustomEvent('point-select', {detail: Number(marker.dataset.index)}));
            }
        });
    }
    configure(points, start, duration, selected, label) {
        const markers = this.shadowRoot.querySelector('.markers');
        markers.replaceChildren();
        points.forEach((point, index) => {
            if (point.time < start - 1e-7 || point.time >= start + duration - 1e-7) return;
            const marker = document.createElement('div');
            marker.className = 'marker';
            marker.style.left = `${100 * (point.time - start) / duration}%`;
            marker.dataset.index = index;
            marker.setAttribute('role', 'button'); marker.setAttribute('tabindex', '0');
            marker.setAttribute('aria-label', `${label} ${index + 1}`);
            marker.setAttribute('aria-pressed', String(point === selected));
            if (point === selected) marker.classList.add('selected');
            marker.innerHTML = '<svg viewBox="0 0 18 18" aria-hidden="true"><polygon points="9,3 15,9 9,15 3,9"></polygon></svg>';
            marker.title = point.description || `${label} ${index + 1}`;
            markers.append(marker);
        });
    }
}

if (!customElements.get('cap-shot-control')) customElements.define('cap-shot-control', ShotControl);
if (!customElements.get('cap-shot-markers')) customElements.define('cap-shot-markers', ShotMarkers);
