import './Button.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';
import { replaceRichPromptRange, undoRichPrompt, toggleComment } from './RichPrompt.js';
import { isPromptComment } from '../prompt_text.js';

const T = makeT({
    zh: {title: '提示词', remove: '删除素材引用', unavailable: '素材预览不可用'},
    en: {title: 'Prompt', remove: 'Remove asset reference', unavailable: 'Asset preview unavailable'},
    ja: {title: 'プロンプト', remove: '素材参照を削除', unavailable: '素材プレビューがありません'},
});

export function assetMentionRanges(value, assets) {
    const names = [...new Set(assets.map(asset => asset.name).filter(Boolean))].sort((a, b) => b.length - a.length);
    if (!names.length) return [];
    const escape = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp('(?<![\\p{L}\\p{N}_@])@(' + names.map(escape).join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');
    return [...value.matchAll(pattern)].map(match => ({start: match.index, end: match.index + match[0].length,
        assets: assets.filter(asset => asset.name === match[1])}));
}

export class InlinePromptEditor extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open', delegatesFocus: true}).innerHTML = `<style>
            :host {display: flex; flex-direction: column; min-width: 0; font: inherit; font-size: var(--cat-te-prompt-font-size, var(--cat-font-size, inherit)); color: var(--cat-text);}
            .editor {box-sizing: border-box; width: 100%; min-height: 100px; padding: 8px;
                white-space: pre-wrap; overflow-wrap: anywhere; overflow: auto; font: inherit; line-height: 1.65;
                border: 1px solid var(--cat-border-soft); border-radius: 4px; background: var(--cat-input, var(--cat-bg)); outline: none;}
            :host([fill]) {min-height: 0;}
            :host([fill]) .editor {flex: 1 1 0; min-height: 0;}
            .editor:focus {border-color: var(--cat-accent);}
            .editor:empty::before {content: attr(data-placeholder); color: var(--cat-muted); pointer-events: none;}
            .comment {opacity: .4;}
            .editor[aria-disabled=true] {opacity: .6;}
            :host([hidden]) {display: none;}
            .tag {display: inline-flex; vertical-align: baseline; align-items: center; gap: 4px; padding: 0 4px;
                background: var(--cat-raised); color: var(--cat-text); border: 1px solid var(--cat-border-soft); border-radius: 6px;}
            .name {overflow-wrap: anywhere; min-width: 0;}
            .preview {position: fixed; margin: 0; box-sizing: border-box; width: min(280px, calc(100vw - 24px));
                padding: 10px; border: 1px solid var(--cat-border-soft); border-radius: 8px;
                color: var(--cat-text); background: var(--cat-surface); box-shadow: 0 8px 24px #0005; pointer-events: none;}
            .preview img, .preview video {display: block; width: 100%; height: 200px; object-fit: contain;}
            .preview p {margin: 6px 0 0; overflow-wrap: anywhere; font: inherit;}
        </style><div class="editor" contenteditable="true" role="textbox" aria-multiline="true"></div><div class="preview" popover="manual"></div>`;
        this.editor = this.shadowRoot.querySelector('.editor');
        this.editor.addEventListener('focus', () => this.textarea?.dispatchEvent(new Event('focus')));
        this.editor.addEventListener('blur', () => { this.hidePreview(); this.textarea?.dispatchEvent(new Event('blur')); this.textarea?.dispatchEvent(new Event('change', {bubbles: true})); });
        this.editor.addEventListener('pointerup', () => this.syncSelection());
        this.editor.addEventListener('keyup', () => this.syncSelection());
        this.editor.addEventListener('keydown', event => {
            this.syncSelection();
            const key = event.key.toLowerCase();
            if ((event.ctrlKey || event.metaKey) && !event.altKey) {
                if (key === 'z' || key === 'y') {
                    event.preventDefault(); event.stopImmediatePropagation();
                    undoRichPrompt(this.textarea, key === 'y' || event.shiftKey);
                } else if (key === '/') {
                    event.preventDefault(); event.stopImmediatePropagation(); toggleComment(this.textarea);
                }
            }
        });
        this.editor.addEventListener('beforeinput', event => this.beforeInput(event));
        this.editor.addEventListener('compositionstart', () => { this.composing = true; this.syncSelection(); });
        this.editor.addEventListener('compositionend', () => { this.composing = false; this.commitDom(); });
        this.editor.addEventListener('input', event => { if (!this.composing && !event.isComposing) this.commitDom(); });
        this.editor.addEventListener('paste', event => this.paste(event));
        this.editor.addEventListener('copy', event => this.copy(event));
        this.editor.addEventListener('cut', event => { this.copy(event); replaceRichPromptRange(this.textarea, ''); });
        this.editor.addEventListener('drop', event => event.preventDefault());
        const preview = this.shadowRoot.querySelector('.preview');
        preview.addEventListener('toggle', event => {
            if (event.newState === 'closed') preview.querySelector('video')?.pause();
        });
    }
    connectedCallback() {
        if (this.textarea && this.textarea._capInlineEditor !== this) {
            this.bindTextarea(this.textarea);
            this.configure(this.textarea, this.assets);
        }
    }

    disconnectedCallback() {
        this.hidePreview(); this.observer?.disconnect();
        const ta = this.textarea;
        if (ta?._capInlineEditor !== this) return;
        delete ta.value;
        ta.setSelectionRange = this.nativeSelection;
        ta.focus = this.nativeFocus;
        ta.style.display = this.originalDisplay;
        delete ta._capInlineEditor;
        delete ta._capProtectedRanges;
        if (ta._capMirror) ta._capMirror.hidden = false;
    }
    hidePreview() {
        const preview = this.shadowRoot.querySelector('.preview');
        preview.querySelector('video')?.pause();
        if (preview.matches(':popover-open')) preview.hidePopover();
        preview.replaceChildren();
    }
    showPreview(tag, asset) {
        this.hidePreview();
        const preview = this.shadowRoot.querySelector('.preview');
        const caption = document.createElement('p');
        caption.textContent = asset.name;
        if (asset.preview && ['image', 'video'].includes(asset.kind)) {
            const media = document.createElement(asset.kind === 'image' ? 'img' : 'video');
            media.src = asset.preview;
            if (asset.kind === 'image') media.alt = asset.name;
            else { media.muted = true; media.loop = true; media.playsInline = true; }
            media.addEventListener('error', () => { caption.textContent = T('unavailable'); });
            preview.append(media);
            if (asset.kind === 'video') void media.play().catch(() => {});
        } else caption.textContent = `${asset.name} — ${asset.file || T('unavailable')}`;
        preview.append(caption);
        preview.showPopover();
        const rect = tag.getBoundingClientRect();
        const width = preview.offsetWidth, height = preview.offsetHeight;
        preview.style.left = `${Math.max(12, Math.min(rect.left, window.innerWidth - width - 12))}px`;
        preview.style.top = `${Math.max(12, Math.min(rect.bottom + 6, window.innerHeight - height - 12))}px`;
    }
    textOf(node) {
        if (node.nodeType === Node.TEXT_NODE) return node.data;
        if (node.dataset?.tail != null) return '';
        if (node.dataset?.mention != null) return node.dataset.mention;
        if (node.nodeName === 'BR') return '\n';
        return [...node.childNodes].map(child => this.textOf(child)).join('');
    }
    offsetAt(node, offset) {
        let result = 0, found = false;
        const visit = current => {
            if (found) return;
            if (current === node) {
                result += current.nodeType === Node.TEXT_NODE ? offset
                    : [...current.childNodes].slice(0, offset).reduce((sum, child) => sum + this.textOf(child).length, 0);
                found = true; return;
            }
            if (current.nodeType === Node.TEXT_NODE || current.dataset?.mention != null || current.nodeName === 'BR') {
                result += this.textOf(current).length; return;
            }
            for (const child of current.childNodes) visit(child);
        };
        visit(this.editor);
        return found ? result : null;
    }
    syncSelection() {
        const selection = this.shadowRoot.getSelection?.() || window.getSelection();
        if (!selection?.rangeCount) return;
        const start = this.offsetAt(selection.anchorNode, selection.anchorOffset);
        const end = this.offsetAt(selection.focusNode, selection.focusOffset);
        if (start != null && end != null) this.nativeSelection.call(this.textarea, Math.min(start, end), Math.max(start, end));
    }
    setSelection(start, end = start) {
        const locate = offset => {
            const visit = parent => {
                for (const node of parent.childNodes) {
                    const length = this.textOf(node).length;
                    if (offset <= length) {
                        if (node.nodeType === Node.TEXT_NODE) return [node, offset];
                        if (node.dataset?.mention != null || node.nodeName === 'BR') {
                            const index = [...parent.childNodes].indexOf(node);
                            return [parent, index + (offset > 0 ? 1 : 0)];
                        }
                        return visit(node);
                    }
                    offset -= length;
                }
                return [parent, parent.childNodes.length];
            };
            return visit(this.editor);
        };
        const range = document.createRange();
        range.setStart(...locate(start)); range.setEnd(...locate(end));
        const selection = this.shadowRoot.getSelection?.() || window.getSelection();
        selection.removeAllRanges(); selection.addRange(range);
    }
    beforeInput(event) {
        if (this.textarea.readOnly || this.textarea.disabled) { event.preventDefault(); return; }
        this.syncSelection();
        if (event.isComposing || this.composing) {
            const start = this.textarea.selectionStart, end = this.textarea.selectionEnd;
            if (assetMentionRanges(this.textarea.value, this.assets).some(range => start === end
                ? start > range.start && start < range.end : start < range.end && end > range.start)) event.preventDefault();
            return;
        }
        event.preventDefault();
        const ta = this.textarea;
        let start = ta.selectionStart, end = ta.selectionEnd, text = event.data || '';
        if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
            undoRichPrompt(ta, event.inputType === 'historyRedo'); return;
        }
        if (event.inputType === 'insertParagraph' || event.inputType === 'insertLineBreak') text = '\n';
        else if (event.inputType.startsWith('delete')) {
            text = '';
            if (start === end) {
                if (event.inputType.endsWith('Backward')) start = Math.max(0, start - (ta.value.codePointAt(start - 2) > 0xffff ? 2 : 1));
                else end = Math.min(ta.value.length, end + (ta.value.codePointAt(end) > 0xffff ? 2 : 1));
            }
        } else if (!event.inputType.startsWith('insert')) return;
        if (start === end && event.inputType.startsWith('insert') && text) {
            for (const range of assetMentionRanges(ta.value, this.assets)) {
                if (start === range.end && /^[\p{L}\p{N}_]/u.test(text)) text = ' ' + text;
                if (start === range.start && /[\p{L}\p{N}_]$/u.test(text)) text += ' ';
            }
        }
        replaceRichPromptRange(ta, text, start, end, false, event.inputType);
    }
    commitDom() {
        const ta = this.textarea;
        const selection = this.shadowRoot.getSelection?.() || window.getSelection();
        const anchor = selection?.rangeCount ? this.offsetAt(selection.anchorNode, selection.anchorOffset) : null;
        const focus = selection?.rangeCount ? this.offsetAt(selection.focusNode, selection.focusOffset) : null;
        const start = anchor == null ? ta.selectionStart : Math.min(anchor, focus);
        const end = anchor == null ? ta.selectionEnd : Math.max(anchor, focus);
        this.syncing = true;
        ta.value = this.textOf(this.editor);
        ta.dispatchEvent(new Event('input', {bubbles: true}));
        this.syncing = false;
        this.configure(ta, this.assets);
        ta.setSelectionRange(start, end);
    }
    paste(event) {
        event.stopImmediatePropagation();
        if (this.textarea?.readOnly || this.textarea?.disabled) { event.preventDefault(); return; }
        event.preventDefault(); this.syncSelection();
        let text = (event.clipboardData?.getData('text/plain') || '').replace(/\r\n?/g, '\n');
        const ta = this.textarea;
        if (ta.selectionStart === ta.selectionEnd && event.clipboardData?.getData('application/x-cap-rich-prompt-line') === '1') {
            const next = ta.value.indexOf('\n', ta.selectionStart);
            const offset = next < 0 ? ta.value.length : next;
            ta.setSelectionRange(offset, offset);
            text = '\n' + text.replace(/\n$/, '');
        }
        replaceRichPromptRange(ta, text);
    }
    copy(event) {
        this.syncSelection();
        const ta = this.textarea;
        let text = ta.value.slice(ta.selectionStart, ta.selectionEnd);
        if (ta.selectionStart === ta.selectionEnd) {
            const start = ta.value.lastIndexOf('\n', Math.max(0, ta.selectionStart - 1)) + 1;
            const next = ta.value.indexOf('\n', ta.selectionStart);
            text = ta.value.slice(start, next < 0 ? ta.value.length : next) + '\n';
            event.clipboardData?.setData('application/x-cap-rich-prompt-line', '1');
        }
        event.clipboardData?.setData('text/plain', text);
        event.preventDefault();
    }
    bindTextarea(textarea) {
        this.textarea = textarea;
        this._capPromptTextarea = textarea;
        const nativeValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');
        this.nativeSelection = textarea.setSelectionRange;
        this.nativeFocus = textarea.focus;
        this.originalDisplay = textarea.style.display;
        Object.defineProperty(textarea, 'value', {
            configurable: true,
            get: () => nativeValue.get.call(textarea),
            set: value => { nativeValue.set.call(textarea, value); if (!this.syncing) this.configure(textarea, this.assets); },
        });
        textarea.setSelectionRange = (start, end, direction) => {
            this.nativeSelection.call(textarea, start, end, direction);
            if (this.shadowRoot.activeElement === this.editor) this.setSelection(start, end);
        };
        textarea.focus = () => { this.editor.focus(); this.setSelection(textarea.selectionStart, textarea.selectionEnd); };
        textarea._capInlineEditor = this;
        textarea._capProtectedRanges = () => assetMentionRanges(textarea.value, this.assets);
        const cs = getComputedStyle(textarea);
        this.style.flex = cs.flex;
        const fill = Number(cs.flexGrow) > 0;
        this.toggleAttribute('fill', fill);
        this.editor.style.minHeight = fill ? '0' : `${Math.max(60, parseFloat(cs.minHeight) || parseFloat(cs.height) || 100)}px`;
        this.editor.style.maxHeight = fill ? 'none' : cs.maxHeight;
        textarea.style.display = 'none';
        if (textarea._capMirror) textarea._capMirror.hidden = true;
        this.observer = new MutationObserver(() => this.configure(textarea, this.assets));
        this.observer.observe(textarea, {attributes: true, attributeFilter: ['readonly', 'disabled', 'placeholder', 'aria-label']});
    }
    appendText(text, offset) {
        const fullText = this.textarea.value;
        for (const part of text.split(/(?<=\n)/)) {
            const start = fullText.lastIndexOf('\n', Math.max(0, offset - 1)) + 1;
            const end = fullText.indexOf('\n', offset);
            const node = document.createTextNode(part);
            if (isPromptComment(fullText.slice(start, end < 0 ? fullText.length : end))) {
                const span = document.createElement('span'); span.className = 'comment'; span.append(node); this.editor.append(span);
            } else this.editor.append(node);
            offset += part.length;
        }
    }

    configure(textarea, assets) {
        this.assets = assets;
        if (!this.textarea) this.bindTextarea(textarea);
        if (this.syncing || this.composing) return;
        this.hidePreview();
        this.editor.contentEditable = String(!textarea.readOnly && !textarea.disabled);
        this.editor.setAttribute('aria-disabled', String(textarea.disabled));
        this.editor.setAttribute('aria-label', textarea.getAttribute('aria-label') || textarea.placeholder || T('title'));
        this.editor.dataset.placeholder = textarea.placeholder;
        if (this.renderedValue === textarea.value && this.renderedAssets === assets) return;
        const selectionStart = textarea.selectionStart, selectionEnd = textarea.selectionEnd;
        const focused = this.shadowRoot.activeElement === this.editor;
        this.editor.replaceChildren();
        const ranges = assetMentionRanges(textarea.value, assets);
        let offset = 0;
        for (const range of ranges) {
            this.appendText(textarea.value.slice(offset, range.start), offset);
            const tag = document.createElement('span');
            tag.className = 'tag'; tag.contentEditable = 'false';
            const lineStart = textarea.value.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1;
            if (isPromptComment(textarea.value.slice(lineStart))) tag.classList.add('comment');
            tag.dataset.mention = textarea.value.slice(range.start, range.end);
            tag.tabIndex = 0;
            tag.addEventListener('pointerenter', () => this.showPreview(tag, range.assets[0]));
            tag.addEventListener('pointerleave', () => this.hidePreview());
            tag.addEventListener('focusin', () => this.showPreview(tag, range.assets[0]));
            tag.addEventListener('focusout', () => this.hidePreview());
            const name = document.createElement('span'); name.className = 'name'; name.textContent = tag.dataset.mention;
            const remove = document.createElement('cap-button');
            remove.setAttribute('size', 'small'); remove.setAttribute('shape', 'square'); remove.setAttribute('variant', 'danger');
            remove.setAttribute('aria-label', `${T('remove')}: ${name.textContent}`); remove.title = `${T('remove')}: ${name.textContent}`;
            remove.innerHTML = iconHtml('close', 12); remove.hidden = textarea.readOnly; remove.disabled = textarea.disabled;
            remove.addEventListener('pointerdown', event => event.preventDefault());
            remove.addEventListener('click', () => replaceRichPromptRange(textarea, '', range.start, range.end, true));
            tag.append(name, remove); this.editor.append(tag); offset = range.end;
        }
        this.appendText(textarea.value.slice(offset), offset);
        if (textarea.value.endsWith('\n')) {
            const tail = document.createElement('br'); tail.dataset.tail = ''; this.editor.append(tail);
        }
        this.renderedValue = textarea.value; this.renderedAssets = assets;
        if (focused) this.setSelection(selectionStart, selectionEnd);
    }
}
customElements.define('cap-inline-prompt', InlinePromptEditor);
