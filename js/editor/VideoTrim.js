import { api } from '../../../scripts/api.js';
import { t as T } from '../i18n/timeline_editor.js';
import '../components/Dialog.js';
import '../components/StatusMessage.js';

export function videoTrimSource(app, item) {
    const trim = app._findMediaById(item.id)?.video_trim;
    if (!trim) return { item, start: 0, duration: null, rate: 1 };
    const original = app._findMediaById(trim.source_id);
    if (!original) throw new Error(T('asset_missing_cannot_preview'));
    return { item: original, start: trim.start, duration: trim.duration, rate: trim.rate };
}

export async function cutVideo(app, item, start, duration, rate = 1) {
    const media = app._findMediaById(item.id);
    const location = app._mediaStatus.get(`video:${item.file}`)?.location || media?.location || 'input';
    const response = await api.fetchApi('/audio_keyframe_timeline/trim_video', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file: item.file, location, start, duration, rate }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    return { file: result.file, trim: { source_id: item.id, start, duration, rate } };
}

export class VideoTrim {
    constructor(app, host) {
        this.progressDialog = document.createElement('cap-dialog');
        this.progressDialog.className = 'cat-te-video-convert-dialog';
        host.append(this.progressDialog);
    }

    progress(active) {
        const dialog = this.progressDialog;
        dialog.closeDisabled = active;
        if (!active) { dialog.close(); return; }
        dialog.innerHTML = `<span slot="title">${T('convert_to_director_clip')}</span>
            <div class="cat-te-video-convert-body">
                <cap-status-message>${T('director_video_converting')}</cap-status-message>
                <progress aria-label="${T('director_video_converting')}"></progress>
                <p>${T('director_video_converting_hint')}</p>
            </div>`;
        dialog.showModal();
    }
}
