import './Button.js';
import './HelpIcon.js';
import './DropdownButton.js';
import './ContextMenu.js';
import './Dialog.js';
import './StatusMessage.js';
import { iconHtml } from '../cap_icons.js';
import { t } from '../i18n/prompt_templates.js';
import { replaceRichPromptRange } from './RichPrompt.js';
import { assetMentionRanges } from './InlinePromptEditor.js';
import { stripPromptComments } from '../prompt_text.js';
import { readPromptTemplates, writePromptTemplates, sortPromptTemplates, mergePromptTemplates } from '../editor/PromptTemplates.js';

export function mentionedPromptAssets(text, assets) {
    return [...new Map(assetMentionRanges(stripPromptComments(text), assets)
        .flatMap(range => range.assets).map(asset => [asset.id, asset])).values()];
}

export class PromptTemplateActions extends HTMLElement {
    constructor() {
        super();
        const root = this.attachShadow({mode: 'open'});
        root.innerHTML = `<style>
            :host {display:flex;gap:4px;pointer-events:auto;}
            :host([hidden]) {display:none;}
            .manager {padding:20px 28px;display:grid;gap:16px;}
            .hint {margin:0;color:var(--cat-muted);line-height:1.6;}
            .row {display:grid;gap:8px;padding-bottom:16px;border-bottom:1px solid var(--cat-border-soft);}
            .row input,.row textarea {box-sizing:border-box;width:100%;padding:8px;border:1px solid var(--cat-border);border-radius:6px;background:var(--cat-input);color:var(--cat-text);font:inherit;}
            .row textarea {resize:vertical;min-height:120px;line-height:1.6;}
            .rating {display:flex;align-items:center;gap:4px;flex-wrap:wrap;}
            .rating .delete {margin-left:auto;}
        </style>`;
        for (const [action, icon] of [['templates', 'listCollapse'], ['references', 'insert']]) {
            const button = document.createElement('cap-dropdown-button');
            button.setAttribute('size', 'small');
            button.setAttribute('hide-caret', '');
            button.title = t(action); button.setAttribute('aria-label', t(action));
            button.innerHTML = iconHtml(icon, 12);
            button.bindMenu(() => this.openMenu(button, action));
            root.append(button);
        }
        const help = document.createElement('cap-help-icon');
        help.configure(t('help'), t('help_text'));
        root.append(help);
    }

    bind(textarea, getAssets = () => []) {
        this.textarea = textarea;
        this.getAssets = getAssets;
    }

    openMenu(button, action) {
        const ta = this.textarea;
        const selection = [ta.selectionStart, ta.selectionEnd];
        const insert = text => {
            if (ta.disabled || ta.readOnly) return;
            replaceRichPromptRange(ta, text, ...selection);
            ta.dispatchEvent(new Event('change', {bubbles: true}));
        };
        const menu = document.createElement('cap-context-menu');
        let items;
        if (action === 'templates') {
            try {
                items = sortPromptTemplates(readPromptTemplates().items).map(row => ({
                    label: row.name, icon: 'listCollapse', disabled: !row.text.trim() || ta.disabled || ta.readOnly, fn: () => insert(row.text),
                }));
            } catch (error) {
                items = [{label: error.message, disabled: true}];
            }
            items.push({separator: true}, {label: t('manage'), icon: 'pencil', fn: () => this.manage()});
        } else {
            items = mentionedPromptAssets(ta.value, this.getAssets()).map(asset => ({
                label: `@${asset.name}${asset.description ? '' : ' — ' + t('no_description')}`,
                icon: 'insert', disabled: !asset.description || ta.disabled || ta.readOnly,
                fn: () => insert(asset.description),
            }));
            if (!items.length) items.push({label: t('empty'), disabled: true});
        }
        menu.setItems(items);
        menu.addEventListener('menu-select', event => { event.detail.fn(); menu.remove(); });
        menu.addEventListener('menu-close', event => {
            menu.remove();
            if (event.detail.restoreFocus) button.focus();
        });
        this.shadowRoot.append(menu);
        const rect = button.getBoundingClientRect();
        const bounds = menu.getBoundingClientRect();
        menu.style.left = `${Math.max(8, Math.min(rect.left, innerWidth - bounds.width - 8))}px`;
        menu.style.top = `${Math.max(8, rect.top - bounds.height - 4)}px`;
        return menu;
    }

