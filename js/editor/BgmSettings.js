import '../components/Button.js';
import '../components/TabButton.js';
import { iconHtml } from '../cap_icons.js';
import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';

export class BgmSettings {
    constructor(root) {
        this.root = root;
        this.loaded = false;
        this.revision = 0;
        this.dirty = false;
        this.saveQueue = Promise.resolve();
        this.parameters = [['sfx_steps', 'sfx', 'num_inference_steps'], ['sfx_cfg', 'sfx', 'cfg_scale'], ['separation_segment', 'separation', 'segment_seconds']];
        this.services = [
            ['music', 'local_audio_bgm', '/v1/music/generate'],
            ['sfx', 'local_audio_sfx', '/v1/sfx/generate'],
            ['denoise', 'local_audio_denoise', '/v1/denoise/file'],
            ['separation', 'local_audio_separation', '/v1/separate/file'],
            ['vc', 'voice_convert', '/v1/voice/convert'],
            ['tts', 'speech_convert', '/v1/tts/generate'],
        ];
        const numeric = (name, label, min, max, step) => `<label><span>${T(label)}</span><input data-bgm="${name}" type="number" min="${min}" ${max ? `max="${max}"` : ''} step="${step}" /></label>`;
        root.innerHTML = `
          <div class="cat-te-audio-tabs" role="tablist">${[['general', 'audio_general'], ...this.services].map(([id, label]) => `<cap-tab-button data-audio-tab="${id}" id="audio-tab-${id}" aria-controls="audio-panel-${id}">${T(label)}</cap-tab-button>`).join('')}</div>
          <div data-audio-panel="general" id="audio-panel-general" role="tabpanel" aria-labelledby="audio-tab-general" class="cat-te-agent-form">
            <label><span>${T('bgm_url')}</span><input data-bgm="url" type="url" placeholder="http://127.0.0.1:19876" /></label>
            <label><span>API Key</span><input data-bgm="api_key" type="password" autocomplete="new-password" /></label>
            <div data-bgm="key-status" class="cat-te-agent-note" role="status"></div>
            <cap-button data-bgm="clear_key" disabled>${T('bgm_clear_key')}</cap-button>
          </div>
          ${this.services.map(([id, label, path]) => `<div data-audio-panel="${id}" id="audio-panel-${id}" role="tabpanel" aria-labelledby="audio-tab-${id}" class="cat-te-agent-form" hidden>
            <label><span>${T('audio_endpoint')}</span><input data-bgm="${id}_url" type="text" placeholder="${path}" /></label>
            <label><span>API Key <span class="cat-te-info-tip" tabindex="0" aria-label="${T('audio_inherit')}">${iconHtml('info', 12)}<span class="cat-te-info-tip-pop">${T('audio_inherit')}</span></span></span><input data-bgm="${id}_key" type="password" autocomplete="new-password" /></label>
            ${id === 'sfx' ? numeric('sfx_steps', 'local_audio_steps', 1, 200, 1) + numeric('sfx_cfg', 'local_audio_cfg', 1, 20, 0.1) : ''}
            ${id === 'separation' ? numeric('separation_segment', 'local_audio_segment', 0.001, '', 'any') : ''}
          </div>`).join('')}
          <div data-bgm="status" class="cat-te-agent-note" role="status"></div>`;
        this.field = key => root.querySelector(`[data-bgm="${key}"]`);
        this.field('clear_key').addEventListener('click', async () => {
            this.field('clear_key').disabled = true;
            try { await this.save(true); }
            finally { this.field('clear_key').disabled = !this.hasSavedKey; }
        });
        for (const input of root.querySelectorAll('input[data-bgm]')) {
            input.disabled = true;
            input.addEventListener('input', () => {
                this.revision++;
                this.dirty = true;
                this.field('status').textContent = '';
            });
            input.addEventListener('change', () => {
                this.revision++;
                this.dirty = true;
                void this.save();
            });
        }
        const tabs = [...root.querySelectorAll('[data-audio-tab]')];
        tabs.forEach((tab, index) => {
            tab.addEventListener('click', () => this.selectTab(tab.dataset.audioTab));
            tab.addEventListener('keydown', event => {
                const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                this.selectTab(tabs[next].dataset.audioTab);
                tabs[next].focus();
            });
        });
        this.selectTab('general');
    }

    selectTab(id) {
        for (const tab of this.root.querySelectorAll('[data-audio-tab]')) {
            const selected = tab.dataset.audioTab === id;
            tab.setAttribute('aria-selected', String(selected));
            tab.tabIndex = selected ? 0 : -1;
        }
        for (const panel of this.root.querySelectorAll('[data-audio-panel]')) panel.hidden = panel.dataset.audioPanel !== id;
    }

    fill(config) {
        this.field('url').value = config.url ?? '';
        this.field('api_key').value = config.has_key ? '****' : '';
        this.field('key-status').textContent = T(config.has_key ? 'bgm_key_saved' : 'bgm_key_missing');
        this.hasSavedKey = !!config.has_key;
        this.field('clear_key').disabled = !this.hasSavedKey;
        for (const [id] of this.services) {
            const row = config.services?.[id] || {};
            this.field(id + '_url').value = row.url || '';
            this.field(id + '_key').value = row.has_key ? '****' : '';
        }
        for (const [field, service, name] of this.parameters) this.field(field).value = config.services?.[service]?.[name] ?? '';
    }

    async load() {
        if (this.loaded) return;
        try {
            const response = await api.fetchApi('/audio_keyframe_timeline/bgm_settings');
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.fill(data.config);
            this.loaded = true;
            for (const input of this.root.querySelectorAll('input[data-bgm]')) input.disabled = false;
        } catch (error) { this.field('status').textContent = error.message; }
    }

    flush() {
        return this.dirty ? this.save() : this.saveQueue;
    }

    save(clearKey = false) {
        this.saveQueue = this.saveQueue.then(() => this.persist(clearKey));
        return this.saveQueue;
    }

    async persist(clearKey = false) {
        const revision = this.revision;
        const services = {};
        for (const [id] of this.services) {
            const key = this.field(id + '_key').value.trim();
            services[id] = { url: this.field(id + '_url').value.trim(), api_key: key === '****' ? '' : key, keep_key: key === '****' };
        }
        for (const [field, service, name] of this.parameters) {
            if (!this.field(field).reportValidity()) return;
            if (this.field(field).value !== '') services[service][name] = Number(this.field(field).value);
        }
        this.field('status').textContent = T('audio_settings_saving');
        try {
            const response = await api.fetchApi('/audio_keyframe_timeline/bgm_settings', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ connection: 'standalone', url: this.field('url').value.trim(), services,
                    api_key: clearKey || this.field('api_key').value.trim() === '****' ? '' : this.field('api_key').value.trim(), clear_key: clearKey }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.hasSavedKey = !!data.config.has_key;
            this.field('clear_key').disabled = !this.hasSavedKey;
            this.field('key-status').textContent = T(this.hasSavedKey ? 'bgm_key_saved' : 'bgm_key_missing');
            if (revision === this.revision) {
                this.fill(data.config);
                this.dirty = false;
                this.field('status').textContent = T('bgm_saved');
            }
        } catch (error) { this.field('status').textContent = error.message; }

    }
}
