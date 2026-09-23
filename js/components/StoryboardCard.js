import './Button.js';
import './DropdownButton.js';
import './ContextMenu.js';
import { iconHtml } from '../cap_icons.js';

/** A selectable shot. Project data and edits remain owned by the editor. */
export class StoryboardCard extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open', delegatesFocus: true });
        root.innerHTML = `<style>
            :host { display: block; min-width: 0; position: relative; }
            cap-button { width: 100%; }
            cap-dropdown-button { position: absolute; top: 11px; right: 11px; }
            .content { display: grid; grid-template-columns: 132px minmax(0, 1fr); gap: 12px; width: 100%; }
            :host([data-disabled]) .content { opacity: 0.5; }
            .frame { position: relative; aspect-ratio: var(--shot-aspect, 16 / 9); background: var(--cat-bg); display: grid; place-items: center; align-self: start; overflow: hidden; }
            img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
            [hidden] { display: none !important; }
            .details { min-width: 0; }
            .heading { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; padding-right: 48px; min-height: 28px; }
            .duration { white-space: nowrap; }
            .muted { color: var(--cat-muted); font-size: 11px; }
            .action, .dialogue { white-space: pre-wrap; overflow-wrap: anywhere; margin-top: 8px; }
            .title { overflow-wrap: anywhere; }
            .dialogue { background: var(--cat-surface); padding: 8px; border-radius: 4px; }
            .speaker { color: var(--cat-accent); font-size: 11px; }
            @media (max-width: 600px) { .content { grid-template-columns: 90px minmax(0, 1fr); } }
        </style>
        <cap-button size="content" align="start">
          <span class="content">
            <span class="frame"><img hidden alt=""><span class="placeholder muted"></span></span>
            <span class="details">
              <span class="heading"><span class="title"></span><span class="duration muted"></span></span>
              <span class="camera muted"></span>
              <div class="bindings muted"></div>
              <div class="action"></div>
              <div class="dialogue"><div class="speaker"></div><div class="words"></div><div class="delivery muted"></div></div>
            </span>
          </span>
        </cap-button><cap-dropdown-button hide-caret>${iconHtml('ellipsisVertical', 16)}</cap-dropdown-button>`;
        this.more = root.querySelector('cap-dropdown-button');
        this.more.bindMenu(event => {
            const menu = document.createElement('cap-context-menu');
            menu.setItems([
                { label: this.labels.insert, icon: 'insert', action: 'insert' },
                { label: this.shotDisabled ? this.labels.enable : this.labels.disable, action: 'toggle' },
                { separator: true },
                { label: this.labels.delete, danger: true, action: 'delete' },
            ]);
            menu.addEventListener('menu-select', event => {
                menu.remove();
                this.dispatchEvent(new CustomEvent(`shot-${event.detail.action}`, {
                    detail: { id: this.shotId }, bubbles: true, composed: true,
                }));
            });
            menu.addEventListener('menu-close', event => {
                menu.remove();
                if (event.detail.restoreFocus) this.more.focus();
            });
            root.append(menu);
            const rect = this.more.getBoundingClientRect();
            const bounds = menu.getBoundingClientRect();
            menu.style.left = `${Math.max(8, Math.min(rect.right - bounds.width, window.innerWidth - bounds.width - 8))}px`;
            menu.style.top = `${Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - bounds.height - 8))}px`;
            if (event.type === 'click' && event.detail === 0) menu.focus();
            return menu;
        });
        this.button = root.querySelector('cap-button');
        this.button.addEventListener('click', () => this.dispatchEvent(new CustomEvent('shot-select', {
            detail: { id: this.shotId }, bubbles: true, composed: true,
        })));
        root.querySelector('img').addEventListener('error', () => {
            root.querySelector('img').hidden = true;
            root.querySelector('.placeholder').hidden = false;
        });
    }

    setShot(shot, { index, selected, width, height, imageUrl = '', bindings = '', labels }) {
        this.shotId = shot.id;
        this.labels = labels;
        this.shotDisabled = shot.disabled === true;
        this.toggleAttribute('data-disabled', this.shotDisabled);
        this.more.setAttribute('aria-label', labels.more);
        this.more.title = labels.more;
        this.button.setAttribute('aria-pressed', String(selected));
        const title = `${String(index + 1).padStart(3, '0')} · ${shot.title || labels.untitled}${this.shotDisabled ? ` · ${labels.disabled}` : ''}`;
        this.button.setAttribute('aria-label', title);
        this.style.setProperty('--shot-aspect', `${width} / ${height}`);
        const text = (selector, value) => { this.shadowRoot.querySelector(selector).textContent = value; };
        text('.title', title);
        text('.duration', `${shot.duration} ${labels.seconds}`);
        text('.camera', [shot.shot_size, shot.camera_move].filter(Boolean).join(' · '));
        text('.bindings', bindings);
        text('.action', shot.description);
        text('.speaker', shot.speaker);
        text('.words', shot.dialogue);
        text('.delivery', [shot.delivery, shot.emotion].filter(Boolean).join(' · '));
        text('.placeholder', labels.noImage);
        this.shadowRoot.querySelector('.dialogue').hidden = !shot.dialogue;
        const img = this.shadowRoot.querySelector('img');
        img.hidden = !imageUrl;
        this.shadowRoot.querySelector('.placeholder').hidden = !!imageUrl;
        if (imageUrl && img.getAttribute('src') !== imageUrl) img.src = imageUrl;
        else if (!imageUrl) img.removeAttribute('src');
    }
}

if (!customElements.get('cap-storyboard-card')) customElements.define('cap-storyboard-card', StoryboardCard);
