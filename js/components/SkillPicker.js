import './Dialog.js';
import './StatusMessage.js';
import { parsePromptSkills } from './PromptSkills.js';
import { makeT } from '../cap_i18n.js';
const t = makeT({
    zh: {official:'官方', community:'社区', custom:'自定义', no_preview:'暂无预览', add:'新增 Skill', import:'导入', export:'导出列表', name:'Skill 名称', text:'提示词文本', media:'预览素材（可选 GIF / MP4 / WebM）', save:'保存到 Skill 库', local:'导入与新增保存到本地 Skill 库。导出包含自定义 Skill 和当前 Clip 绑定的 Skill。', error:'操作失败：{msg}'},
    en: {official:'Official', community:'Community', custom:'Custom', no_preview:'No preview available', add:'New Skill', import:'Import', export:'Export list', name:'Skill name', text:'Prompt text', media:'Optional preview (GIF / MP4 / WebM)', save:'Save to library', local:'New and imported Skills are saved locally. Export includes custom Skills and the current Clip bindings.', error:'Operation failed: {msg}'},
    ja: {official:'公式', community:'コミュニティ', custom:'カスタム', no_preview:'プレビューなし', add:'Skill を追加', import:'インポート', export:'一覧を書き出す', name:'Skill 名', text:'プロンプト本文', media:'プレビュー（任意 GIF / MP4 / WebM）', save:'ライブラリに保存', local:'追加・インポートはローカルに保存します。カスタム Skill と現在の Clip の関連付けを書き出します。', error:'操作に失敗：{msg}'},
});

function readDataURL(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}
import { t as T } from '../i18n/timeline_editor.js';

export class SkillPicker extends HTMLElement {
    constructor() {
        super();
        this.skills = [];
        this.attachShadow({ mode: 'open' }).innerHTML = `
            <style>
                :host { display: contents; }
                cap-dialog { --cap-dialog-width: 960px; --cap-dialog-height: 760px; }
                input { margin: 20px 28px 0; padding: 8px; background: var(--cat-bg, #101b20); color: var(--cat-text, #e4edeb); border: 1px solid var(--cat-border, #34464b); border-radius: 4px; font: inherit; }
                .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 16px; padding: 0 28px 20px; }
                .card { display: flex; flex-direction: column; gap: 8px; min-width: 0; padding: 12px; border: 1px solid var(--cat-border, #34464b); border-radius: 6px; }
                .preview { aspect-ratio: 16/10; display: grid; place-items: center; background: var(--cat-bg, #101b20); color: var(--cat-muted, #a3b5b8); border-radius: 4px; overflow: hidden; }
                .form { display: grid; gap: 12px; padding: 20px 28px; }
                .form[hidden] { display: none; }
                label { display: grid; gap: 6px; }
                textarea { min-height: 180px; font: inherit; }
                .form input { margin: 0; }
                .actions { display: flex; flex-wrap: wrap; gap: 8px; }
                .hint { color: var(--cat-muted, #a3b5b8); margin: 12px 28px; }
                img, video { width: 100%; height: 100%; object-fit: contain; }
                .name { overflow-wrap: anywhere; line-height: 1.4; flex: 1; }
                .status { grid-column: 1/-1; padding: 24px; text-align: center; }
            </style>
            <cap-dialog><span slot="title"></span><input type="search"><p class="hint"></p><div class="form" hidden><label class="name-label"><input class="name"></label><label class="text-label"><textarea></textarea></label><label class="media-label"><input class="media" type="file" accept=".gif,.mp4,.webm"></label><div class="actions"><cap-button class="cancel"></cap-button><cap-button class="save" variant="primary"></cap-button></div></div><div class="grid"></div><div slot="footer"><cap-status-message></cap-status-message><div class="actions"><cap-button class="add"></cap-button><cap-button class="import"></cap-button><cap-button class="export"></cap-button><input class="import-file" type="file" accept=".json,.md,.txt" multiple hidden></div></div></cap-dialog>`;
        this.dialog = this.shadowRoot.querySelector('cap-dialog');
        this.dialog.addEventListener('close', () => this.shadowRoot.querySelectorAll('video').forEach(video => video.pause()));
        this.filter = this.shadowRoot.querySelector('input');
        this.grid = this.shadowRoot.querySelector('.grid');
        this.shadowRoot.querySelector('[slot="title"]').textContent = T('select_prompt_skill_title');
        this.dialog.setAttribute('close-label', T('close_title'));
        this.filter.placeholder = T('search_name_placeholder');
        this.filter.setAttribute('aria-label', T('search_name_placeholder'));
        this.filter.addEventListener('input', () => this.render());
        const root = this.shadowRoot;
        this.status = root.querySelector('cap-status-message');
        this.form = root.querySelector('.form');
        root.querySelector('.hint').textContent = t('local');
        for (const key of ['name', 'text', 'media']) root.querySelector(`.${key}-label`).prepend(t(key));
        for (const key of ['add', 'import', 'export', 'save']) root.querySelector(`.${key}`).textContent = t(key);
        root.querySelector('.cancel').textContent = T('cancel_btn');
        root.querySelector('.cancel').addEventListener('click', () => {
            this.form.hidden = true;
            root.querySelector('.add').focus();
        });
        root.querySelector('.add').addEventListener('click', () => {
            this.form.hidden = false;
            this.form.scrollIntoView({block: 'start'});
            root.querySelector('.name').focus({preventScroll: true});
        });
        root.querySelector('.save').addEventListener('click', () => this.run(async () => {
            await this.save(root.querySelector('.name').value, root.querySelector('textarea').value, root.querySelector('.media').files[0]);
            this.form.hidden = true;
            root.querySelector('.name').value = root.querySelector('textarea').value = root.querySelector('.media').value = '';
            await this.reload();
        }));
        const input = root.querySelector('.import-file');
        root.querySelector('.import').addEventListener('click', () => input.click());
        input.addEventListener('change', () => this.run(async () => {
            for (const file of input.files) {
                const text = await file.text();
                const rows = parsePromptSkills(text, file.name);
                const originals = file.name.toLowerCase().endsWith('.json') ? JSON.parse(text).prompt_skills : [];
                for (const row of rows) {
                    const media = originals.find(item => item.id === row.id)?.preview;
                    let preview;
                    if (media) {
                        if (!/^data:(image\/gif|video\/(mp4|webm));base64,/.test(media.data)) throw new Error('Invalid preview');
                        const blob = await (await fetch(media.data)).blob();
                        preview = new File([blob], media.name, {type: blob.type});
                    }
                    await this.save(row.name, row.text, preview);
                }
            }
            input.value = '';
            await this.reload();
        }));
        root.querySelector('.export').addEventListener('click', () => this.run(async () => {
            const rows = new Map((this.boundSkills || []).map(row => [row.id, {...row}]));
            for (const skill of this.skills.filter(row => row.source === 'custom')) {
                const response = await fetch(this.apiURL(`/audio_keyframe_timeline/h3_skill?id=${encodeURIComponent(skill.id)}`));
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const row = {id: skill.id, name: skill.title, text: (await response.json()).text, enabled: true};
                if (skill.has_preview) {
                    const response = await fetch(this.apiURL(`/audio_keyframe_timeline/h3_skill_preview?id=${encodeURIComponent(skill.id)}`));
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                    const blob = await response.blob();
                    const suffix = blob.type.includes('webm') ? 'webm' : blob.type.includes('mp4') ? 'mp4' : 'gif';
                    row.preview = {name: `preview.${suffix}`, data: await readDataURL(blob)};
                }
                if (rows.has(row.id)) Object.assign(row, rows.get(row.id));
                rows.set(row.id, row);
            }
            const url = URL.createObjectURL(new Blob([JSON.stringify({schema_version: 1, prompt_skills: [...rows.values()]}, null, 2)], {type: 'application/json'}));
            const link = document.createElement('a'); link.href = url; link.download = 'prompt-skills.json'; link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        }));
    }

