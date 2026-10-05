import './Button.js';
import './FormControls.js';
import './StatusMessage.js';
import { makeT } from '../cap_i18n.js';
import { iconHtml } from '../cap_icons.js';
import { api } from '../../../scripts/api.js';

const T = makeT({
    zh: { unbind: '解绑', label: '导出目录', choose: '选择目录', change: '更改目录', reset: '使用默认 output 目录', missing: '目录不存在，请输入已存在的目录', failed: '无法检查目录，请确认服务连接' },
    en: { unbind: 'Unbind', label: 'Export directory', choose: 'Choose folder', change: 'Change folder', reset: 'Use default output folder', missing: 'Directory does not exist. Enter an existing folder.', failed: 'Cannot check directory. Check the server connection.' },
    ja: { unbind: '関連付け解除', label: '出力先', choose: 'フォルダーを選択', change: 'フォルダーを変更', reset: '既定の output フォルダーを使用', missing: 'フォルダーが存在しません。既存のフォルダーを入力してください。', failed: 'フォルダーを確認できません。接続を確認してください。' },
});

const STORAGE_KEY = 'capricorncd.timeline.last-export-directory';
const openT = makeT({ zh: {open: '打开目录'}, en: {open: 'Open folder'}, ja: {open: 'フォルダーを開く'} });

export function lastExportDirectory(kind = 'video') {
    try { return localStorage.getItem(`${STORAGE_KEY}.${kind}`) || ''; }
    catch { return ''; }
}

export function rememberExportDirectory(directory, kind = 'video') {
    try { localStorage.setItem(`${STORAGE_KEY}.${kind}`, directory || ''); }
    catch { /* A completed export must not fail because preference storage is full. */ }
}

export class ExportDirectory extends HTMLElement {
    static observedAttributes = ['default-dir', 'label'];

    constructor() {
        super();
        this.attachShadow({ mode: 'open' }).innerHTML = `<style>
            :host { display: block; min-width: 0; }
            :host([hidden]) { display: none; }
            .field { display: grid; gap: 6px; color: var(--cat-muted); font: inherit; }
            .heading { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; justify-content: space-between; }
            .actions { display: flex; gap: 8px; align-items: center; }
            cap-input { min-width: 0; }
            cap-status-message { margin-top: 8px; }
        </style><div class="field"><div class="heading"><label for="directory">${T('label')}</label>
            <div class="actions"><cap-button data-choose size="small">${T('choose')}</cap-button>
            <cap-button data-open size="small" hidden>${openT('open')}</cap-button>
            <cap-button data-reset shape="square" title="${T('reset')}" aria-label="${T('reset')}">${iconHtml('refresh', 14)}</cap-button>
        </div></div><cap-input><input id="directory" readonly aria-label="${T('label')}" /></cap-input>
        </div><cap-status-message hidden></cap-status-message>`;
        this.input = this.shadowRoot.querySelector('input');
        this.choose = this.shadowRoot.querySelector('[data-choose]');
        this.openButton = this.shadowRoot.querySelector('[data-open]');
        this.openButton.addEventListener('click', () => this.dispatchEvent(new CustomEvent('directory-open', {bubbles: true})));
        this.reset = this.shadowRoot.querySelector('[data-reset]');
        this.status = this.shadowRoot.querySelector('cap-status-message');
        this.input.addEventListener('input', () => {
            this._value = this.input.value.trim();
            this.input.title = this.input.value;
            this.status.setStatus('');
            clearTimeout(this._validationTimer);
            this._validationTimer = setTimeout(() => void this.validate(), 350);
            this.dispatchEvent(new Event(this.hasAttribute('project-directory') ? 'input' : 'change', { bubbles: true }));
        });
        this.input.addEventListener('change', () => {
            if (this.hasAttribute('project-directory')) this.dispatchEvent(new Event('change', { bubbles: true }));
        });
        this.choose.addEventListener('click', () => void this.pick());
        this.reset.addEventListener('click', () => {
            this.value = '';
            this.status.setStatus('');
            this.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    connectedCallback() {
        this.restore();
    }
    disconnectedCallback() { clearTimeout(this._validationTimer); }

    async validate() {
        clearTimeout(this._validationTimer);
        const value = this.value;
        if (!value || value === this.defaultDir) { this.status.setStatus(''); return true; }
        try {
            const response = await api.fetchApi('/audio_keyframe_timeline/export_directory_check', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ directory: value }),
            });
            const data = await response.json();
            if (value !== this.value || !this.isConnected) return false;
            if (!response.ok) throw new Error(data.error);
            this.status.setStatus(data.exists ? '' : T('missing'), 'error');
            return Boolean(data.exists);
        } catch {
            if (value === this.value && this.isConnected) this.status.setStatus(T('failed'), 'error');
            return false;
        }
    }

