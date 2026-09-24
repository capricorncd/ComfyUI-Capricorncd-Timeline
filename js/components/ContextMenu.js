import './Button.js';
import { iconHtml } from '../cap_icons.js';

export class ContextMenu extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({ mode: 'open' });
        root.innerHTML = `<style>
            :host { display:block; position:fixed; z-index:100020; min-width:220px;
                max-width:calc(100vw - 16px); max-height:calc(100vh - 16px); overflow:auto;
                box-sizing:border-box; padding:4px; border:1px solid var(--cat-border,#344950);
                border-radius:6px; background:var(--cat-raised,#25343a);
                color:var(--cat-text,#e2e8f0); box-shadow:0 6px 20px #0006; }
            cap-button { display:flex; }
            .content { display:grid; grid-template-columns:16px minmax(0,1fr) auto;
                align-items:center; gap:10px; width:100%; text-align:left; }
            .icon { display:flex; }
            .label { overflow-wrap:anywhere; white-space:normal; }
            .shortcut { margin-left:12px; opacity:.65; font:inherit; white-space:nowrap; }
            .strike .label { text-decoration:line-through; }
            .track-name .label { font-weight:600; }
            hr { margin:4px 0; border:0; border-top:1px solid var(--cat-border,#344950); }
        </style><div class="items" role="menu"></div>`;
        this._items = root.querySelector('.items');
        this._buttons = [];
        this.addEventListener('keydown', event => {
            event.stopPropagation();
            if (event.key === 'Escape' || event.key === 'Tab') {
                if (event.key === 'Escape') event.preventDefault();
                this.dispatchEvent(new CustomEvent('menu-close', { bubbles:true, detail:{ restoreFocus:event.key === 'Escape' } }));
                return;
            }
            if (!['ArrowDown','ArrowUp','Home','End'].includes(event.key)) return;
            event.preventDefault();
            const enabled = this._buttons.filter(button => !button.disabled);
            if (!enabled.length) return;
            const current = enabled.indexOf(this.shadowRoot.activeElement);
            const index = event.key === 'Home' ? 0 : event.key === 'End' ? enabled.length - 1
                : current < 0 ? (event.key === 'ArrowDown' ? 0 : enabled.length - 1)
                : (current + (event.key === 'ArrowDown' ? 1 : -1) + enabled.length) % enabled.length;
            enabled[index].focus();
        });
    }

    disconnectedCallback() {
        this.dispatchEvent(new CustomEvent('menu-dismissed'));
    }

    focus(options) {
        this._buttons.find(button => !button.disabled)?.focus(options);
    }

    setItems(items) {
        this._items.replaceChildren();
        this._buttons = [];
        for (const item of items) {
            if (item.separator) {
                this._items.appendChild(document.createElement('hr'));
                continue;
            }
            const button = document.createElement('cap-button');
            button.setAttribute('variant', item.danger ? 'danger' : 'ghost');
            button.setAttribute('align', 'start');
            button.setAttribute('role', 'menuitem');
            if (typeof item.checked === 'boolean') {
                button.setAttribute('role', 'menuitemcheckbox');
                button.setAttribute('aria-checked', String(item.checked));
            }
            button.disabled = !!item.disabled;
            button.classList.toggle('strike', !!item.strike);
            button.classList.toggle('track-name', !!item.trackName);
            const content = document.createElement('span');
            content.className = 'content';
            const icon = document.createElement('span');
            icon.className = 'icon';
            icon.setAttribute('aria-hidden', 'true');
            if (item.checked === true) icon.innerHTML = iconHtml('check', 16);
            else if (item.icon) icon.innerHTML = iconHtml(item.icon, 16);
            const label = document.createElement('span');
            label.className = 'label';
            const match = String(item.label ?? '').match(/^(.*?)\s{2,}((?:Ctrl|Cmd|Alt|Shift|⌘)\+.+)$/);
            label.textContent = match ? match[1] : item.label;
            const shortcut = document.createElement('kbd');
            shortcut.className = 'shortcut';
            shortcut.textContent = item.shortcut ?? match?.[2] ?? '';
            content.append(icon, label, shortcut);
            button.append(content);
            button.addEventListener('click', event => {
                event.stopPropagation();
                if (!button.disabled) this.dispatchEvent(new CustomEvent('menu-select', { detail:item, bubbles:true }));
            });
            this._items.appendChild(button);
            this._buttons.push(button);
        }
    }
}

if (!customElements.get('cap-context-menu')) customElements.define('cap-context-menu', ContextMenu);
