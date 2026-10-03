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
            footer { display:flex; align-items:center; gap:8px; padding:10px; }
            span { flex:1; min-width:0; overflow-wrap:anywhere; font-size:.9em; }
            p { color:var(--cat-muted); line-height:1.6; }
        </style><div class="list"></div>`;
    }

    setVideos(rows, urlFor, menuFor) {
        this.stop();
        const list = this.shadowRoot.querySelector('.list');
        list.replaceChildren();
        if (!rows.length) {
            const empty = document.createElement('p');
            empty.textContent = T('project_videos_empty');
            list.append(empty);
        }
        for (const row of rows) {
            const card = document.createElement('article');
            const video = document.createElement('video');
            video.src = urlFor(row.file);
            video.preload = 'metadata';
            video.muted = false;
            video.loop = true;
            video.playsInline = true;
            const unavailable = document.createElement('p');
            unavailable.hidden = true;
            unavailable.textContent = T('project_video_unavailable');
            video.addEventListener('error', () => { unavailable.hidden = false; });
            card.addEventListener('pointerenter', () => { void video.play().catch(() => {}); });
            card.addEventListener('pointerleave', () => video.pause());
            const footer = document.createElement('footer');
            const name = document.createElement('span');
            name.textContent = row.file.split('/').pop();
            name.title = row.file;
            const more = document.createElement('cap-dropdown-button');
            more.setAttribute('hide-caret', '');
            more.setAttribute('size', 'small');
            more.setAttribute('aria-label', T('media_more'));
            more.innerHTML = iconHtml('ellipsisVertical', 14);
            more.bindMenu(() => menuFor(row, more.getBoundingClientRect()));
            footer.append(name, more);
            card.append(video, unavailable, footer);
            list.append(card);
        }
    }

    stop() { this.shadowRoot.querySelectorAll('video').forEach(video => video.pause()); }
    disconnectedCallback() { this.stop(); }
}

customElements.define('cap-project-video-list', ProjectVideoList);
