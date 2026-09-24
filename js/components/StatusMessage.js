import './Button.js';
import { iconHtml } from '../cap_icons.js';

/** Shared status panel. Content is plain text; presentation stays inside Shadow DOM. */
export class StatusMessage extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `
            <style>
                :host { display: block; min-width: 0; white-space: normal; }
                :host([hidden]), :host(:empty) { display: none; }
                .panel {
                    box-sizing: border-box;
                    font-family: inherit;
                    font-size: calc(var(--cat-font-size, 1rem) * 0.857143);
                    line-height: 1.4;
                    color: var(--cat-text, #e2e8f0);
                    padding: 8px 10px;
                    border-radius: 4px;
                    background: var(--cat-raised, #24343a);
                    border: 1px solid var(--cat-border, #344950);
                    white-space: pre-wrap;
                    overflow-wrap: anywhere;
                }
                .message { max-height: var(--cap-status-max-height, none); overflow-y: auto; }
                .actions { display: none; margin-top: 8px; justify-content: flex-end; }
                :host([copyable]) .actions { display: flex; }
                :host([state="success"]) .panel {
                    color: #bbf7d0;
                    border-color: #166534;
                    background: #0f1a14;
                }
                :host([state="error"]) .panel {
                    color: #fecaca;
                    border-color: #7f1d1d;
                    background: #1f1216;
                }
                :host([state="warning"]) .panel {
                    color: #fde68a;
                    border-color: #a16207;
                    background: #241c0e;
                }
            </style>
            <div class="panel" role="status" aria-live="polite" aria-atomic="true"><div class="message"><slot></slot></div><div class="actions"><cap-button shape="square" size="small"></cap-button></div></div>
        `;
        this.copyButton = this.shadowRoot.querySelector('cap-button');
        this.copyButton.addEventListener('click', async () => {
            this.copyButton.disabled = true;
            try {
                await navigator.clipboard.writeText(this.textContent);
                this._setCopyState('success');
                this._copyResetTimer = setTimeout(() => this._setCopyState(), 1200);
            } catch {
                this._setCopyState('error');
            } finally {
                this.copyButton.disabled = false;
            }
        });
    }

    connectedCallback() {
        this._setCopyState();
    }

    disconnectedCallback() {
        clearTimeout(this._copyResetTimer);
    }

    _setCopyState(state) {
        clearTimeout(this._copyResetTimer);
        const label = state === 'success' ? this.getAttribute('copied-label') || 'Copied'
            : state === 'error' ? this.getAttribute('copy-failed-label') || 'Copy failed'
                : this.getAttribute('copy-label') || 'Copy message';
        this.copyButton.title = label;
        this.copyButton.setAttribute('aria-label', label);
        this.copyButton.innerHTML = iconHtml(state === 'success' ? 'check' : 'copy', 12);
        if (state) this.copyButton.setAttribute('variant', state === 'success' ? 'success' : 'danger');
        else this.copyButton.removeAttribute('variant');
    }

    setStatus(text, state = "info") {
        this.textContent = String(text ?? "");
        this.setAttribute("state", ["success", "error", "warning"].includes(state) ? state : "info");
        this.hidden = !this.textContent;
        this._setCopyState();
    }
}

if (!customElements.get("cap-status-message")) {
    customElements.define("cap-status-message", StatusMessage);
}
