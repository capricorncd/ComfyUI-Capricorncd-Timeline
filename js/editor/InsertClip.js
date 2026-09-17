import '../components/Dialog.js';
import '../components/Button.js';
import { t as T } from '../i18n/timeline_editor.js';

export function openInsertClip(app, clip) {
    if (clip.track.locked) return;
    const timeline = app._timeline;
    const fps = timeline.fps || 24;
    const dialog = document.createElement('cap-dialog');
    dialog.className = 'cat-te-insert-clip-dialog';
    dialog.setAttribute('close-label', T('close_title'));
    dialog.innerHTML = `<span slot="title">${T('insert_clip_title')}</span>
        <fieldset><legend>${T('insert_clip_position')}</legend>
          <label><input type="radio" name="insert-position" value="before" />${T('insert_clip_before')}</label>
          <label><input type="radio" name="insert-position" value="after" checked />${T('insert_clip_after')}</label>
        </fieldset>
        <fieldset><legend>${T('insert_clip_copy')}</legend>
          <label><input type="radio" name="insert-copy" value="yes" />${T('insert_clip_yes')}</label>
          <label><input type="radio" name="insert-copy" value="no" checked />${T('insert_clip_no')}</label>
        </fieldset>
        <div class="cat-te-insert-duration"><label>${T('clip_duration_label')} <input data-seconds type="number" min="0" step="1" value="5" /> ${T('insert_clip_seconds')}</label>
        <label><input data-frames type="number" min="0" max="${Math.ceil(fps) - 1}" step="1" value="0" /> ${T('insert_clip_frames')}</label></div>
        <p>${T('insert_clip_ripple_note')}</p><p data-error role="status"></p>
        <div slot="footer"><cap-button data-cancel>${T('cancel_btn')}</cap-button><cap-button data-confirm variant="primary">${T('insert_clip_confirm')}</cap-button></div>`;
    const seconds = dialog.querySelector('[data-seconds]');
    const frames = dialog.querySelector('[data-frames]');
    for (const input of dialog.querySelectorAll('[name="insert-copy"]')) input.addEventListener('change', () => {
        const copy = dialog.querySelector('[name="insert-copy"]:checked').value === 'yes';
        seconds.value = copy ? Math.floor(clip.duration) : 5;
        frames.value = copy ? Math.round((clip.duration - Math.floor(clip.duration)) * fps) : 0;
        if (Number(frames.value) >= fps) { seconds.value = Number(seconds.value) + 1; frames.value = 0; }
    });
    dialog.querySelector('[data-cancel]').addEventListener('click', () => dialog.close());
    dialog.querySelector('[data-confirm]').addEventListener('click', () => {
        if (!seconds.reportValidity() || !frames.reportValidity()) return;
        const duration = Math.round((Number(seconds.value) + Number(frames.value) / fps) * fps) / fps;
        if (!Number.isFinite(duration) || duration <= 0) { dialog.querySelector('[data-error]').textContent = T('insert_clip_invalid_duration'); return; }
        if (app._timeline !== timeline || app._findClipById(clip.id) !== clip || clip.track.locked) { dialog.close(); return; }
        if (app._insertAdjacentClip(clip, {
            before: dialog.querySelector('[name="insert-position"]:checked').value === 'before',
            copy: dialog.querySelector('[name="insert-copy"]:checked').value === 'yes', duration,
        })) dialog.close();
    });
    dialog.addEventListener('close', () => dialog.remove(), { once: true });
    app._overlay.append(dialog);
    dialog.showModal();
}
