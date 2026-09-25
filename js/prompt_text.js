export function isPromptComment(line) {
    return line.trimStart().startsWith("//");
}

export function stripPromptComments(text) {
    return String(text ?? "").replace(/\r\n?/g, "\n").split("\n")
        .filter(line => !isPromptComment(line)).join("\n");
}
