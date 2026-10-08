import '../components/Dialog.js';
import '../components/Button.js';
import '../components/RadioButton.js';
import '../components/Switch.js';
import '../components/TabButton.js';
import {makeT} from '../cap_i18n.js';
import {t as T} from '../i18n/timeline_editor.js';

export const alignmentT = makeT({
    zh: {title: '对齐 H3 帧数', down: '减帧', up: '加帧', apply: '确定', process: '处理', pending: '未对齐', aligned: '已对齐', disabled: '已禁用', empty: '暂无 Clip',
        hint: '按工程帧率对齐到 17 × n + 5 帧；默认加帧。调整时保留轨道间隙，并顺移后续 Clip。'},
    en: {title: 'Align H3 frames', down: 'Shorten', up: 'Extend', apply: 'Apply', process: 'Process', pending: 'Unaligned', aligned: 'Aligned', disabled: 'Disabled', empty: 'No Clips',
        hint: 'Align to 17 × n + 5 frames at the project frame rate. Extend by default; preserve gaps and shift following Clips.'},
    ja: {title: 'H3 フレーム数を揃える', down: '短縮', up: '延長', apply: '適用', process: '処理', pending: '未調整', aligned: '調整済み', disabled: '無効', empty: 'Clip がありません',
        hint: 'プロジェクトの fps で 17 × n + 5 フレームに揃えます。既定は延長。間隔を保ち後続 Clip を移動します。'},
});

export function h3DurationOptions(duration, fps) {
    const frames = Math.max(1, Math.round(duration * fps));
    const down = frames < 5 ? null : Math.floor((frames - 5) / 17) * 17 + 5;
    const up = Math.max(5, Math.ceil((frames - 5) / 17) * 17 + 5);
    return {frames, down, up, aligned: frames === up};
}

export function secondsFrames(frames, fps) {
    return `${String(Math.floor(frames / fps)).padStart(2, '0')}.${String(frames % fps).padStart(2, '0')}`;
}

export function h3AlignmentCategory(clip, meta, fps) {
    return meta.disabled ? 'disabled' : h3DurationOptions(clip.duration, fps).aligned ? 'aligned' : 'pending';
}

export function applyH3TrackAlignment(app, track, choices) {
    if (track.locked || !app._timeline.tracks.includes(track)) return false;
    const changes = choices.filter(row => row.process && row.clip.track === track
        && track.clips.includes(row.clip) && row.frames !== Math.round(row.clip.duration * app.getFps()));
    if (!changes.length) return false;
    app._recordUndo();
    const fps = app.getFps();
    const durations = new Map(changes.map(row => [row.clip, row.frames / fps]));
    let shift = 0;
    let previousEnd = 0;
    for (const clip of [...track.clips].sort((a, b) => a.startTime - b.startTime)) {
        const oldDuration = clip.duration;
        const shiftedStart = clip.startTime + shift;
        clip.startTime = Math.max(previousEnd, shiftedStart);
        clip.duration = durations.get(clip) ?? oldDuration;
        shift += clip.startTime - shiftedStart + clip.duration - oldDuration;
        previousEnd = clip.startTime + clip.duration;
        app._rememberResourceTiming(clip);
        clip._applyPosition();
        app._decorateClip(clip);
    }
    app._refreshTimelineDuration();
    app._syncSelectedClip();
    app._saveToWidgets();
    app._scheduleProgramPreview();
    if (app._timeline._playing) app._startAudioPlayback();
    return true;
}