    attributeChangedCallback() { if (this.input) this.render(); }
    get nativePicker() { return Boolean(window.__COMFYUI_LAUNCHER__?.capabilities?.projectDirectory); }
    get exportKind() { return this.getAttribute('export-kind') === 'project' ? 'project' : 'video'; }
    set exportKind(value) { this.setAttribute('export-kind', value); }
    restore(preferredDirectory = '') {
        this.value = this.hasAttribute('project-directory') ? preferredDirectory
            : (this.nativePicker ? lastExportDirectory(this.exportKind) : '')
                || (this.exportKind === 'project' ? preferredDirectory : '');
    }
    remember(directory = this.value) {
        if (this.nativePicker && !this.hasAttribute('project-directory')) rememberExportDirectory(directory || this.defaultDir, this.exportKind);
    }

    get value() { return this._value || ''; }
    set value(value) { this._value = value || ''; this.status.setStatus(''); this.render(); }
    get defaultDir() { return this.getAttribute('default-dir') ?? 'output'; }
    set defaultDir(value) { this.setAttribute('default-dir', value || 'output'); }
    get directory() { return this.value || this.defaultDir; }
    get exportSettings() {
        const directory = this.directory.replace(/\\/g, '/');
        if (directory.startsWith('/') || /^[a-z]:/i.test(directory)) return { output_directory: directory };
        return { filename_prefix: directory.replace(/^output(?:\/|$)/, '').replace(/\/+$/, '') || '/' };
    }
    render() {
        const label = this.getAttribute('label') || T('label');
        this.shadowRoot.querySelector('label').textContent = label;
        this.input.setAttribute('aria-label', label);
        this.input.value = this.value || this.defaultDir;
        this.input.title = this.input.value;
        this.input.readOnly = this.nativePicker;
        this.choose.textContent = T(this.value ? 'change' : 'choose');
        this.choose.hidden = !this.nativePicker;
        this.openButton.hidden = !this.hasAttribute('project-directory') || !this.value;
        const projectDirectory = this.hasAttribute('project-directory');
        this.reset.hidden = !this.value || (!projectDirectory && !this.nativePicker);
        if (projectDirectory) {
            this.reset.textContent = T('unbind');
            this.reset.setAttribute('variant', 'danger');
            this.reset.removeAttribute('shape');
            this.reset.setAttribute('size', 'small');
            this.reset.title = T('unbind');
            this.reset.setAttribute('aria-label', T('unbind'));
        }
    }
    get disabled() { return this._disabled || false; }
    setStatus(message, state = '') { this.status.setStatus(message, state); }
    set disabled(value) {
        this._disabled = Boolean(value);
        this.input.disabled = this._disabled || this._picking;
        this.choose.disabled = this.reset.disabled = this._disabled || this._picking;
        this.openButton.disabled = this._disabled || this._picking;
    }

    async pick() {
        if (this.disabled || this._picking) return;
        this._picking = true;
        this.disabled = this.disabled;
        try {
            const directory = await window.__COMFYUI_LAUNCHER__.pickDirectory();
            if (directory) {
                this.value = directory;
                this.status.setStatus('');
                this.dispatchEvent(new Event('change', { bubbles: true }));
            }
        } catch (error) {
            this.status.setStatus(String(error?.message || error), 'error');
        } finally {
            this._picking = false;
            this.disabled = this.disabled;
        }
    }
}

customElements.define('cap-export-directory', ExportDirectory);
