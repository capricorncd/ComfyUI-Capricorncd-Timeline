import './DropdownButton.js';
import { iconHtml } from '../cap_icons.js';
import { t as T } from '../i18n/timeline_editor.js';

export class ProjectVideoList extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display:block; padding:16px; color:var(--cat-text); }
            :host([hidden]) { display:none; }
            .list { display:grid; gap:16px; }
            article { min-width:0; border:1px solid var(--cat-border-soft); border-radius:8px; overflow:hidden; }
            video { display:block; width:100%; aspect-ratio:16/9; object-fit:contain; background:var(--cat-bg); }
            audio { display:block; width:100%; }
            footer { display:flex; align-items:center; gap:8px; padding:10px; }
            span { flex:1; min-width:0; overflow-wrap:anywhere; font-size:.9em; }
            p { color:var(--cat-muted); line-height:1.6; }
            :host([compact]) { padding:0; }
            :host([compact]) .list { gap:6px; }
            :host([compact]) article { display:flex; align-items:center; gap:8px; padding:6px; overflow:visible; }
            :host([compact]) video, .audio-icon { width:56px; height:32px; flex:none; border-radius:4px; }
            .audio-icon { display:flex; align-items:center; justify-content:center; background:var(--cat-bg); }
            :host([compact]) audio { display:none; }
            :host([compact]) footer { flex:1; min-width:0; padding:0; }
            :host([compact]) span { overflow:hidden; white-space:nowrap; text-overflow:ellipsis; }
            :host([compact]) article > p { display:none; }
            :host([compact]) article:has(> p:not([hidden])) { opacity:.5; }
        </style><div class="list"></div>`;
    }

    setVideos(rows, urlFor, menuFor) {
        this.stop();
        this._visibility?.disconnect();
        const list = this.shadowRoot.querySelector('.list');
        list.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement('p');
            empty.textContent = T('project_videos_empty');
            list.append(empty);
        }
        for (const row of rows) {
            const card = document.createElement('article');
            const video = document.createElement(row.kind === 'audio' ? 'audio' : 'video');
            const compact = this.hasAttribute('compact');
            const url = urlFor(row.file);
            const load = () => { if (!video.getAttribute('src')) video.src = url; };
            video.preload = compact ? 'none' : 'metadata';
            if (!compact) load();
            video.muted = false;
            video.loop = true;
            video.playsInline = true;
            if (row.kind === 'audio') video.controls = !compact;
            const unavailable = document.createElement('p');
            unavailable.hidden = true;
            unavailable.textContent = T('project_video_unavailable');
            video.addEventListener('error', () => { unavailable.hidden = false; });
            card.addEventListener('pointerenter', () => { this.stop(); load(); void video.play().catch(() => {}); });
            card.addEventListener('pointerleave', () => video.pause());
            const footer = document.createElement('footer');
            const name = document.createElement('span');
            name.textContent = row.name || row.file.split('/').pop();
            name.title = row.name ? `${row.name}\n${row.file}` : row.file;
            const more = document.createElement('cap-dropdown-button');
            more.setAttribute('hide-caret', '');
            more.setAttribute('size', 'small');
            more.setAttribute('aria-label', T('media_more'));
            more.innerHTML = iconHtml('ellipsisVertical', 14);
            more.bindMenu(() => menuFor(row, more.getBoundingClientRect()));
            footer.append(name, more);
            if (compact && row.kind === 'audio') {
                const icon = document.createElement('div');
                icon.className = 'audio-icon';
                icon.innerHTML = iconHtml('audio', 24);
                card.append(icon);
            }
            card.append(video, unavailable, footer);
            list.append(card);
            if (compact && row.kind !== 'audio') {
                this._visibility ??= new IntersectionObserver(entries => {
                    for (const entry of entries) {
                        if (!entry.isIntersecting) { entry.target.pause(); continue; }
                        entry.target.preload = 'metadata';
                        if (!entry.target.getAttribute('src')) entry.target.src = entry.target.dataset.previewUrl;
                    }
                });
                video.dataset.previewUrl = url;
                this._visibility.observe(video);
            }
        }
    }

    stop() { this.shadowRoot.querySelectorAll('video, audio').forEach(video => video.pause()); }
    disconnectedCallback() { this.stop(); this._visibility?.disconnect(); }
}

customElements.define('cap-project-video-list', ProjectVideoList);
