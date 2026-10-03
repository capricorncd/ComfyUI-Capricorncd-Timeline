import '../components/Dialog.js';
import '../components/Button.js';
import { iconHtml } from '../cap_icons.js';
import { makeT } from '../cap_i18n.js';

const t = makeT({
    en: {range: 'Intervals', rangeHelp: 'e.g. 1,3,5-90 (inclusive)', exclude: 'Exclude', invalid: 'Use interval numbers and inclusive ranges, e.g. 1,3,5-90.', title: 'Run keyframe intervals', hint: 'Select intervals to run; uncheck to exclude. Intervals over 10 seconds use latent continuation. Each result is kept separately in Trim Video at its original position, with excess frames trimmed.', all: 'Select all', none: 'Clear selection', run: 'Run selected', cancel: 'Cancel', parts: '{count} passes'},
    zh: {range: '区间编号', rangeHelp: '例如 1,3,5-90（含 90）', exclude: '除外', invalid: '请输入区间编号或包含两端的范围，例如 1,3,5-90。', title: '运行关键帧区间', hint: '勾选执行，取消勾选即排除。超过 10 秒的区间使用 latent 分段续接；生成结果分别加入修剪视频管理，按原位置对齐并裁掉多余帧。', all: '全选', none: '全不选', run: '运行所选区间', cancel: '取消', parts: '{count} 次生成'},
    ja: {range: '区間番号', rangeHelp: '例：1,3,5-90（90 を含む）', exclude: '除外', invalid: '区間番号または範囲を入力してください（例：1,3,5-90）。', title: 'キーフレーム区間を実行', hint: '実行する区間を選択してください。10 秒を超える区間は latent を引き継いで生成します。各動画は元の位置とトリム範囲で動画編集に追加されます。', all: 'すべて選択', none: '選択解除', run: '選択区間を実行', cancel: 'キャンセル', parts: '{count} 回生成'},
});

export function parseIntervalSelection(value, count) {
    if (!value.trim()) return null;
    const selected = new Set();
    for (const token of value.replaceAll('，', ',').split(',')) {
        const match = token.trim().match(/^(\d+)(?:\s*-\s*(\d+))?$/);
        if (!match) throw new Error('Invalid interval range');
        const start = Number(match[1]), end = Number(match[2] || match[1]);
        if (start < 1 || end < start || !Number.isSafeInteger(end)) throw new Error('Invalid interval range');
        for (let index = start; index <= Math.min(end, count); index++) selected.add(index);
    }
    return selected;
}

export function keyframeIntervals(duration, fps, points = []) {
    const end = Math.round(duration * fps);
    const starts = new Map([[0, '']]);
    for (const point of points) {
        const frame = Math.round(point.time * fps);
        if (frame >= 0 && frame < end) starts.set(frame, point.description || '');
    }
    const frames = [...starts.keys()].sort((a, b) => a - b);
    return frames.map((start, i) => ({start_frame: start, end_frame: frames[i + 1] ?? end, prompt: starts.get(start)}));
}

function clipKeyframeRun(editor, clip) {
    const meta = editor._ensureClipMeta(clip);
    if ((meta.agent || 'MiniMaxH3') !== 'MiniMaxH3') return null;
    const target = editor._directorKeyframes.target(clip);
    if (!target) return null;
    const saved = editor._directorKeyframes.points(target);
    if (target.local && !saved.length) return null;
    const fps = editor.getFps();
    const points = saved.map(point => ({
        time: (point.time - target.start) / target.rate, description: point.description,
    }));
    return {clip_id: String(clip.id), clip_start_ms: Math.round(clip.startTime * 1000), fps,
        ...(!target.local ? {reference: {id: target.media.id, start: target.start, rate: target.rate}} : {}),
        intervals: keyframeIntervals(clip.duration, fps, points)};
}

export function selectedKeyframeRun(editor) {
    const target = editor._directorKeyframes?.selectedTarget();
    if (!target || target.clip.track.locked) return null;
    const run = clipKeyframeRun(editor, target.clip);
    if (!run) return null;
    const frame = Math.round((editor._directorKeyframes.selection.point.time - target.start) / target.rate * run.fps);
    const interval = run.intervals.find(row => row.start_frame === frame);
    return interval ? {action: 'normal', keyframe_runs: [{...run, intervals: [interval]}]} : null;
}

