export function renameAssetMentions(text, oldName, newName, names = []) {
    if (typeof text !== 'string' || !oldName || oldName === newName) return text;
    const escape = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const alternatives = [...new Set([oldName, ...names].filter(Boolean))].sort((a, b) => b.length - a.length);
    const pattern = new RegExp('(?<![\\p{L}\\p{N}_@])@(' + alternatives.map(escape).join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');
    return text.replace(pattern, (match, name) => name === oldName ? '@' + newName : match);
}
