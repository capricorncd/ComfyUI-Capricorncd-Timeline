import './Button.js';
import './Dialog.js';
import './StatusMessage.js';
import './PromptTemplateActions.js';
import { iconHtml } from '../cap_icons.js';
import { t } from '../i18n/prompt_library.js';
import { setRichPromptValue } from './RichPrompt.js';

export class PromptHistoryActions extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode:'open'}).innerHTML = `<style>
            :host { position:absolute; bottom:4px; left:4px; right:4px; z-index:3; display:flex; justify-content:flex-end; gap:4px; pointer-events:none; }
            cap-prompt-template-actions { margin-right:auto; }
            cap-button { pointer-events:auto; }
            cap-dialog { pointer-events:auto; }
        </style>`;
        this.templates = document.createElement('cap-prompt-template-actions');
        this.shadowRoot.append(this.templates);
        for (const [action, icon, label] of [['history','history','tab_history'],['save','save','save_current_prompt_to_history_title'],['copy','copy','copy_prompt_title']]) {
            const button = document.createElement('cap-button');
            button.dataset.action = action;
            button.setAttribute('size','small'); button.setAttribute('shape','square');
            button.title = t(label); button.setAttribute('aria-label',t(label));
            button.innerHTML = iconHtml(icon,12);
            button.addEventListener('click', () => this[action](button));
            this.shadowRoot.append(button);
        }
    }
    bind(textarea, read, write, {copyOnly = false, getAssets = () => []} = {}) {
        this.textarea=textarea; this.read=read; this.write=write;
        this.templates.hidden = copyOnly;
        this.templates.bind(textarea, getAssets);
        for (const button of this.shadowRoot.querySelectorAll('cap-button')) {
            button.hidden = copyOnly && button.dataset.action !== 'copy';
        }
    }
    save(button) {
        const text = this.textarea.value;
        if (!text.trim()) return;
        const data = this.read();
        this.write({...data, items:[{id:crypto.randomUUID(),text,created_at:new Date().toISOString()}, ...data.items.filter(row=>row.text!==text)]});
        this.feedback(button);
    }
    feedback(button) {
        const original = button.innerHTML;
        button.innerHTML = iconHtml('check',12);
        button.setAttribute('variant','success');
        setTimeout(()=>{button.innerHTML=original;button.removeAttribute('variant');},1200);
    }
    async copy(button) {
        try { await navigator.clipboard.writeText(this.textarea.value); this.feedback(button); }
        catch { button.title=t('copy_failed_title'); }
    }
    importDocument(data) {
        if (!data || !Array.isArray(data.items) || (data.schema_version != null && data.schema_version !== 1)
            || data.items.some(row => !row || typeof row.text !== 'string')) {
            throw new Error(t('invalid_json_format_alert'));
        }
        const current = this.read();
        const texts = new Set(current.items.map(row => row.text));
        const added = [];
        for (const row of data.items) {
            if (!row.text.trim() || texts.has(row.text)) continue;
            texts.add(row.text);
            added.push({
                id: crypto.randomUUID(), text: row.text,
                created_at: typeof row.created_at === 'string' && Number.isFinite(Date.parse(row.created_at))
                    ? row.created_at : new Date().toISOString(),
            });
        }
        if (added.length) this.write({...current, items: [...added, ...current.items]});
        return added.length;
    }

    exportDocument() {
        const blob = new Blob([JSON.stringify(this.read(), null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'prompt_history.json';
        this.shadowRoot.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    history() {
        const dialog=document.createElement('cap-dialog');
        dialog.style.setProperty('--cap-dialog-width','640px');
        dialog.style.setProperty('--cap-dialog-height','fit-content');
        dialog.style.setProperty('--cap-dialog-min-width','320px');
        dialog.style.setProperty('--cap-dialog-min-height','240px');
        const title=document.createElement('span'); title.slot='title';title.textContent=t('tab_history');
        const list=document.createElement('div'); list.style.cssText='padding:20px 28px;display:grid;gap:16px';
        const render=()=>{
            list.replaceChildren();
            const rows=this.read().items;
            if(!rows.length) list.textContent=t('no_history');
            for(const row of rows){
                const card=document.createElement('section');
                const time=document.createElement('small');time.textContent=new Date(row.created_at).toLocaleString();
                const text=document.createElement('cap-readonly-prompt');
                text.style.margin='8px 0';text.value=row.text;
                text.setAttribute('aria-label',t('tab_history'));
                const apply=document.createElement('cap-button');apply.textContent=t('replace_all_title');
                apply.disabled=this.textarea.disabled||this.textarea.readOnly;
                apply.onclick=()=>{
                    if(this.textarea.disabled||this.textarea.readOnly)return;
                    this.textarea.dispatchEvent(new Event('focus'));
                    setRichPromptValue(this.textarea,row.text,true);
                    this.textarea.dispatchEvent(new Event('input',{bubbles:true}));
                    this.textarea.dispatchEvent(new Event('change',{bubbles:true}));
                    dialog.close();
                };
                const remove=document.createElement('cap-button');remove.setAttribute('variant','danger');remove.textContent=t('delete_title');
                remove.onclick=()=>{const data=this.read();this.write({...data,items:data.items.filter(item=>item.id!==row.id)});render();};
                const buttons=document.createElement('div');
                buttons.style.cssText='display:flex;flex-wrap:wrap;gap:8px';
                buttons.append(apply,remove);
                card.append(time,text,buttons);list.append(card);
            }
        };
        const footer = document.createElement('div');
        footer.slot = 'footer';
        const status = document.createElement('cap-status-message');
        status.hidden = true;
        const picker = document.createElement('input');
        picker.type = 'file';
        picker.accept = '.json,application/json';
        picker.hidden = true;
        const importButton = document.createElement('cap-button');
        importButton.textContent = t('import_btn');
        importButton.addEventListener('click', () => picker.click());
        picker.addEventListener('change', async () => {
            const file = picker.files?.[0];
            if (!file) return;
            importButton.disabled = true;
            try {
                const text = await file.text();
                if (!dialog.open) return;
                const count = this.importDocument(JSON.parse(text.replace(/^\uFEFF/, '')));
                render();
                status.setStatus(t('history_imported', {n: count}), 'success');
            } catch (error) {
                status.setStatus(`${t('json_parse_failed')}: ${error.message}`, 'error');
            } finally {
                picker.value = '';
                importButton.disabled = false;
            }
        });
        const exportButton = document.createElement('cap-button');
        exportButton.textContent = t('export_btn');
        exportButton.addEventListener('click', () => {
            try { this.exportDocument(); }
            catch (error) { status.setStatus(error.message, 'error'); }
        });
        footer.append(importButton, exportButton, picker);
        dialog.append(title,list,status,footer);this.shadowRoot.append(dialog);render();dialog.showModal();
        dialog.addEventListener('close',()=>dialog.remove(),{once:true});
    }
}
customElements.define('cap-prompt-history-actions',PromptHistoryActions);

export class ReadonlyPrompt extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode:'open'}).innerHTML = `<style>
            :host { display:block; min-width:0; }
            .field { position:relative; padding-bottom:32px; border:1px solid var(--cat-border); border-radius:6px; background:var(--cat-input); }
            textarea { display:block; box-sizing:border-box; width:100%; padding:10px; border:0; resize:none; overflow:hidden; background:transparent; color:var(--cat-text); font:inherit; line-height:1.65; }
        </style><div class="field"><textarea readonly></textarea><cap-prompt-history-actions></cap-prompt-history-actions></div>`;
        this.textarea = this.shadowRoot.querySelector('textarea');
        this.shadowRoot.querySelector('cap-prompt-history-actions').bind(this.textarea, null, null, {copyOnly:true});
    }
    get value() { return this.textarea.value; }
    set value(text) { this.textarea.value = text || ''; if (this.isConnected) this.resize(); }
    resize() {
        this.textarea.style.height = 'auto';
        this.textarea.style.height = `${this.textarea.scrollHeight}px`;
    }
    connectedCallback() {
        this.textarea.setAttribute('aria-label', this.getAttribute('aria-label') || t('copy_prompt_title'));
        let width = 0;
        this.observer = new ResizeObserver(([entry]) => {
            if (entry.contentRect.width === width) return;
            width = entry.contentRect.width; this.resize();
        });
        this.observer.observe(this);
        requestAnimationFrame(() => { if (this.isConnected) this.resize(); });
    }
    disconnectedCallback() { this.observer?.disconnect(); }
}
customElements.define('cap-readonly-prompt',ReadonlyPrompt);
