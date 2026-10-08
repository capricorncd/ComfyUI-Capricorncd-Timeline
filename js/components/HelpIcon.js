import './Button.js';
import { iconHtml } from '../cap_icons.js';

export class HelpIcon extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({mode:'open'});
        root.innerHTML = `<style>
            :host {display:inline-flex;pointer-events:auto;}
            :host([hidden]) {display:none;}
            .tip {position:fixed;margin:0;box-sizing:border-box;width:max-content;max-width:min(420px,calc(100vw - 24px));
                max-height:calc(100vh - 24px);overflow:auto;padding:12px 16px;white-space:pre-line;
                font:inherit;line-height:1.65;color:var(--cat-text);background:var(--cat-surface);
                border:1px solid var(--cat-border-soft);border-radius:8px;box-shadow:0 8px 24px #0005;}
        </style><cap-button size="small" shape="square" aria-describedby="help-text">${iconHtml('help',12)}</cap-button>
        <div id="help-text" class="tip" role="tooltip" popover="manual"></div>`;
        this.button = root.querySelector('cap-button');
        this.tip = root.querySelector('.tip');
        this.button.addEventListener('pointerenter', () => this.show());
        this.button.addEventListener('focusin', () => this.show());
        this.button.addEventListener('click', () => this.show());
        this.button.addEventListener('focusout', () => this.hide());
        for (const element of [this.button, this.tip]) {
            element.addEventListener('pointerenter', () => clearTimeout(this.hideTimer));
            element.addEventListener('pointerleave', () => {
                this.hideTimer = setTimeout(() => this.hide(), 120);
            });
        }
    }
    configure(label, text) {
        this.button.setAttribute('aria-label', label);
        this.tip.textContent = text;
    }
    connectedCallback() {
        this.controller = new AbortController();
        const options = {signal:this.controller.signal};
        window.addEventListener('resize', () => this.hide(), options);
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && this.tip.matches(':popover-open')) {
                event.preventDefault(); event.stopPropagation(); this.hide();
            }
        }, {...options, capture:true});
        document.addEventListener('pointerdown', event => {
            if (!event.composedPath().includes(this)) this.hide();
        }, options);
    }
    disconnectedCallback() { this.controller?.abort(); this.hide(); }
    show() {
        clearTimeout(this.hideTimer);
        if (!this.tip.matches(':popover-open')) this.tip.showPopover();
        const rect = this.button.getBoundingClientRect();
        const {width, height} = this.tip.getBoundingClientRect();
        this.tip.style.left = `${Math.max(12, Math.min(rect.left, innerWidth - width - 12))}px`;
        const top = rect.top - height - 8;
        this.tip.style.top = `${Math.max(12, Math.min(top >= 12 ? top : rect.bottom + 8, innerHeight - height - 12))}px`;
    }
    hide() {
        clearTimeout(this.hideTimer);
        if (this.tip.matches(':popover-open')) this.tip.hidePopover();
    }
}
customElements.define('cap-help-icon', HelpIcon);