export function openH3TrackAlignment(app, track) {
    const timeline = app._timeline;
    const fps = app.getFps();
    const dialog = document.createElement('cap-dialog');
    dialog.className = 'cat-te-h3-alignment';
    dialog.setAttribute('close-label', T('close_title'));
    const title = document.createElement('span');
    title.slot = 'title'; title.textContent = `${track.name} · ${alignmentT('title')}`;
    const body = document.createElement('div'); body.className = 'cat-te-h3-alignment-body';
    const hint = document.createElement('p'); hint.textContent = alignmentT('hint'); body.append(hint);
    const choices = [];
    const tabs = document.createElement('div'); tabs.className = 'cat-te-h3-alignment-tabs'; tabs.setAttribute('role', 'tablist');
    tabs.setAttribute('aria-label', alignmentT('title'));
    const panels = new Map();
    const buttons = new Map();
    const uid = crypto.randomUUID();
    const selectTab = key => {
        for (const [name, panel] of panels) {
            const active = key === name;
            panel.hidden = !active;
            buttons.get(name).setAttribute('aria-selected', String(active));
            buttons.get(name).tabIndex = active ? 0 : -1;
        }
    };
    for (const key of ['pending', 'aligned', 'disabled']) {
        const tab = document.createElement('cap-tab-button');
        tab.id = `${uid}-${key}-tab`; tab.setAttribute('aria-controls', `${uid}-${key}-panel`);
        const panel = document.createElement('div'); panel.id = `${uid}-${key}-panel`;
        panel.setAttribute('role', 'tabpanel'); panel.setAttribute('aria-labelledby', tab.id);
        panel.tabIndex = 0;
        tab.addEventListener('click', () => selectTab(key));
        buttons.set(key, tab); panels.set(key, panel); tabs.append(tab);
    }
    tabs.addEventListener('keydown', event => {
        const keys = [...buttons.keys()];
        const index = keys.findIndex(key => buttons.get(key).getAttribute('aria-selected') === 'true');
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? keys.length - 1
            : event.key === 'ArrowLeft' ? (index + keys.length - 1) % keys.length
                : event.key === 'ArrowRight' ? (index + 1) % keys.length : null;
        if (next == null) return;
        event.preventDefault(); selectTab(keys[next]); buttons.get(keys[next]).focus();
    });
    body.append(tabs, ...panels.values());
    for (const clip of [...track.clips].sort((a, b) => a.startTime - b.startTime)) {
        const options = h3DurationOptions(clip.duration, fps);
        const category = h3AlignmentCategory(clip, app._ensureClipMeta(clip), fps);
        const choice = {clip, frames: options.up, process: category === 'pending' && !track.locked};
        choices.push(choice);
        const row = document.createElement('div'); row.className = 'cat-te-h3-alignment-row';
        const info = document.createElement('div'); info.className = 'cat-te-h3-alignment-info';
        const name = document.createElement('div'); name.className = 'cat-te-h3-alignment-name'; name.textContent = clip.name || clip.id;
        const id = document.createElement('small'); id.textContent = clip.id;
        const duration = document.createElement('div'); duration.textContent = secondsFrames(options.frames, fps);
        info.append(duration, id);
        row.append(name, info);
        panels.get(category).append(row);
        if (category === 'aligned') continue;
        const group = document.createElement('cap-radio-group');
        group.setAttribute('aria-label', `${clip.id} · ${T('clip_duration_label')}`);
        const down = document.createElement('cap-radio-button');
        down.setAttribute('value', 'down'); down.setAttribute('indicator', '');
        down.textContent = `${alignmentT('down')} ${options.down == null ? '—' : secondsFrames(options.down, fps)}`;
        const up = document.createElement('cap-radio-button');
        up.setAttribute('value', 'up'); up.setAttribute('indicator', '');
        up.textContent = `${alignmentT('up')} ${secondsFrames(options.up, fps)}`;
        group.append(down, up); group.value = 'up';
        group.addEventListener('change', () => { choice.frames = group.value === 'down' ? options.down : options.up; });
        const label = document.createElement('label');
        const toggle = document.createElement('cap-switch');
        const checkbox = document.createElement('input'); checkbox.type = 'checkbox';
        checkbox.checked = category === 'pending'; checkbox.disabled = track.locked || options.aligned;
        toggle.append(checkbox); label.append(toggle, document.createTextNode(alignmentT('process')));
        const update = () => {
            choice.process = checkbox.checked && !options.aligned && !track.locked;
            group.disabled = !choice.process;
            down.disabled = !choice.process || options.down == null;
            row.classList.toggle('is-disabled', !choice.process);
        };
        checkbox.addEventListener('change', update); update();
        row.append(group, label);
    }
    for (const [key, panel] of panels) {
        buttons.get(key).textContent = `${alignmentT(key)} (${panel.childElementCount})`;
        if (!panel.childElementCount) {
            const empty = document.createElement('p'); empty.textContent = alignmentT('empty'); panel.append(empty);
        }
    }
    selectTab('pending');
    const footer = document.createElement('div'); footer.slot = 'footer';
    const cancel = document.createElement('cap-button'); cancel.textContent = T('cancel_btn'); cancel.onclick = () => dialog.close();
    const apply = document.createElement('cap-button'); apply.textContent = alignmentT('apply'); apply.setAttribute('variant', 'primary');
    apply.disabled = track.locked || !choices.some(row => row.process);
    body.addEventListener('change', () => { apply.disabled = !choices.some(row => row.process); });
    apply.onclick = () => {
        if (app._timeline === timeline && app.getFps() === fps) applyH3TrackAlignment(app, track, choices);
        dialog.close();
    };
    footer.append(cancel, apply); dialog.append(title, body, footer);
    dialog.addEventListener('close', () => dialog.remove(), {once: true});
    app._overlay.append(dialog); dialog.showModal();
}
