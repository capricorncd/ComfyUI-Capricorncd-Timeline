const SUFFIX = /__h3v1_c(\d+)_r(\d+)_h(\d+)_t(\d+)_f(\d+)_s([01])(?=\.[^.]+$)/;

export function stripH3Timing(file) {
    return String(file).replace(SUFFIX, "");
}

export function h3TimingFromFilename(file) {
    const match = String(file).match(SUFFIX);
    if (!match) return null;
    const [context, raw, head, tail, fpsMilli, save] = match.slice(1).map(Number);
    if (!(fpsMilli > 0 && raw > context + head + tail)) return null;
    return { context, raw, head, tail, fps: fpsMilli / 1000, save: !!save, play: raw - context - head - tail };
}

export function applyH3VideoTrim(gen) {
    const timing = h3TimingFromFilename(gen.file);
    if (!timing || gen.h3_trim_applied) return false;
    const actual = Math.round(Number(gen.duration_sec) * timing.fps);
    if (!(actual > 0)) return false;
    let offset;
    let tail = timing.tail;
    if (Math.abs(actual - timing.raw) <= 1) offset = timing.context + timing.head;
    else if (Math.abs(actual - (timing.raw - timing.context)) <= 1) offset = timing.head;
    else if (Math.abs(actual - timing.play) <= 1) { offset = 0; tail = 0; }
    else throw new Error(`H3 video length (${actual} frames) does not match its generation timing (${timing.raw}/${timing.raw - timing.context}/${timing.play}).`);
    gen.trim_in_sec = offset / timing.fps;
    gen.trim_out_sec = (actual - tail) / timing.fps;
    gen.h3_trim_applied = true;
    return true;
}

// One-time repair for projects saved by the removed automatic ripple feature.
export function restoreH3ClipTiming(clip) {
    if (!clip.h3_layout) return clip;
    const out = { ...clip };
    const old = out.h3_layout;
    delete out.h3_layout;
    if (!['start_sec', 'duration_sec', 'source_start_sec', 'source_duration_sec']
        .every(key => Number.isFinite(old[key]))) return out;
    let start = Number(clip.start_ms) || 0;
    let duration = Number(clip.duration_ms) || Number(clip.end_ms) - start;
    if (Math.abs(start - old.start_sec * 1000) <= 2) start = Math.round(old.source_start_sec * 1000);
    if (Math.abs(duration - old.duration_sec * 1000) <= 2) duration = Math.round(old.source_duration_sec * 1000);
    out.start_ms = start;
    out.duration_ms = duration;
    out.end_ms = start + duration;
    out.resource_start_sec = start / 1000;
    out.resource_duration_sec = duration / 1000;
    return out;
}
