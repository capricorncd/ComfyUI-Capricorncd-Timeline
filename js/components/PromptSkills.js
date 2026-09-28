import './Button.js';
import './FormControls.js';
import { makeT } from '../cap_i18n.js';
import { iconHtml } from '../cap_icons.js';

const t = makeT({
    zh: {empty: '此 Clip 尚未绑定 Prompt Skill', add: '添加自定义 Skill', name: 'Skill 名称', text: 'Skill 内容', enabled: '启用', remove: '删除绑定', import: '导入', export: '导出列表', invalid: '无法导入：请使用 Skill JSON、Markdown 或 TXT 文件'},
    en: {empty: 'No Prompt Skills bound to this Clip', add: 'Add custom Skill', name: 'Skill name', text: 'Skill content', enabled: 'Enabled', remove: 'Remove binding', import: 'Import', export: 'Export list', invalid: 'Cannot import: use Skill JSON, Markdown or TXT files'},
    ja: {empty: 'この Clip に Prompt Skill はありません', add: 'カスタム Skill を追加', name: 'Skill 名', text: 'Skill 内容', enabled: '有効', remove: '関連付けを削除', import: 'インポート', export: '一覧をエクスポート', invalid: 'Skill JSON、Markdown または TXT ファイルを使用してください'},
});

export function copyPromptSkills(rows) {
    return Array.isArray(rows) ? rows.map(row => ({...row})) : [];
}

export function enabledPromptSkills(rows) {
    return copyPromptSkills(rows).filter(row => row.enabled !== false).map(row => String(row.text || '').trim()).filter(Boolean).join('\n\n');
}

export function parsePromptSkills(text, filename, createId = () => crypto.randomUUID()) {
    if (!filename.toLowerCase().endsWith('.json')) {
        if (!/\.(md|txt)$/i.test(filename) || !text.trim()) throw new Error('Invalid skill file');
        return [{id: createId(), name: filename.replace(/\.[^.]+$/, ''), text, enabled: true}];
    }
    const data = JSON.parse(text);
    if (data.schema_version !== 1 || !Array.isArray(data.prompt_skills)) throw new Error('Invalid skill document');
    const ids = new Set();
    return data.prompt_skills.map(row => {
        if (!row || typeof row.id !== 'string' || !row.id.trim() || ids.has(row.id) ||
            typeof row.name !== 'string' || typeof row.text !== 'string' || typeof row.enabled !== 'boolean') throw new Error('Invalid skill entry');
        ids.add(row.id);
        return {id: row.id, name: row.name, text: row.text, enabled: row.enabled};
    });
}

export function mergePromptSkills(current, incoming, createId = () => crypto.randomUUID()) {
    const result = copyPromptSkills(current);
    for (const row of incoming) {
        const existing = result.find(item => item.id === row.id);
        if (existing && existing.text === row.text && existing.name === row.name) continue;
        result.push({...row, id: existing ? createId() : row.id});
    }
    return result;
}

class PromptSkills extends HTMLElement {
    constructor() {
        super();
        this.attachShadow({mode: 'open'});
        this.rows = [];
    }
    configure(rows, disabled = false) {
        this.version = (this.version || 0) + 1;
        this.rows = copyPromptSkills(rows);
        this.disabled = disabled;
        this.render();
    }
    commit(rows) {
        this.rows = copyPromptSkills(rows);
        this.dispatchEvent(new CustomEvent('skills-change', {detail: {rows: copyPromptSkills(rows)}, bubbles: true}));
    }
    render() {
        this.shadowRoot.innerHTML = `<style>
            :host { display: block; color: var(--cat-text); }
            .actions { display: flex; gap: 8px; flex-wrap: wrap; }
            .list { display: grid; gap: 12px; }
            article { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--cat-border-soft); border-radius: 6px; min-width: 0; }
            header { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
            cap-input { flex: 1; min-width: 100px; }
            label { display: inline-flex; align-items: center; gap: 4px; }
            input[type=checkbox] { accent-color: var(--cat-accent); }
            p { color: var(--cat-muted); margin: 0; }
        </style><div class="list"></div>`;
        const list = this.shadowRoot.querySelector('.list');
        if (!this.rows.length) {
            const empty = document.createElement('p'); empty.textContent = t('empty'); list.append(empty);
        }
        this.rows.forEach((row, index) => {
            const article = document.createElement('article');
            const header = document.createElement('header');
            const nameWrap = document.createElement('cap-input');
            const name = document.createElement('input'); name.value = row.name || ''; name.setAttribute('aria-label', t('name')); name.disabled = this.disabled;
            nameWrap.append(name);
            const label = document.createElement('label');
            const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = row.enabled !== false; enabled.disabled = this.disabled;
            label.append(enabled, t('enabled'));
            const remove = document.createElement('cap-button'); remove.setAttribute('variant', 'danger'); remove.setAttribute('shape', 'square');
            remove.setAttribute('aria-label', t('remove')); remove.title = t('remove'); remove.innerHTML = iconHtml('trash', 14); remove.disabled = this.disabled;
            const textWrap = document.createElement('cap-textarea');
            const text = document.createElement('textarea'); text.rows = 4; text.value = row.text || ''; text.setAttribute('aria-label', t('text')); text.disabled = this.disabled;
            textWrap.append(text);
            const update = (key, value) => this.commit(this.rows.map((item, i) => i === index ? {...item, [key]: value} : item));
            name.addEventListener('change', () => update('name', name.value));
            text.addEventListener('change', () => update('text', text.value));
            enabled.addEventListener('change', () => update('enabled', enabled.checked));
            remove.addEventListener('click', () => { this.commit(this.rows.filter((_, i) => i !== index)); this.render(); });
            header.append(nameWrap, label, remove); article.append(header, textWrap); list.append(article);
        });

    }
}
customElements.define('cap-prompt-skills', PromptSkills);