    get open() { return this.dialog.open; }
    close() { this.shadowRoot.querySelectorAll('video').forEach(video => video.pause()); this.dialog.close(); }

    async run(action) {
        const buttons = [...this.shadowRoot.querySelectorAll('.actions cap-button, .save')];
        buttons.forEach(button => { button.disabled = true; });
        this.dialog.closeDisabled = true;
        this.status.textContent = '';
        try { await action(); }
        catch (error) { this.status.setStatus(t('error', {msg: error.message}), 'error'); }
        finally { buttons.forEach(button => { button.disabled = false; }); this.dialog.closeDisabled = false; }
    }

    async save(name, text, preview) {
        const body = new FormData();
        body.append('name', name); body.append('text', text);
        if (preview) body.append('preview', preview);
        const response = await fetch(this.apiURL('/audio_keyframe_timeline/h3_skill_custom'), {method: 'POST', body});
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    }

    async reload() {
        const response = await fetch(this.apiURL('/audio_keyframe_timeline/h3_skills'));
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        this.setSkills((await response.json()).skills || []);
    }

    async show(apiURL, boundSkills = []) {
        this.boundSkills = boundSkills;
        this.apiURL = apiURL;
        this.filter.value = '';
        this.grid.textContent = T('loading_ellipsis');
        this.dialog.showModal();
        try {
            const response = await fetch(apiURL('/audio_keyframe_timeline/h3_skills'));
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const data = await response.json();
            this.setSkills(data.skills || []);
        } catch (error) {
            this.grid.textContent = T('load_failed', { msg: error.message });
        }
    }

    setSkills(skills) { this.skills = skills; this.render(); }

    render() {
        const query = this.filter.value.trim().toLowerCase();
        const rows = this.skills.filter(row => `${row.title} ${row.name || row.id}`.toLowerCase().includes(query));
        this.grid.replaceChildren();
        if (!rows.length) {
            const status = document.createElement('div');
            status.className = 'status';
            status.textContent = T(this.skills.length ? 'no_matching_skill' : 'no_local_skills_hint');
            this.grid.append(status);
        }
        for (const row of rows) {
            const card = document.createElement('div');
            card.className = 'card';
            const preview = document.createElement('div');
            preview.className = 'preview';
            preview.textContent = t('no_preview');
            if (row.has_preview) {
                const image = document.createElement(row.preview_type === 'video' ? 'video' : 'img');
                if (row.preview_type === 'video') { image.controls = true; image.loop = true; image.preload = 'metadata'; }
                image.alt = row.title || row.name;
                image.loading = 'lazy';
                image.src = this.apiURL(`/audio_keyframe_timeline/h3_skill_preview?id=${encodeURIComponent(row.id)}`);
                image.addEventListener('error', () => { preview.textContent = t('no_preview'); });
                preview.replaceChildren(image);
            }
            const name = document.createElement('div');
            name.className = 'name';
            name.textContent = `${t(row.source)} · ${row.title || row.name}`;
            name.title = row.summary || '';
            const apply = document.createElement('cap-button');
            apply.setAttribute('variant', 'primary');
            apply.textContent = T('apply_btn');
            apply.addEventListener('click', () => this.dispatchEvent(new CustomEvent('skill-select', { detail: { skill: row } })));
            card.append(preview, name, apply);
            this.grid.append(card);
        }
    }
}

customElements.define('cap-skill-picker', SkillPicker);
