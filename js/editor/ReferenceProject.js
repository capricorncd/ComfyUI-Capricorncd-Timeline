import '../components/Dialog.js';
import '../components/TabButton.js';
import '../components/StatusMessage.js';
import { makeT } from '../cap_i18n.js';
import { iconHtml } from '../cap_icons.js';

export const referenceT = makeT({
    zh: { title: '加载参考工程', other: '加载其他工程', settings: '全局设置', empty: '暂无 Clip', copy: '复制', copied: '已复制', missing: '素材不可用', loading: '请选择其他工程的 project.json…', unnamed: '未命名', prompt: 'Clip 提示词', text: '字幕文本', style_prompt: '风格提示词', speech_prompt: '语音提示词', width: '宽度', height: '高度', fps: '帧率', prepend_prompt: '全局前置提示词', append_prompt: '全局后置提示词', global_prompt: '全局提示词', negative_prompt: '负面提示词', start_ms: '开始时间（毫秒）', duration_ms: '时长（毫秒）', details: '所有 Clip 信息' },
    en: { title: 'Load reference project', other: 'Load another project', settings: 'Global settings', empty: 'No clips', copy: 'Copy', copied: 'Copied', missing: 'Media unavailable', loading: 'Select another project’s project.json…', unnamed: 'Untitled', prompt: 'Clip prompt', text: 'Subtitle text', style_prompt: 'Style prompt', speech_prompt: 'Speech prompt', width: 'Width', height: 'Height', fps: 'FPS', prepend_prompt: 'Global prepend prompt', append_prompt: 'Global append prompt', global_prompt: 'Global prompt', negative_prompt: 'Negative prompt', start_ms: 'Start (ms)', duration_ms: 'Duration (ms)', details: 'All clip information' },
    ja: { title: '参照プロジェクトを読み込む', other: '別のプロジェクトを読み込む', settings: '全体設定', empty: 'クリップなし', copy: 'コピー', copied: 'コピーしました', missing: '素材が見つかりません', loading: '別のプロジェクトの project.json を選択してください…', unnamed: '無題', prompt: 'クリッププロンプト', text: '字幕', style_prompt: 'スタイルプロンプト', speech_prompt: '音声プロンプト', width: '幅', height: '高さ', fps: 'FPS', prepend_prompt: '前置プロンプト', append_prompt: '後置プロンプト', global_prompt: '全体プロンプト', negative_prompt: 'ネガティブプロンプト', start_ms: '開始（ms）', duration_ms: '長さ（ms）', details: 'クリップの全情報' },
});
const T = referenceT;
const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
};

export function referenceTracks(project) {
    return (project.tracks || []).map((track, index) => ({ track, index })).sort((a, b) => {
        const director = track => track.type === 'director' || track.role === 'director' || track.role === 'main';
        return Number(director(b.track)) - Number(director(a.track));
    });
}

export class ReferenceProject {
    constructor({ host, apiURL }) {
        this.apiURL = apiURL;
        this.dialog = element('cap-dialog');
        this.dialog.className = 'cat-te-reference-project';
        this.title = element('div');
        this.title.className = 'cat-te-reference-title';
        this.projectName = element('span', T('unnamed'));
        this.title.append(element('small', T('title')), this.projectName);
        this.title.slot = 'title';
        this.tabs = element('div');
        this.tabs.className = 'cat-te-reference-tabs';
        this.tabs.setAttribute('role', 'tablist');
        this.tabs.setAttribute('aria-label', T('title'));
        this.body = element('div');
        this.body.className = 'cat-te-reference-body';
        this.body.setAttribute('role', 'tabpanel');
        this.status = element('cap-status-message');
        this.status.hidden = true;
        const footer = element('div');
        footer.slot = 'footer';
        this.loadButton = element('cap-button', T('other'));
        this.loadButton.addEventListener('click', () => void this.load());
        footer.append(this.loadButton);
        this.dialog.append(this.title, this.tabs, this.status, this.body, footer);
        host.append(this.dialog);
        this.dialog.addEventListener('close', () => this.stopMedia());
    }

    async open() {
        if (this.data) this.dialog.show();
        else await this.load();
    }

