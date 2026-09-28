import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/FormControls.js';
import '../components/StatusMessage.js';
import '../components/ExportDirectory.js';

export function clipExportProject(project, clipId) {
    const track = project.tracks.find(track => track.clips.some(clip => clip.id === clipId));
    const source = track?.clips.find(clip => clip.id === clipId);
    if (!source) return null;
    const clip = structuredClone(source);
    const media = project.media || [];
    const audio = track.type === 'audio' || track.type === 'voiceover';
    const supported = track.type === 'audio' ? clip.media_ids?.length || clip.source?.file
        : track.type === 'voiceover' ? clip.generated_audios?.some(row => row.file && row.enabled !== false)
        : track.type === 'media' ? clip.media_ids?.some((id, index) => clip.media_enabled?.[index] !== false && media.some(row => row.id === id && row.kind === 'video'))
        : track.type === 'director' && clip.generated_videos?.some(row => row.file && row.enabled !== false);
    if (!supported) return null;
    clip.start_ms = 0;
    clip.enabled = clip.visible = true;
    // Export the selected clip independently of its track's visibility and mute state.
    if (audio && clip.muted) { clip.muted = false; clip.volume = 0; }
    return { audio, duration: clip.duration_ms / 1000, project: {
        ...project, name: clip.name || project.name,
        tracks: [{ ...track, enabled: true, visible: true, muted: false, clips: [clip] }],
    } };
}

export class ClipExport {
    constructor(host) {
        this.dialog = document.createElement('cap-dialog');
        this.dialog.className = 'cat-te-clip-export-dialog';
        this.dialog.setAttribute('close-label', T('close_title'));
        host.append(this.dialog);
    }

    open(project, clipId, projectDirectory = '') {
        if (this.busy) return;
        const selected = clipExportProject(project, clipId);
        if (!selected) return;
        const dialog = this.dialog;
        dialog.innerHTML = `<span slot="title">${T('clip_export_title')}</span>
            <div class="cat-te-modal-body">
                <p data-summary></p>
                <label>${T('filename_label')}<cap-input><input data-filename /></cap-input></label>
                <cap-export-directory default-dir="output/cap_clip_exports/"></cap-export-directory>
                <label data-fps-option>${T('compose_fps_label')}<cap-input><input data-fps type="number" required min="1" max="120" step="0.001" /></cap-input></label>
                <label data-video-option><span><input data-video type="checkbox" checked /> ${T('compose_video_section')} (MP4)</span></label>
                <label><span><input data-audio type="checkbox" /> ${T('compose_audio_section')}</span></label>
                <label>${T('compose_audio_format')}<cap-select><select data-format><option value="wav">WAV</option><option value="mp3">MP3</option></select></cap-select></label>
            </div>
            <div slot="footer"><cap-status-message></cap-status-message><div class="cat-te-confirm-actions">
                <cap-button data-folder-open hidden>${T('open_folder_btn')}</cap-button>
                <cap-button data-close>${T('close_title')}</cap-button>
                <cap-button data-export variant="primary">${T('export_title')}</cap-button>
            </div></div>`;
        dialog.querySelector('[data-summary]').textContent = T('clip_export_summary', { name: selected.project.name, duration: selected.duration.toFixed(3) });
        const filename = dialog.querySelector('[data-filename]');
        const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '');
        filename.value = `${selected.project.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')}_${stamp}`;
        const video = dialog.querySelector('[data-video]');
        const audio = dialog.querySelector('[data-audio]');
        const fps = dialog.querySelector('[data-fps]');
        fps.value = selected.project.settings.fps;
        dialog.querySelector('[data-fps-option]').hidden = selected.audio;
        const format = dialog.querySelector('[data-format]');
        const submit = dialog.querySelector('[data-export]');
        const close = dialog.querySelector('[data-close]');
        const reveal = dialog.querySelector('[data-folder-open]');
        const status = dialog.querySelector('cap-status-message');
        const directory = dialog.querySelector('cap-export-directory');
        directory.restore(projectDirectory);
        video.checked = !selected.audio;
        audio.checked = selected.audio;
        audio.disabled = selected.audio;
        dialog.querySelector('[data-video-option]').hidden = selected.audio;
        const change = () => { submit.disabled = !video.checked && !audio.checked; format.disabled = !audio.checked; };
        video.onchange = audio.onchange = change;
        change();
        close.onclick = () => dialog.close();
        submit.onclick = async () => {
            if (this.busy || (!video.checked && !audio.checked)) return;
            if (video.checked && !fps.reportValidity()) return;
            if (this.validating) return;
            this.validating = true;
            try { if (!await directory.validate()) return; }
            finally { this.validating = false; }
            this.busy = true;
            directory.disabled = true;
            dialog.closeDisabled = close.disabled = submit.disabled = true;
            reveal.hidden = true;
            status.setStatus(T('composing_please_wait'));
            const outputDirectory = directory.value;
            try {
                const response = await api.fetchApi('/audio_keyframe_timeline/compose_video', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ project: selected.project, filename: filename.value,
                        ...directory.exportSettings,
                        export_video: video.checked, export_audio: audio.checked, audio_format: format.value,
                        output_resolution: 'project', export_quality: 'maximum', output_fps: video.checked ? Number(fps.value) : null,
                        export_range: { start_frame: 0, end_frame: Math.max(1, Math.round(selected.duration * selected.project.settings.fps)) },
                    }),
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || T('compose_failed_http', { status: response.status }));
                directory.remember(outputDirectory);
                status.setStatus(T('export_saved_path', { path: result.outputs.map(row => row.path || [row.subfolder, row.filename].filter(Boolean).join('/')).join('\n') }), 'success');
                reveal.hidden = false;
                reveal.onclick = async () => {
                    try {
                        const response = await api.fetchApi(result.reveal_token ? '/audio_keyframe_timeline/reveal_export' : '/audio_keyframe_timeline/reveal_output', {
                            method: 'POST', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify(result.reveal_token ? { reveal_token: result.reveal_token } : { filename: result.filename, subfolder: result.subfolder }),
                        });
                        const data = await response.json();
                        if (!response.ok) throw new Error(data.error || T('open_folder_prepare_failed'));
                    } catch (error) { status.setStatus(error.message, 'error'); }
                };
            } catch (error) { status.setStatus(error.message, 'error'); }
            finally { this.busy = false; directory.disabled = false; dialog.closeDisabled = close.disabled = false; change(); }
        };
        dialog.showModal();
    }
}
