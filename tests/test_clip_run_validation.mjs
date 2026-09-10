import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planClipRunLayout, clipLayoutList, relatedH3ClipIds } from '../js/editor/ClipRunValidation.js';

const makeProject = () => ({ settings: { fps: 24 }, tracks: [{ type: 'director', clips:
    [0, 1, 2].map(i => ({ id: String(i), start_ms: i * 5000, duration_ms: 5000,
        prompt: 'shot', agent: 'MiniMaxH3', save_latent: i < 2, h3_motion_context_length: 22 })) }] });
const project = makeProject();
const before = JSON.stringify(project);
for (const id of ['0', '1', '2']) assert.deepEqual(relatedH3ClipIds(project, id), ['0', '1', '2']);
assert.deepEqual(relatedH3ClipIds(project, 'missing'), []);
const broken = makeProject(); broken.tracks[0].clips[1].enabled = false;
assert.deepEqual(relatedH3ClipIds(broken, '0'), ['0']);
assert.deepEqual(relatedH3ClipIds(broken, '1'), []);
const gap = makeProject(); gap.tracks[0].clips[1].start_ms += 100;
assert.deepEqual(relatedH3ClipIds(gap, '0'), ['0']);
const unsaved = makeProject(); unsaved.tracks[0].clips[0].save_latent = false;
assert.deepEqual(relatedH3ClipIds(unsaved, '1'), ['1', '2']);
const plan = planClipRunLayout(project);
assert.deepEqual(plan.changes.map(c => [c.start, c.end]), [[0, 5167], [5167, 10125], [10125, 15000]]);
assert.equal(JSON.stringify(project), before);
assert.match(clipLayoutList(plan.changes), /10\.125/);
const apply = (project, changes) => {
    for (const c of changes) {
        const clip = project.tracks.flatMap(t => t.clips).find(clip => clip.id === c.id);
        Object.assign(clip, { start_ms: c.start, duration_ms: c.end - c.start });
    }
};
apply(project, plan.changes);
assert.deepEqual(planClipRunLayout(project).changes, []); // no repeated expansion
assert.equal(project.tracks[0].clips.at(-1).start_ms + project.tracks[0].clips.at(-1).duration_ms, 15000);
assert.equal(planClipRunLayout(makeProject(), ['1']).changes.length, 3);
assert.equal(planClipRunLayout(makeProject(), ['other']).changes.length, 0);
for (const field of ['enabled', 'visible']) {
    const p = makeProject(); p.tracks[0].clips[1][field] = false;
    assert.equal(planClipRunLayout(p).changes.length, 0);
}
for (const type of ['media', 'audio', 'subtitle']) {
    const p = makeProject(); p.tracks[0].type = type;
    assert.equal(planClipRunLayout(p).changes.length, 0);
}
const locked = makeProject(); locked.tracks[0].locked = true;
assert.equal(planClipRunLayout(locked).error, 'h3_layout_locked');
const short = makeProject(); short.tracks[0].clips.forEach((c, i) => { c.start_ms = i * 100; c.duration_ms = 100; });
assert.equal(planClipRunLayout(short).error, 'h3_layout_too_short');
// Prefer shortening over a larger extension, while retaining whole H3 blocks.
const shorten = makeProject();
shorten.tracks[0].clips[0].duration_ms = 4583;
shorten.tracks[0].clips[1].start_ms = 4583;
shorten.tracks[0].clips[1].duration_ms = 5417;
assert.equal(planClipRunLayout(shorten).changes[0].end, 4458); // 110 -> 107, not 124
apply(shorten, planClipRunLayout(shorten).changes);
assert.deepEqual(planClipRunLayout(shorten).changes, []);
const shortTail = makeProject(); shortTail.tracks[0].clips[2].duration_ms = 100;
const shortTailPlan = planClipRunLayout(shortTail);
assert.equal(shortTailPlan.error, undefined);
assert.equal(shortTailPlan.changes.at(-1).end, 10100);
assert(shortTailPlan.changes.at(-1).end > shortTailPlan.changes.at(-1).start);
const extended = makeProject(); extended.tracks[0].clips[0].tail_extend_sec = 1;
assert.equal(planClipRunLayout(extended).error, 'h3_layout_extensions');
const fractional = makeProject();
fractional.tracks[0].clips[1].duration_ms = 5458;
fractional.tracks[0].clips[2].start_ms = 10458;
assert.equal(planClipRunLayout(fractional).changes.at(-1).end, 15458);
for (const fps of [24, 25, 30, 60]) {
    const p = makeProject(); p.settings.fps = fps;
    apply(p, planClipRunLayout(p).changes);
    assert.deepEqual(planClipRunLayout(p).changes, []);
}

