const SUFFIX = /__h3v([12])_c(\d+)_r(\d+)_h(\d+)_t(\d+)_f(\d+)_s([01])(?:_n(\d+))?(?=\.[^.]+$)/;

export function stripH3Timing(file) {
    return String(file).replace(SUFFIX, "");
}

export function h3TimingFromFilename(file) {
    const match = String(file).match(SUFFIX);
    if (!match) return null;
    const [version, context, raw, head, tail, fpsMilli, save] = match.slice(1, 8).map(Number);
    const carry = Number(match[8] || 0);
    if ((version === 2 && match[8] == null) || (version === 1 && carry)) return null;
    if (!(fpsMilli > 0 && carry <= context && raw > context - carry + head + tail)) return null;
    return { version, context, carry, raw, head, tail, fps: fpsMilli / 1000, save: !!save, play: raw - context + carry - head - tail };
}

export function applyH3VideoTrim(gen) {
    const timing = h3TimingFromFilename(gen.file);
    if (!timing || gen.h3_trim_applied) return false;
    const actual = Math.round(Number(gen.duration_sec) * timing.fps);
    if (!(actual > 0)) return false;
    let offset;
    let tail = timing.tail;
    const tolerance = timing.version === 2 ? 0 : 1;
    if (Math.abs(actual - timing.raw) <= tolerance) offset = timing.context - timing.carry + timing.head;
    else if (Math.abs(actual - timing.play) <= tolerance) { offset = 0; tail = 0; }
    else if (Math.abs(actual - (timing.raw - timing.context)) <= tolerance) {
        if (timing.carry) throw new Error('H3 context carry frames were removed; use the original untrimmed video.');
        offset = timing.head;
    }
    else throw new Error(`H3 video length (${actual} frames) does not match its generation timing (${timing.raw}/${timing.raw - timing.context}/${timing.play}).`);
    gen.trim_in_sec = offset / timing.fps;
    gen.trim_out_sec = (actual - tail) / timing.fps;
    gen.h3_trim_applied = true;
    return true;
}

// Replace the preceding visible tail with the regenerated context from its successor.
export function replaceH3ContextTail(previousRows, nextRows, previousDuration) {
    const rows = previousRows.filter(row => !row.h3_context_from).map(row => ({ ...row }));
    for (const row of rows) {
        if (row.h3_context_original_out != null) {
            row.trim_out_sec = row.h3_context_original_out;
            delete row.h3_context_original_out;
        }
    }
    const previous = rows.find(row => row.enabled !== false);
    const next = nextRows.find(row => row.enabled !== false && !row.h3_context_from);
    const a = previous && h3TimingFromFilename(previous.file);
    const b = next && h3TimingFromFilename(next.file);
    if (!a?.save || !b?.context || a.fps !== b.fps || !previous.h3_trim_applied || !next.h3_trim_applied) return rows;
    if (b.version === 2 && (a.version !== 2 || b.carry !== a.tail)) return rows;
    if (Math.round(next.duration_sec * b.fps) !== b.raw || Math.round(previous.duration_sec * a.fps) !== a.raw) return rows;
    const end = Math.min(previous.trim_out_sec, previous.trim_in_sec + previousDuration - (previous.edit_start_sec || 0));
    const overlap = Math.min(end - previous.trim_in_sec, Math.max(0, end - (a.raw - b.context) / a.fps));
    if (!(overlap > 0)) return rows;
    previous.h3_context_original_out = previous.trim_out_sec;
    previous.trim_out_sec = end - overlap;
    const prefix = Math.max(0, previous.trim_out_sec - (a.raw - b.context) / a.fps);
    const contextId = `context_${previous.id}_${next.id}`;
    const existing = previousRows.find(row => row.id === contextId);
    rows.unshift({ ...next, id: contextId, h3_context_from: next.id,
        enabled: (existing || next).enabled !== false, muted: (existing || next).muted === true,
        trim_in_sec: prefix, trim_out_sec: prefix + overlap,
        edit_start_sec: (previous.edit_start_sec || 0) + previous.trim_out_sec - previous.trim_in_sec });
    return rows;
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