    async load() {
        if (this.loading) return;
        this.loading = true;
        this.loadButton.disabled = true;
        this.status.setStatus(T('loading'));
        try {
            const response = await fetch(this.apiURL('/audio_keyframe_timeline/reference_project'), {
                method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || response.statusText);
            if (!this.dialog.isConnected) return;
            if (data.cancelled) { this.status.setStatus(''); return; }
            this.stopMedia();
            this.data = data;
            this.projectName.textContent = data.project.name || T('unnamed');
            this.rows = referenceTracks(data.project);
            this.tabs.replaceChildren();
            const names = [...this.rows.map(({ track }) => track.name || track.type || T('unnamed')), T('settings')];
            names.forEach((name, index) => {
                const tab = element('cap-tab-button', index < this.rows.length ? `${name} · ${this.rows[index].track.clips?.length || 0}` : name);
                tab.addEventListener('click', () => this.select(index));
                tab.addEventListener('keydown', event => {
                    const keys = ['ArrowLeft', 'ArrowRight', 'Home', 'End'];
                    if (!keys.includes(event.key)) return;
                    event.preventDefault();
                    const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length - 1
                        : (index + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
                    this.select(next);
                    this.tabs.children[next].focus();
                });
                this.tabs.append(tab);
            });
            this.select(0);
            this.status.setStatus('');
            if (!this.dialog.open) this.dialog.show();
        } catch (error) {
            this.status.setStatus(error.message, 'error');
            if (this.dialog.isConnected && !this.dialog.open) this.dialog.show();
        } finally {
            this.loading = false;
            this.loadButton.disabled = false;
        }
    }

    stopMedia() {
        this.body.querySelectorAll('video, audio').forEach(media => media.pause());
    }

    field(parent, key, value, copy = false) {
        const section = element('section');
        section.className = 'cat-te-reference-field';
        const heading = element('div');
        heading.append(element('span', T(key)));
        const text = typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value ?? '');
        if (copy) {
            const button = element('cap-button');
            button.setAttribute('shape', 'square');
            button.setAttribute('size', 'small');
            button.title = T('copy');
            button.setAttribute('aria-label', T('copy'));
            button.innerHTML = iconHtml('copy', 12);
            let resetTimer;
            button.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(text);
                    button.innerHTML = iconHtml('check', 12);
                    button.setAttribute('variant', 'success');
                    button.title = T('copied');
                    button.setAttribute('aria-label', T('copied'));
                    clearTimeout(resetTimer);
                    resetTimer = setTimeout(() => {
                        button.innerHTML = iconHtml('copy', 12);
                        button.removeAttribute('variant');
                        button.title = T('copy');
                        button.setAttribute('aria-label', T('copy'));
                    }, 1200);
                } catch (error) { this.status.setStatus(error.message, 'error'); }
            });
            heading.append(button);
        }
        section.append(heading, element('pre', text));
        parent.append(section);
    }

    select(index) {
        this.stopMedia();
        this.body.replaceChildren();
        [...this.tabs.children].forEach((tab, i) => {
            tab.setAttribute('aria-selected', String(i === index));
            tab.tabIndex = i === index ? 0 : -1;
        });
        this.body.setAttribute('aria-label', this.tabs.children[index].textContent);
        const project = this.data.project;
        if (index === this.rows.length) {
            const settings = project.settings || {};
            const metrics = element('div');
            metrics.className = 'cat-te-reference-metrics';
            for (const key of ['width', 'height', 'fps']) {
                if (settings[key] !== undefined) this.field(metrics, key, settings[key]);
            }
            this.body.append(metrics);
            for (const [key, value] of Object.entries(settings)) {
                if (!['width', 'height', 'fps'].includes(key)) this.field(this.body, key, value, true);
            }
            return;
        }
        const clips = this.rows[index].track.clips || [];
        if (!clips.length) this.body.append(element('p', T('empty')));
        const media = project.media || project.resources || [];
        for (const [clipIndex, clip] of clips.entries()) {
            const card = element('article');
            card.className = 'cat-te-reference-clip';
            const header = element('header');
            const number = element('span', String(clipIndex + 1).padStart(2, '0'));
            number.className = 'cat-te-reference-number';
            const timing = element('span', `${((Number(clip.start_ms) || 0) / 1000).toFixed(2)}s — ${((Number(clip.start_ms || 0) + Number(clip.duration_ms || 0)) / 1000).toFixed(2)}s · ${(Number(clip.duration_ms || 0) / 1000).toFixed(2)}s`);
            timing.className = 'cat-te-reference-timing';
            header.append(number, element('h3', clip.name || clip.id || T('unnamed')), timing);
            card.append(header);
            const content = element('div');
            content.className = 'cat-te-reference-content';
            const prompts = element('div');
            prompts.className = 'cat-te-reference-prompts';
            for (const key of ['prompt', 'style_prompt', 'speech_prompt', 'text']) {
                if (clip[key]) this.field(prompts, key, clip[key], true);
            }
            const previews = element('div');
            previews.className = 'cat-te-reference-media';
            const ids = [...(clip.media_ids || []), clip.character_media_id].filter(Boolean);
            for (const id of ids) {
                const mediaIndex = media.findIndex(row => row.id === id);
                const row = media[mediaIndex];
                const figure = element('figure');
                if (row && this.data.available.includes(String(mediaIndex))) {
                    const preview = element(row.kind === 'image' ? 'img' : row.kind);
                    preview.src = this.apiURL(`/audio_keyframe_timeline/reference_project_media?token=${encodeURIComponent(this.data.token)}&index=${mediaIndex}`);
                    if (row.kind === 'image') { preview.alt = row.name || row.file; preview.loading = 'lazy'; }
                    else { preview.controls = true; preview.preload = 'metadata'; }
                    figure.append(preview);
                } else figure.append(element('p', T('missing')));
                figure.append(element('figcaption', row?.name || row?.file || id));
                previews.append(figure);
            }
            if (ids.length) content.append(previews);
            else content.className += ' cat-te-reference-content-text';
            content.append(prompts);
            card.append(content);
            const details = element('details');
            details.append(element('summary', T('details')), element('pre', JSON.stringify(clip, null, 2)));
            card.append(details);
            this.body.append(card);
        }
    }

    destroy() {
        this.stopMedia();
        this.dialog.remove();
    }
}
