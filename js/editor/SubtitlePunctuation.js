export const punctuationGroups = [
    { id: "period", checked: true, pattern: /^[.。．｡﹒]$/u },
    { id: "comma", checked: true, pattern: /[,，、､﹐﹑]/u },
    { id: "question", checked: true, pattern: /[?？﹖]/u },
    { id: "exclamation", checked: true, pattern: /[!！﹗]/u },
    { id: "quote", pattern: /\p{Quotation_Mark}/u },
    { id: "bracket", pattern: /[\p{Ps}\p{Pe}]/u },
    { id: "other" },
];

export function removeTrailingPunctuation(text, selected) {
    return text.replace(/\p{P}(?:\p{P}|[^\S\r\n\u2028\u2029])*$/gmu, tail =>
        tail.replace(/(\.{3,}|\p{P})[^\S\r\n\u2028\u2029]*/gu, (match, mark) => {
            const group = punctuationGroups.find(({ pattern }) => pattern?.test(mark));
            return selected.has(group?.id ?? "other") ? "" : match;
        }));
}
