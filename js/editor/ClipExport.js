import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/RadioButton.js';
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

export function clipExportSelections(project, clipIds) {
    const ids = new Set(Array.isArray(clipIds) ? clipIds : [clipIds]);
    return project.tracks.flatMap(track => track.clips).filter(clip => ids.has(clip.id))
        .sort((a, b) => (a.start_ms || 0) - (b.start_ms || 0))
        .map(clip => clipExportProject(project, clip.id)).filter(Boolean);
}

export function mergeClipExports(selections) {
    let durationMs = 0;
    const tracks = selections.map((selection, index) => {
        const track = structuredClone(selection.project.tracks[0]);
        track.id = `export_${index}`;
        track.clips[0].start_ms = durationMs;
        durationMs += track.clips[0].duration_ms;
        return track;
    });
    return {audio: selections.every(row => row.audio), duration: durationMs / 1000,
        project: {...selections[0].project, tracks}};
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
        const selections = clipExportSelections(project, clipId);
        if (!selections.length) return;
        const selected = mergeClipExports(selections);
        const dialog = this.dialog;
        dialog.innerHTML = `<span slot="title">${T('clip_export_title')}</span>
            <div class="cat-te-modal-body">
                <label>${T('clip_export_mode')}<cap-radio-group data-mode value="merged">
                    <cap-radio-button value="merged" indicator>${T('clip_export_merged')}</cap-radio-button>
                    <cap-radio-button value="separate" indicator>${T('clip_export_separate')}</cap-radio-button>
                </cap-radio-group></label>
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
        const mode = dialog.querySelector('[data-mode]');
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
            const separate = mode.value === 'separate' && selections.length > 1;
            const jobs = separate ? selections : [selected];
            const baseName = filename.value.replace(/\.(mp4|wav|mp3)$/i, '');
            const exportSettings = {...directory.exportSettings};
            const wantVideo = video.checked, wantAudio = audio.checked, audioFormat = format.value, outputFps = Number(fps.value);
            const outputs = [];
            try {
                let result;
                for (const [index, job] of jobs.entries()) {
                    const response = await api.fetchApi('/audio_keyframe_timeline/compose_video', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ project: job.project, filename: separate ? `${baseName}_${index + 1}` : baseName,
                            ...exportSettings,
                            export_video: wantVideo, export_audio: wantAudio, audio_format: audioFormat,
                            output_resolution: 'project', export_quality: 'maximum', output_fps: wantVideo ? outputFps : null,
                            export_range: { start_frame: 0, end_frame: Math.max(1, Math.round(job.duration * job.project.settings.fps)) },
                        }),
                    });
                    result = await response.json();
                    if (!response.ok) throw new Error(result.error || T('compose_failed_http', { status: response.status }));
                    outputs.push(...result.outputs);
                }
                directory.remember(outputDirectory);
                status.setStatus(T('export_saved_path', { path: outputs.map(row => row.path || [row.subfolder, row.filename].filter(Boolean).join('/')).join('\n') }), 'success');
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
            } catch (error) { status.setStatus([error.message, ...outputs.map(row => row.path || [row.subfolder, row.filename].filter(Boolean).join('/'))].join('\n'), 'error'); }
            finally { this.busy = false; directory.disabled = false; dialog.closeDisabled = close.disabled = false; change(); }
        };
        dialog.showModal();
    }
}