const source = readFileSync(new URL('../js/CapTimelineEditorApp.js', import.meta.url), 'utf8');
function method(name, deps = {}) {
    const start = source.search(new RegExp(`    (async )?${name}\\(`));
    const end = source.indexOf('\n    }', start) + 6;
    assert(start >= 0);
    return new Function(...Object.keys(deps), `return ({${source.slice(start, end)}}).${name}`)(...Object.values(deps));
}
let accept = false, dialogs = 0, queued = 0, undo = 0;
const runtime = makeProject().tracks[0].clips.map(c => ({ id: c.id, startTime: c.start_ms / 1000, duration: 5 }));
const deps = { planClipRunLayout, clipLayoutList, T: key => key, alert: msg => { throw new Error(msg); },
    showCapConfirm: async () => { dialogs++; return accept; }, app: { queuePrompt: () => { queued++; } } };
const editor = {
    _timeline: { tracks: [{ clips: runtime }], _refresh() {} },
    _buildProject() { const p = makeProject(); p.tracks[0].clips.forEach((c, i) => Object.assign(c, {
        start_ms: Math.round(runtime[i].startTime * 1000), duration_ms: Math.round(runtime[i].duration * 1000),
    })); return p; },
    _recordUndo() { undo++; }, _decorateAllClips() {}, _refreshTimelineDuration() {}, _syncSelectedClip() {}, _saveToWidgets() {},
    _validateClipRunDurations: method('_validateClipRunDurations', deps),
};
await method('_runWorkflow', deps).call(editor);
assert.equal(queued, 0); assert.equal(undo, 0); assert.equal(dialogs, 1);
assert.equal(runtime[0].duration, 5);
accept = true;
await method('_runWorkflow', deps).call(editor);
assert.equal(queued, 1); assert.equal(undo, 1); assert.equal(dialogs, 2);
await method('_runWorkflow', deps).call(editor);
assert.equal(queued, 2); assert.equal(undo, 1); assert.equal(dialogs, 2);

let removed = false;
const removeMenu = method('_removeCtxMenu', { document: { querySelector: () => ({ remove() { removed = true; } }) } });
assert.equal(removeMenu.call({ _overlay: { querySelector: () => null }, _fontPicker: { close: () => false } }), false);
assert.equal(removed, false);

let batches = [], relatedChoice = false;
const relatedEditor = {
    _timeline: { getSelectedClips: () => [{ id: '2' }, { id: '0' }, { id: 'audio' }] },
    _buildProject: makeProject,
    _listActiveVisualClips: () => makeProject().tracks[0].clips,
    _runAllActiveClipsDownstream: async ({ clips }) => batches.push(clips.map(c => c.id)),
};
const runSelected = method('_runSelectedClipsDownstream', deps);
await runSelected.call(relatedEditor);
assert.deepEqual(batches, [['0', '2']]);
batches = [];
const confirmRelated = method('_confirmRelatedClipRun', {
    ...deps, relatedH3ClipIds, showCapConfirm: async () => relatedChoice,
});
assert.equal(await confirmRelated.call(relatedEditor, { id: '1' }), 'cancel');
assert.deepEqual(batches, []);
relatedChoice = 'alternate';
assert.equal(await confirmRelated.call(relatedEditor, { id: '1' }), 'single');
assert.deepEqual(batches, []);
relatedChoice = true;
assert.equal(await confirmRelated.call(relatedEditor, { id: '1' }), 'all');
assert.deepEqual(batches, [['0', '1', '2']]);
assert.equal(relatedEditor._relatedClipConfirmOpen, false);
relatedEditor._relatedClipConfirmOpen = true;
assert.equal(await confirmRelated.call(relatedEditor, { id: '1' }), 'cancel');
console.log('H3 run layout: boundaries, fixed duration, idempotence, scope, cancellation and confirmation passed');
