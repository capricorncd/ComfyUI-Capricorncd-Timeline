export const REFMOD_PREVIEW_RATE_KEY = 'cat-te-refmod-preview-rate';

export function refModPlaybackRate(storage = localStorage) {
    const value = Number(storage.getItem(REFMOD_PREVIEW_RATE_KEY) || 2);
    return [1, 2, 4].includes(value) ? value : 2;
}

export function filterRefMods(rows, query = '', folder = '') {
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return rows.filter(row => (!folder || row.name.startsWith(folder + '/')) &&
        terms.every(term => `${row.name} ${row.description || ''}`.toLocaleLowerCase().includes(term)));
}

export function refModAssets(rows, apiURL) {
    return rows.map(row => ({
        id: `refmod:${row.name}`, name: row.name, file: row.name + '.safetensors', path: row.name,
        refmod: true, category: 'refmod', kind: row.preview_type === 'video' ? 'video' : 'image',
        description: row.description || '', tokens: row.tokens,
        preview: row.has_preview ? apiURL(`/refmods/preview?name=${encodeURIComponent(row.name)}`) : '',
    }));
}
