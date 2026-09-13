export function previewSeedValue(value) {
    if (value == null || typeof value === "boolean" || String(value).trim() === "") return null;
    const seed = Number(value);
    return Number.isSafeInteger(seed) && seed >= 0 ? seed : null;
}

// Read only the submitted graph, never widgets which may already have randomized.
export function workflowPreviewSeed(graph, clipId, previewNodeIds) {
    const linked = value => Array.isArray(value) && value.length === 2;
    const nodeAt = value => linked(value) ? graph[value[0]] : null;
    function timelineClip(value) {
        const node = nodeAt(value);
        if (node?.class_type !== "CAP_TimelineEditor" || value[1] !== 3) return null;
        try {
            const project = JSON.parse(node.inputs.project_json);
            const ids = project.settings?.runtime_only_clip_ids;
            if (ids?.length !== 1 || String(ids[0]) !== clipId) return null;
            return project.tracks?.flatMap(t => t.clips || []).find(c => String(c.id) === clipId);
        } catch { return null; }
    }
    function clipFromParser(value, slot) {
        const node = nodeAt(value);
        if (node?.class_type !== "CAP_DataJsonClipParser" || value[1] !== slot) return null;
        return timelineClip(node.inputs.data_json);
    }
    function resolve(value) {
        if (!linked(value)) return previewSeedValue(value);
        const node = nodeAt(value);
        if (node?.class_type === "CAP_DataJsonClipParser" && value[1] === 19) {
            return previewSeedValue(clipFromParser(value, 19)?.seed);
        }
        if (node?.class_type === "CAP_MiniMaxH3ReferenceToVideo" && value[1] === 10) {
            const inputs = node.inputs || {};
            const clip = inputs.clip_json
                ? clipFromParser(inputs.clip_json, 14) : timelineClip(inputs.data_json);
            return previewSeedValue(clip?.seed);
        }
        return null;
    }
    function ancestors(id, seen = new Set()) {
        if (seen.has(id) || !graph[id]) return seen;
        seen.add(id);
        for (const value of Object.values(graph[id].inputs || {})) {
            if (linked(value)) ancestors(String(value[0]), seen);
        }
        return seen;
    }
    const seeds = [];
    for (const [id, node] of Object.entries(graph)) {
        const inputs = node.inputs || {};
        if (!/Sampler/.test(node.class_type) || !("noise" in inputs || "seed" in inputs || "noise_seed" in inputs)) continue;
        const upstream = ancestors(id);
        if (![...previewNodeIds].some(key => upstream.has(key))) continue;
        if ("noise" in inputs) {
            const noise = nodeAt(inputs.noise);
            if (noise?.class_type === "DisableNoise") continue;
            seeds.push(noise?.class_type === "RandomNoise" && inputs.noise[1] === 0
                ? resolve(noise.inputs.noise_seed) : null);
        }
        for (const key of ["seed", "noise_seed"]) if (key in inputs) seeds.push(resolve(inputs[key]));
    }
    return seeds.length && seeds.every(seed => seed !== null && seed === seeds[0]) ? seeds[0] : null;
}
