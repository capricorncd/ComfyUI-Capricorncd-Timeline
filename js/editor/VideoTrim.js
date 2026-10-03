import { t as T } from '../i18n/timeline_editor.js';

export function videoTrimSource(app, item) {
    const trim = app._findMediaById(item.id)?.video_trim;
    if (!trim) return { item, start: 0, duration: null, rate: 1 };
    const original = app._findMediaById(trim.source_id);
    if (!original) throw new Error(T('asset_missing_cannot_preview'));
    return { item: original, start: trim.start, duration: trim.duration, rate: trim.rate };
}
