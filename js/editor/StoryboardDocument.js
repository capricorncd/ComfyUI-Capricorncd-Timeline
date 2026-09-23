export const STORYBOARD_SCHEMA_VERSION = 1;
export const STORYBOARD_TEXT_FIELDS = ['title', 'description', 'shot_size', 'camera_move', 'speaker', 'dialogue', 'emotion', 'delivery', 'image_id'];

export function normalizeStoryboards(value) {
    const ids = new Set();
    return (Array.isArray(value) ? value : []).filter(row => row && typeof row === 'object' && !Array.isArray(row)).map(row => {
        let id = typeof row.id === 'string' && row.id ? row.id : crypto.randomUUID();
        if (ids.has(id)) id = crypto.randomUUID();
        ids.add(id);
        const duration = Number(row.duration);
        return { ...row, id, ...Object.fromEntries(STORYBOARD_TEXT_FIELDS.map(key => [key, String(row[key] ?? '')])),
            clip_ids: [...new Set((Array.isArray(row.clip_ids) ? row.clip_ids : [row.source_clip_id]).filter(id => typeof id === 'string' && id))],
            duration: Number.isFinite(duration) && duration > 0 ? duration : 5 };
    });
}

export function parseStoryboardDocument(value, legacyShots = []) {
    const raw = typeof value === 'string' ? (value.trim() ? JSON.parse(value) : null) : value;
    const document = raw ?? { schema_version: STORYBOARD_SCHEMA_VERSION, shots: legacyShots };
    if (!document || typeof document !== 'object' || Array.isArray(document)) throw new Error('Invalid storyboard.json');
    if (document.schema_version !== STORYBOARD_SCHEMA_VERSION) throw new Error(`Unsupported storyboard schema_version: ${document.schema_version}`);
    if (!Array.isArray(document.shots) || document.shots.some(shot => !shot || typeof shot !== 'object' || Array.isArray(shot))) throw new Error('Invalid storyboard shots');
    return { schema_version: STORYBOARD_SCHEMA_VERSION, shots: normalizeStoryboards(document.shots) };
}

export function buildStoryboardDocument(shots) {
    return { schema_version: STORYBOARD_SCHEMA_VERSION, shots: structuredClone(shots) };
}