    manage() {
        if (this.dialog?.open) return;
        const dialog = this.dialog = document.createElement('cap-dialog');
        dialog.width = 720; dialog.height = 640; dialog.minWidth = 320; dialog.minHeight = 280;
        const title = document.createElement('span'); title.slot = 'title'; title.textContent = t('manage');
        const body = document.createElement('div'); body.className = 'manager';
        const hint = document.createElement('p'); hint.className = 'hint'; hint.textContent = t('hint');
        const status = document.createElement('cap-status-message'); status.hidden = true;
        const list = document.createElement('div');
        list.style.cssText = 'display:grid;gap:16px';
        body.append(hint, status, list);
        let data;
        const save = () => {
            try { writePromptTemplates(data); status.setStatus(t('saved'), 'success'); return true; }
            catch (error) { status.setStatus(`${t('error')}: ${error.message}`, 'error'); return false; }
        };
        const render = () => {
            list.replaceChildren();
            for (const row of sortPromptTemplates(data.items)) {
                const card = document.createElement('section'); card.className = 'row';
                const name = document.createElement('input'); name.value = row.name; name.setAttribute('aria-label', t('name'));
                const text = document.createElement('textarea'); text.rows = 5; text.value = row.text; text.setAttribute('aria-label', t('text'));
                name.addEventListener('input', () => { row.name = name.value.trim(); if (row.name) save(); });
                text.addEventListener('input', () => { row.text = text.value; save(); });
                const rating = document.createElement('div'); rating.className = 'rating';
                for (let n = 1; n <= 5; n++) {
                    const star = document.createElement('cap-button');
                    star.setAttribute('shape', 'square'); star.setAttribute('size', 'small');
                    star.setAttribute('variant', n <= row.stars ? 'amber' : 'ghost');
                    star.setAttribute('aria-pressed', String(n <= row.stars));
                    star.title = t('stars', {n}); star.setAttribute('aria-label', star.title);
                    star.innerHTML = iconHtml('star', 14);
                    star.addEventListener('click', () => { row.stars = row.stars === n ? 0 : n; if (save()) render(); });
                    rating.append(star);
                }
                const remove = document.createElement('cap-button'); remove.className = 'delete';
                remove.setAttribute('variant', 'danger'); remove.setAttribute('shape', 'square');
                remove.title = t('remove'); remove.setAttribute('aria-label', remove.title); remove.innerHTML = iconHtml('trash', 14);
                remove.addEventListener('click', () => { data.items = data.items.filter(item => item.id !== row.id); if (save()) render(); });
                rating.append(remove); card.append(name, rating, text); list.append(card);
            }
        };
        const footer = document.createElement('div'); footer.slot = 'footer';
        const picker = document.createElement('input'); picker.type = 'file'; picker.accept = '.json,application/json'; picker.hidden = true;
        for (const action of ['add', 'import', 'export']) {
            const button = document.createElement('cap-button'); button.textContent = t(action);
            button.addEventListener('click', () => {
                if (action === 'import') { picker.click(); return; }
                if (!data) return;
                if (action === 'add') {
                    const row = {id: crypto.randomUUID(), name: t('untitled'), text: '', stars: 0};
                    data.items.push(row); if (save()) render();
                    list.lastElementChild?.querySelector('input')?.focus();
                } else {
                    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
                    const link = document.createElement('a'); link.href = url; link.download = 'prompt_templates.json';
                    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            });
            footer.append(button);
        }
        picker.addEventListener('change', async () => {
            const file = picker.files?.[0]; if (!file) return;
            try {
                const imported = JSON.parse((await file.text()).replace(/^\uFEFF/, ''));
                if (!dialog.open) return;
                data = mergePromptTemplates(data || {schema_version: 1, items: []}, imported);
                if (save()) { render(); status.setStatus(t('imported'), 'success'); }
            } catch (error) { status.setStatus(error.message, 'error'); }
            finally { picker.value = ''; }
        });
        footer.append(picker); dialog.append(title, body, footer); this.shadowRoot.append(dialog);
        try { data = readPromptTemplates(); render(); }
        catch (error) { status.setStatus(error.message, 'error'); }
        dialog.addEventListener('close', () => { dialog.remove(); this.dialog = null; }, {once: true});
        dialog.showModal();
    }
}

customElements.define('cap-prompt-template-actions', PromptTemplateActions);