export async function confirmKeyframeRun(editor, clips) {
    const fps = editor.getFps();
    const runs = clips.map(clip => clipKeyframeRun(editor, clip)).filter(Boolean);
    if (!runs.length) return {};
    const dialog = document.createElement('cap-dialog');
    dialog.className = 'cat-te-keyframe-run';
    const title = document.createElement('span'); title.slot = 'title'; title.textContent = t('title');
    const body = document.createElement('div'); body.className = 'cat-te-keyframe-run-body';
    const hint = document.createElement('p'); hint.textContent = t('hint'); body.append(hint);
    const rangeHeader = document.createElement('div'); rangeHeader.className = 'cat-te-keyframe-range-header';
    const rangeLabel = document.createElement('label'); rangeLabel.textContent = t('range');
    const range = document.createElement('input'); range.type = 'text'; range.placeholder = '1,3,5-90';
    range.id = 'cat-te-keyframe-range'; rangeLabel.htmlFor = range.id;
    const info = document.createElement('span'); info.className = 'cat-te-info-tip'; info.tabIndex = 0;
    info.setAttribute('aria-label', t('rangeHelp')); info.innerHTML = iconHtml('info', 14);
    const help = document.createElement('span'); help.className = 'cat-te-info-tip-pop'; help.textContent = t('rangeHelp');
    info.append(help);
    const excludeLabel = document.createElement('label'); excludeLabel.className = 'cat-te-keyframe-exclude';
    const exclude = document.createElement('input'); exclude.type = 'checkbox'; exclude.checked = false;
    excludeLabel.append(exclude, t('exclude'));
    rangeHeader.append(rangeLabel, info, excludeLabel);
    const error = document.createElement('p'); error.setAttribute('role', 'status'); error.hidden = true;
    body.append(rangeHeader, range, error);
    const checks = [];
    for (const run of runs) {
        const heading = document.createElement('strong');
        heading.className = 'cat-te-keyframe-run-heading';
        heading.textContent = clips.find(clip => String(clip.id) === run.clip_id).name || run.clip_id;
        body.append(heading);
        run.intervals.forEach(interval => {
            interval.number = checks.length + 1;
            const label = document.createElement('label');
            label.className = 'cat-te-keyframe-interval';
            const input = document.createElement('input'); input.type = 'checkbox'; input.checked = true;
            const text = document.createElement('span'); text.className = 'cat-te-keyframe-interval-content';
            const header = document.createElement('span'); header.className = 'cat-te-keyframe-interval-header';
            const number = document.createElement('span'); number.className = 'cat-te-keyframe-interval-number'; number.textContent = String(interval.number).padStart(2, '0');
            const time = document.createElement('span'); time.textContent = `${(interval.start_frame / fps).toFixed(2)}–${(interval.end_frame / fps).toFixed(2)} s`;
            const parts = document.createElement('span'); parts.className = 'cat-te-keyframe-interval-parts';
            parts.textContent = t('parts', {count: Math.ceil((interval.end_frame - interval.start_frame) / Math.floor(10 * fps))});
            header.append(number, time, parts); text.append(header);
            if (interval.prompt) { const prompt = document.createElement('small'); prompt.textContent = interval.prompt; text.append(prompt); }
            label.append(input, text); body.append(label); checks.push({input, run, interval});
        });
    }
    const footer = document.createElement('div'); footer.slot = 'footer'; footer.className = 'cat-te-keyframe-run-actions';
    const buttons = {};
    for (const action of ['all', 'none', 'cancel', 'run']) {
        const button = document.createElement('cap-button'); button.textContent = t(action);
        if (action === 'run') button.setAttribute('variant', 'primary');
        buttons[action] = button; footer.append(button);
    }
    const update = () => { buttons.run.disabled = !error.hidden || !checks.some(row => row.input.checked); };
    body.addEventListener('change', update);
    const applyRange = () => {
        try {
            const selected = parseIntervalSelection(range.value, checks.length);
            checks.forEach((row, index) => { row.input.checked = selected === null || (exclude.checked ? !selected.has(index + 1) : selected.has(index + 1)); });
            error.hidden = true;
        } catch { error.textContent = t('invalid'); error.hidden = false; }
        update();
    };
    range.addEventListener('input', applyRange); exclude.addEventListener('change', applyRange);
    for (const action of ['all', 'none']) buttons[action].onclick = () => {
        range.value = ''; error.hidden = true; checks.forEach(row => { row.input.checked = action === 'all'; }); update();
    };
    dialog.append(title, body, footer); editor._overlay.append(dialog);
    return new Promise(resolve => {
        let result = null;
        buttons.cancel.onclick = () => dialog.close();
        buttons.run.onclick = () => {
            result = {action: 'normal', keyframe_runs: runs.map(run => ({...run,
                intervals: checks.filter(row => row.run === run && row.input.checked).map(row => row.interval),
            }))};
            dialog.close();
        };
        dialog.addEventListener('close', () => { dialog.remove(); resolve(result); }, {once: true});
        dialog.showModal();
    });
}

export function addKeyframeVideo(rows, video, file, id) {
    if (rows.some(row => row.file === file)) return rows;
    const part = video.keyframe_segment;
    const start = part.start_frame / part.fps, duration = (part.end_frame - part.start_frame) / part.fps;
    const trim = part.trim_frames / part.output_fps;
    return [{id, file, enabled: true, muted: false, prompt: part.prompt || '', h3_trim_applied: true,
        keyframe_segment: part, edit_start_sec: start, trim_in_sec: trim, trim_out_sec: trim + duration,
        duration_sec: part.raw_frames / part.output_fps}, ...rows.map(row => {
            const rowStart = row.edit_start_sec || 0;
            const rowEnd = rowStart + ((row.trim_out_sec ?? row.duration_sec ?? Infinity) - (row.trim_in_sec || 0)) / (row.playback_rate || 1);
            return rowStart < start + duration - 1e-7 && rowEnd > start + 1e-7 ? {...row, enabled: false} : row;
        })];
}
