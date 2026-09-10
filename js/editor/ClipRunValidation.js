const align = frames => 5 + Math.ceil((Math.max(5, frames) - 5) / 17) * 17;
const start = clip => Number(clip.start_ms || 0);
const duration = clip => Number(clip.duration_ms ?? (clip.end_ms - start(clip)));
const active = clip => clip.enabled !== false && clip.visible !== false
    && !['audio', 'subtitle', 'text', 'voiceover'].includes(clip.type)
    && (String(clip.prompt || '').split('\n').some(line => line.trim() && !line.trimStart().startsWith('#'))
        || (clip.media_ids || []).some((id, i) => id && clip.media_enabled?.[i] !== false)
        || clip.start_image || clip.end_image || clip.source?.file);
const h3 = clip => (clip.agent || 'MiniMaxH3') === 'MiniMaxH3';
const linked = (prev, next) => active(prev) && active(next) && h3(prev) && h3(next)
    && prev.save_latent && Number(next.h3_motion_context_length) >= 5
    && Math.abs(start(prev) + duration(prev) - start(next)) <= 1;

export function relatedH3ClipIds(project, clipId) {
    for (const track of project.tracks || []) {
        if (track.enabled === false || track.visible === false
            || !['director', 'visual', 'image', 'video'].includes(track.type || 'visual')) continue;
        const clips = [...(track.clips || [])].sort((a, b) => start(a) - start(b));
        const index = clips.findIndex(c => String(c.id) === String(clipId));
        if (index < 0 || !active(clips[index])) continue;
        let first = index, last = index;
        while (first > 0 && linked(clips[first - 1], clips[first])) first--;
        while (last + 1 < clips.length && linked(clips[last], clips[last + 1])) last++;
        return clips.slice(first, last + 1).map(c => String(c.id));
    }
    return [];
}

// Only contiguous Save Latent -> Context chains change their internal boundaries.
export function planClipRunLayout(project, clipIds = null) {
    const fps = Number(project.settings?.fps || project.fps || 24);
    const ids = clipIds?.length ? new Set(clipIds.map(String)) : null;
    const changes = [];
    for (const track of project.tracks || []) {
        if (track.enabled === false || track.visible === false
            || !['director', 'visual', 'image', 'video'].includes(track.type || 'visual')) continue;
        const clips = [...(track.clips || [])].sort((a, b) => start(a) - start(b));
        for (let i = 0; i < clips.length; i++) {
            const chain = [clips[i]];
            while (i + 1 < clips.length) {
                const prev = clips[i], next = clips[i + 1];
                if (!linked(prev, next)) break;
                chain.push(next);
                i++;
            }
            if (chain.length < 2 || (ids && !chain.some(c => ids.has(String(c.id))))) continue;
            const end = start(chain.at(-1)) + duration(chain.at(-1));
            const origin = start(chain[0]);
            let frame = 0, previousRaw = 0;
            const proposed = [];
            for (let j = 0; j < chain.length; j++) {
                const clip = chain[j];
                if (Number(clip.head_extend_sec) > 0 || Number(clip.tail_extend_sec) > 0) {
                    return { changes: [], error: 'h3_layout_extensions', clip: clip.name || clip.id };
                }
                const requested = Math.max(0, Number(clip.h3_motion_context_length) || 0);
                const context = j ? Math.min(5 + Math.floor((requested - 5) / 17) * 17, previousRaw) : 0;
                let raw;
                if (j === chain.length - 1) {
                    raw = align(Math.round((end - origin) * fps / 1000) - frame + context);
                } else {
                    // Move the shared boundary to its nearest legal position, in
                    // either direction. Reserve at least one frame for the tail
                    // and one 17-frame continuation block per intermediate clip.
                    const target = Math.round((start(clip) + duration(clip) - origin) * fps / 1000);
                    const remaining = Math.round((end - origin) * fps / 1000) - frame;
                    const reserve = (chain.length - j - 2) * 17 + 1;
                    const minRaw = align(context + 1);
                    const maxRaw = 5 + Math.floor((remaining - reserve + context - 5) / 17) * 17;
                    if (maxRaw < minRaw) {
                        return { changes: [], error: 'h3_layout_too_short', clip: clip.name || clip.id };
                    }
                    const wanted = target - frame + context;
                    const lower = 5 + Math.floor((wanted - 5) / 17) * 17;
                    const candidates = [lower, lower + 17].map(n => Math.max(minRaw, Math.min(maxRaw, n)));
                    raw = candidates.sort((a, b) => Math.abs(a - wanted) - Math.abs(b - wanted) || a - b)[0];
                }
                const nextStart = origin + Math.round(frame * 1000 / fps);
                frame += raw - context;
                const nextEnd = j === chain.length - 1 ? end : origin + Math.round(frame * 1000 / fps);
                if (Math.round((nextEnd - nextStart) * fps / 1000) < 1) {
                    return { changes: [], error: 'h3_layout_too_short', clip: clip.name || clip.id };
                }
                if (Math.abs(nextStart - start(clip)) > 1 || Math.abs(nextEnd - start(clip) - duration(clip)) > 1) {
                    proposed.push({ id: String(clip.id), name: clip.name || clip.id,
                        oldStart: start(clip), oldEnd: start(clip) + duration(clip), start: nextStart, end: nextEnd });
                }
                previousRaw = raw;
            }
            if (proposed.length && track.locked) return { changes: [], error: 'h3_layout_locked', clip: track.name || track.id };
            changes.push(...proposed);
        }
    }
    return { changes };
}

export function clipLayoutList(changes) {
    const time = ms => (ms / 1000).toFixed(3);
    return changes.map(c => `${c.name} [${c.id}]: ${time(c.oldStart)}–${time(c.oldEnd)} s → ${time(c.start)}–${time(c.end)} s`).join('\n');
}
