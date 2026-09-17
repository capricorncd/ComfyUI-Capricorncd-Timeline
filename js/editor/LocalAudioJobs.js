import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';

export class LocalAudioJobs {
    constructor(app, host) {
        this.app = app;
        this.dialog = document.createElement('cap-dialog');
        this.dialog.className = 'cat-te-local-audio-dialog';
        this.dialog.setAttribute('close-label', T('close_title'));
        host.append(this.dialog);
        this.dialog.addEventListener('close', () => this.stopPreview());
        this.dialog.addEventListener('cancel', event => { if (this.busy) event.preventDefault(); });
    }

    stopPreview() {
        this.dialog.querySelector('[data-voice-preview]')?.pause();
        this.dialog.querySelector('[data-reference-preview]')?.pause();
    }

    async request(path, payload) {
        const response = await api.fetchApi('/audio_keyframe_timeline/local_audio/' + path, payload === undefined ? {} : {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
        return data;
    }

    open(clip, denoise = null, kind = denoise ? 'denoise' : 'music', speech = null) {
        if (this.busy || !clip || clip.track.locked) return;
        this.stopPreview();
        const app = this.app;
        const timeline = app._timeline;
        const resources = app._projectResources;
        const valid = () => app._timeline === timeline && app._projectResources === resources && app._findClipById(clip.id) === clip && !clip.track.locked && (!speech || speech.valid());
        const meta = app._ensureClipMeta(clip);
        const sfx = kind === 'sfx';
        const voice = kind === 'tts' || kind === 'vc';
        const titleKey = { music: 'local_audio_bgm', denoise: 'local_audio_denoise', sfx: 'local_audio_sfx', separation: 'local_audio_separation', tts: 'speech_convert', vc: 'voice_convert' }[kind];
        this.jobId = null;
        if (denoise && !denoise.sources.length) return;
        const payload = denoise ? { kind } : {
            kind, lyrics: meta.prompt || '', style: meta.stylePrompt || '',
            count: 1, seed: Math.max(0, Math.min(4294967294, Number(meta.seed ?? 42))),
            mode: 'full', max_duration: Number(clip.duration) || 30,
        };
        if (kind === 'tts') {
            for (const key of ['lyrics', 'style', 'count', 'mode', 'max_duration']) delete payload[key];
        }
        if (sfx) {
            payload.prompt = meta.prompt || '';
            payload.seconds = Number(clip.duration) || 10;
            payload.seed = Math.min(4294967292, payload.seed);
        }
        timeline.pause();
        if (app._genEditState?.timeline) app._genEditState.timeline.pause();
        if (app._voEditState?.timeline) app._voEditState.timeline.pause();
        this.dialog.innerHTML = `<span slot="title">${T(titleKey)}</span>
            <div class="cat-te-modal-body"><p data-description></p>
            ${denoise ? `<label>${T('local_audio_source')}<select data-source></select><span data-source-file></span></label><label>${T('local_audio_scope')}<select data-scope><option value="clip">${T('local_audio_clip_scope')}</option><option value="full">${T('local_audio_full_scope')}</option></select></label>` : `<label>${T('local_audio_lyrics')}<textarea data-lyrics rows="4" readonly></textarea></label><label>${T('local_audio_style')}<textarea data-style rows="2" readonly></textarea></label><label>${T('local_audio_duration')}<input data-duration type="number" min="0.001" step="any" /></label>`}
            ${voice ? `<label>${T('local_voice_preset')}<select data-voice></select></label><p data-voice-description></p><audio data-voice-preview controls preload="none" hidden></audio><label>${T('local_voice_reference')}<select data-reference><option value="">${T('local_voice_use_preset')}</option></select></label><audio data-reference-preview controls preload="none" hidden aria-label="${T('local_voice_reference')}"></audio>${kind === 'tts' ? `<label>${T('local_voice_language')}<select data-language>${['Auto','Chinese','English','Japanese','Korean','German','French','Russian','Portuguese','Spanish','Italian'].map(language => `<option>${language}</option>`).join('')}</select></label><label>${T('local_voice_instruct')}<textarea data-instruct maxlength="1000" rows="2"></textarea></label><label>${T('local_voice_reference_text')}<textarea data-reference-text maxlength="4000" rows="2"></textarea></label>` : ''}` : ''}
            </div>
            <div slot="footer"><p role="status"></p><div class="cat-te-confirm-actions"><cap-button data-settings>${T('voice_configure')}</cap-button><cap-button data-cancel>${T('close_title')}</cap-button><cap-button variant="primary" data-submit>${T(titleKey)}</cap-button></div></div>`;
        this.dialog.querySelector('[data-description]').textContent = denoise ? T('local_audio_denoise_note') : clip.name + '\n' + T('local_audio_bgm_note');
        if (kind === 'separation' || sfx) this.dialog.querySelector('[data-description]').textContent = T(sfx ? 'local_audio_sfx_note' : 'local_audio_separation_note');
        if (denoise) {
            const select = this.dialog.querySelector('[data-source]');
            denoise.sources.forEach((source, index) => {
                const option = document.createElement('option');
                option.value = String(index);
                option.textContent = source.file.split(/[\\/]/).pop();
                select.append(option);
            });
            select.value = '0';
            select.hidden = denoise.sources.length === 1;
            const filename = this.dialog.querySelector('[data-source-file]');
            select.onchange = () => { filename.textContent = denoise.sources[Number(select.value)].file; };
            select.onchange();
            this.dialog.querySelector('[data-scope]').value = 'clip';
            this.dialog.querySelector('[data-scope]').parentElement.hidden = !!denoise.sources[0]?.mix;
        }
        if (!denoise && kind !== 'tts') {
            this.dialog.querySelector('[data-lyrics]').value = payload.lyrics;
            this.dialog.querySelector('[data-style]').value = payload.style;
            this.dialog.querySelector('[data-duration]').value = payload.max_duration;
        }
        if (sfx) {
            const lyrics = this.dialog.querySelector('[data-lyrics]');
            lyrics.readOnly = false;
            lyrics.value = payload.prompt;
            lyrics.parentElement.firstChild.textContent = T('local_audio_sfx_prompt');
            this.dialog.querySelector('[data-style]').parentElement.hidden = true;
            const duration = this.dialog.querySelector('[data-duration]');
            duration.value = payload.seconds;
        }
        if (kind === 'tts') {
            const text = this.dialog.querySelector('[data-lyrics]');
            text.value = speech.text;
            text.readOnly = false;
            text.parentElement.firstChild.textContent = T('local_voice_text');
            this.dialog.querySelector('[data-style]').parentElement.hidden = true;
            this.dialog.querySelector('[data-duration]').parentElement.hidden = true;
        }
        if (voice) {
            this.dialog.querySelector('[data-description]').textContent = T(kind === 'tts' ? 'local_voice_tts_note' : 'local_voice_vc_note');
            const reference = this.dialog.querySelector('[data-reference]');
            const referencePreview = this.dialog.querySelector('[data-reference-preview]');
            referencePreview.onerror = () => { this.dialog.querySelector('[role="status"]').textContent = T('local_voice_no_preview'); };
            const clips = (timeline.tracks || []).flatMap(track => track.clips);
            for (const row of resources.filter(row => row.kind === 'audio' || row.kind === 'video')) {
                const option = document.createElement('option');
                option.value = row.file;
                const names = [...new Set(clips.filter(clip => clip.src === row.file).map(clip => clip.name).filter(Boolean))];
                option.textContent = names.join(' / ') || row.name || row.file;
                option.title = row.file;
                reference.append(option);
            }
            reference.onchange = () => {
                this.stopPreview();
                const row = resources.find(row => row.file === reference.value);
                referencePreview.hidden = !row;
                referencePreview.removeAttribute('src');
                if (row) referencePreview.src = row.kind === 'video' ? app._videoUrl(row.file) : app._audioUrl(row.file);
                referencePreview.load();
                this.dialog.querySelector('[data-voice]').disabled = !!reference.value;
                this.dialog.querySelector('[data-voice]').onchange?.();
                if (kind === 'tts') {
                    this.dialog.querySelector('[data-instruct]').parentElement.hidden = !!reference.value;
                    this.dialog.querySelector('[data-reference-text]').parentElement.hidden = !reference.value;
                }
            };
            reference.onchange();
            const select = this.dialog.querySelector('[data-voice]');
            void this.request('voices?kind=' + kind).then(rows => {
                if (this.dialog.querySelector('[data-voice]') !== select) return;
                for (const row of rows) {
                    const option = document.createElement('option');
                    option.value = row.id;
                    option.textContent = [row.name || row.id, row.description || row.language].filter(Boolean).join(' · ');
                    option.disabled = kind === 'vc' && !row.vc_available;
                    if (option.disabled) option.textContent += ' (' + T('local_voice_unavailable') + ')';
                    select.append(option);
                }
                const available = rows.find(row => kind !== 'vc' || row.vc_available);
                select.value = available?.id || '';
                const preview = this.dialog.querySelector('[data-voice-preview]');
                select.onchange = () => {
                    preview.pause();
                    const row = rows.find(row => row.id === select.value);
                    const enabled = row?.preview_url && !reference.value;
                    preview.hidden = !enabled;
                    preview.removeAttribute('src');
                    if (enabled) preview.src = api.apiURL('/audio_keyframe_timeline/local_audio/voice_preview/' + encodeURIComponent(row.id) + '?kind=' + kind);
                    preview.load();
                    this.dialog.querySelector('[data-voice-description]').textContent = reference.value ? '' : row ? (row.description || row.language || '') + (row.preview_url ? '' : ' · ' + T('local_voice_no_preview')) : T('local_voice_choose');
                };
                preview.onerror = () => { this.dialog.querySelector('[role="status"]').textContent = T('local_voice_no_preview'); };
                select.onchange();
            }).catch(error => { if (this.dialog.querySelector('[data-voice]') === select) this.dialog.querySelector('[role="status"]').textContent = error.message; });
        }
        const status = this.dialog.querySelector('[role="status"]');
        const submit = this.dialog.querySelector('[data-submit]');
        const cancel = this.dialog.querySelector('[data-cancel]');
        const settings = this.dialog.querySelector('[data-settings]');
        settings.onclick = () => { this.dialog.close(); app._openSettings(); app._setSettingsCategory('bgm'); };
        cancel.onclick = async () => {
            if (!this.busy) { this.dialog.close(); return; }
            this.cancelRequested = true;
            cancel.disabled = true;
            if (this.jobId) {
                try { await this.request('cancel/' + this.jobId, {}); }
                catch (error) { this.cancelRequested = false; status.textContent = error.message; cancel.disabled = false; }
            }
        };
        submit.onclick = async () => {
            if (this.busy) return;
            if (!valid()) { status.textContent = T('local_audio_target_changed'); return; }
            if (!denoise && kind !== 'tts') {
                const duration = this.dialog.querySelector('[data-duration]');
                if (!duration.reportValidity()) return;
                payload.max_duration = Number(duration.value);
                if (sfx) {
                    payload.prompt = this.dialog.querySelector('[data-lyrics]').value.trim();
                    payload.seconds = Number(duration.value);
                    if (!payload.prompt || payload.prompt.length > 4000) { status.textContent = T('local_audio_sfx_prompt_required'); return; }
                } else if (!payload.lyrics.trim() || !payload.style.trim()) { status.textContent = T('local_audio_missing_prompt'); return; }
            }
            if (voice && !this.jobId) {
                payload.reference_file = this.dialog.querySelector('[data-reference]').value;
                payload.speaker = this.dialog.querySelector('[data-voice]').value;
                if (!payload.reference_file && !payload.speaker) { status.textContent = T('local_voice_choose'); return; }
                if (kind === 'tts') {
                    payload.text = this.dialog.querySelector('[data-lyrics]').value.trim();
                    if (!payload.text || payload.text.length > 2000) { status.textContent = T('local_voice_text_limit'); return; }
                    payload.language = this.dialog.querySelector('[data-language]').value;
                    payload.instruct = this.dialog.querySelector('[data-instruct]').value;
                    payload.reference_text = this.dialog.querySelector('[data-reference-text]').value;
                }
            }
            if (denoise && !this.jobId) {
                denoise.source = denoise.sources[Number(this.dialog.querySelector('[data-source]').value)];
                Object.assign(payload, denoise.source, { scope: this.dialog.querySelector('[data-scope]').value });
                delete payload.id;
            }
            if (denoise) {
                this.dialog.querySelector('[data-source]').disabled = true;
                this.dialog.querySelector('[data-scope]').disabled = true;
            }
            this.stopPreview();
            this.busy = true;
            this.cancelRequested = false;
            this.dialog.closeDisabled = true;
            submit.disabled = settings.disabled = true;
            cancel.textContent = T('cancel_btn');
            status.textContent = T('local_audio_submitting');
            let finished = false;
            try {
                let job = this.jobId ? await this.request('status/' + this.jobId) : await this.request('start', payload);
                this.jobId = job.id;
                if (this.cancelRequested) await this.request('cancel/' + job.id, {});
                while (!this.cancelRequested && ['queued', 'running'].includes(job.status)) {
                    status.textContent = T(job.status === 'queued' ? 'local_audio_queued' : 'local_audio_running');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    if (!this.cancelRequested) job = await this.request('status/' + job.id);
                }
                if (this.cancelRequested) { this.jobId = null; status.textContent = T('local_audio_cancelled'); return; }
                if (job.status !== 'succeeded') {
                    this.jobId = null;
                    throw new Error(job.error || job.status);
                }
                status.textContent = T('local_audio_saving');
                cancel.disabled = true;
                const result = await this.request('result/' + job.id, {});
                if (!valid()) { status.textContent = T('local_audio_detached'); finished = true; return; }
                if (denoise) {
                    for (const file of result.files) {
                        if (!await app._insertDenoisedAudio(clip, { ...denoise, start: denoise.start + (denoise.source?.edit_start_sec || 0) }, file, valid)) {
                            status.textContent = T('local_audio_detached'); finished = true; return;
                        }
                    }
                } else if (kind === 'tts') {
                    await app._addAudioAtTime(result.files[0].file, speech.start, null, { canInsert: valid, duration: result.files[0].duration_sec });
                    if (!valid()) { status.textContent = T('local_audio_detached'); finished = true; return; }
                } else {
                    app._addGeneratedAudiosToClip(clip, result.files);
                }
                status.textContent = T('local_audio_done');
                finished = true;
            } catch (error) {
                status.textContent = this.cancelRequested ? T('local_audio_cancelled') : error.message;
                if (this.cancelRequested) this.jobId = null;
            } finally {
                this.busy = false;
                this.dialog.closeDisabled = false;
                submit.disabled = finished;
                settings.disabled = cancel.disabled = false;
                cancel.textContent = T('close_title');
                if (denoise && !this.jobId) {
                    this.dialog.querySelector('[data-source]').disabled = false;
                    this.dialog.querySelector('[data-scope]').disabled = false;
                }
            }
        };
        this.dialog.showModal();
    }
}
