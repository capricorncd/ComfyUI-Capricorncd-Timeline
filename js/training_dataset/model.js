export const FPS = 24;
// Workflow state is JSON data; JSON serialization also unwraps reactive proxies.
export function copyDatasetData(value) {
    return JSON.parse(JSON.stringify(value));
}
export function windowBounds(segment, frames = 124) {
    const min = Math.ceil(segment.start * FPS - 1e-7);
    const max = Math.floor(segment.end * FPS + 1e-7) - frames;
    return { min, max, eligible: max >= min };
}
export function scenesFromPoints(points, duration, previous = []) {
    const cuts = [...new Set([0, ...points.filter(x => Number.isFinite(x) && x > 0 && x < duration), duration])].sort((a, b) => a - b);
    return cuts.slice(0, -1).map((start, i) => {
        const end = cuts[i + 1];
        const old = previous.find(s => s.start === start && s.end === end);
        return old || { id: crypto.randomUUID(), start, end, offset: Math.ceil(start * FPS - 1e-7) / FPS, selected: false, caption: '', caption_origin: 'manual' };
    });
}
export function normalizeSelection(sources, frames) {
    for (const source of sources) for (const segment of source.segments) {
        const bounds = windowBounds(segment, frames);
        segment.selected = !!segment.selected;
        segment.offset = Math.max(bounds.min, Math.min(Math.max(bounds.min,bounds.max), Math.round(segment.offset * FPS))) / FPS;
    }
}
export function selectedClips(sources, frames) {
    return sources.filter(source=>source.token).flatMap(source => source.segments.filter(s => s.selected && windowBounds(s, frames).eligible)
        .map(s => ({ ...s, token: source.token })));
}
