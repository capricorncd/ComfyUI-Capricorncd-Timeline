import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/cap_seq_to_video.js', import.meta.url), 'utf8');
let extension;
const listeners = new Map();
const app = { canvas: {}, graph: { setDirtyCanvas() {} }, registerExtension(e) { extension = e; } };
function element() {
    return {
        offsetHeight: 200, style: {}, children: [], classList: { add() {} },
        appendChild(child) { this.children.push(child); },
        paused: true, listeners: {},
        remove() {}, removeAttribute() {}, load() {}, pause() { this.paused = true; },
        play() { this.paused = false; return Promise.resolve(); },
        addEventListener(name, handler) { this.listeners[name] = handler; },
        setStatus(text, state) { this.textContent = text; this.state = state; this.hidden = !text; },
    };
}
const context = vm.createContext({
    app, api: { apiURL: path => path, addEventListener: (name, handler) => listeners.set(name, handler) }, console,
    document: { createElement: element },
    bindCanvasWheelPassthrough() {}, loadExtensionCss() {},
    t: (key, v) => key === 'h3_progress' ? `Clip ${v.current} / ${v.total} · ${v.percent}% · ${v.phase}` : key,
    createPreviewPlayer: () => ({root: {...element(), style: {}}, updates: [],
        update(data) { this.updates.push(data); }, dispose() { this.disposed = true; }}),
    fetch: async () => ({ ok: true, json: async () => ({ available: true }) }),
    requestAnimationFrame: callback => callback(),
    ResizeObserver: class {
        constructor(callback) { this.callback = callback; }
        observe(root) { this.root = root; }
        disconnect() { this.disconnected = true; }
    },
});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, ''), context);

for (const type of ['CAP_SeqToVideo', 'CAP_ComposeClipVideos', 'CAP_H3VideoGenerator']) {
    class Node {
        constructor() { this.size = [500, 100]; this.widgets = []; }
        onNodeCreated() {}
        computeSize() {
            let height = 180; // Existing inputs / controls before the player.
            for (const w of this.widgets) {
                w.y = height;
                height += w.computeLayoutSize(this).minHeight + 4;
            }
            return [280, height + 6];
        }
        addDOMWidget(name, type, root, options) {
            const w = { name, type, root, options };
            this.widgets.push(w);
            return w;
        }
        configure(info) { this.size = [...info.size]; }
    }
    await extension.beforeRegisterNodeDef(Node, { name: type });
    const node = new Node();
    node.onNodeCreated();
    const w = node._stvWidget;
    const assertFits = () => {
        const layout = w.computeLayoutSize(node);
        if (type === 'CAP_H3VideoGenerator') {
            assert.equal(layout.minHeight, 220);
            assert.equal(layout.maxHeight, Infinity);
            assert.equal(w.options.getMinHeight(), 220, 'resizing can shrink back to the minimum');
            assert.equal(w.options.getHeight(), node._stvPlayerH + 20);
            assert.equal(node._stvRoot.style.height, `${node._stvPlayerH}px`);
            assert.ok(w.y + 20 + node._stvPlayerH <= node.size[1]);
            return;
        }
        assert.equal(layout.minHeight, node._stvRoot.offsetHeight + 2 * w.options.margin);
        assert.equal(layout.maxHeight, layout.minHeight);
        assert.equal(w.options.getHeight(), layout.minHeight);
        assert.equal(w.options.getMinHeight(), layout.minHeight);
        // ComfyUI puts the DOM at widget.y + margin, inside a height with two insets.
        assert.equal(layout.minHeight - 2 * w.options.margin, node._stvRoot.offsetHeight);
        assert.ok(w.y + w.options.margin + node._stvRoot.offsetHeight <= node.size[1] - w.options.margin);
    };
    node.setSize([500, node.computeSize()[1]]);
    assertFits(); // Placeholder.
    node.configure({ size: [620, 100], properties: { stv_video: { filename: 'saved.mp4', type: 'output' } } });
    assert.ok(node._stvVideo, 'saved videos are restored');
    assert.equal(node._stvVideo.controls, type === 'CAP_ComposeClipVideos');
    for (const [width, height] of [[620, 338], [400, 214], [400, 676], [850, 467]]) {
        app.canvas.resizing_node = node;
        node.setSize([width, node.size[1]]);
        app.canvas.resizing_node = null;
        node._stvRoot.offsetHeight = height;
        node._stvResizeObs.callback();
        assert.equal(node.size[0], width, 'auto-fit must retain the user-selected width');
        assertFits(); // Landscape, portrait and node resize.
        const stableHeight = node.size[1];
        node._stvResizeObs.callback();
        assert.equal(node.size[1], stableHeight, 'no repeated growth from margin double-counting');
    }
    if (type === 'CAP_H3VideoGenerator') {
        for (const size of [[850, 950], [320, 500], [600, 700]]) {
            app.canvas.resizing_node = node;
            node.setSize(size);
            app.canvas.resizing_node = null;
            assert.equal(node.size[1], size[1], 'manual height is retained');
            assertFits();
            const before = [...node.size];
            node._stvResizeObs.callback();
            assert.deepEqual([...node.size], before, 'preview resize does not snap the node back to natural video height');
        }
    }
    node.onExecuted({ video: [{ filename: 'new.mp4', type: 'output' }] });
    node._stvVideo.onmouseenter();
    assert.equal(node._stvVideo.muted, false);
    node._stvVideo.onmouseleave();
    assert.equal(node._stvVideo.muted, true);
    if (type === 'CAP_H3VideoGenerator') {
        node.comfyClass = type;
        const nested = {getNodeById: id => id === 2 ? node : null};
        app.rootGraph = {getNodeById: id => id === 1 ? {subgraph: nested} : null};
        const header = node._stvProgress;
        assert.equal(header.hidden, true);
        const report = data => listeners.get('cat_h3_progress')({detail: {node_id: '1:2', ...data}});
        report({clip_index: 1, clip_total: 3, percent: 0, phase: 'prepare'});
        assert.equal(header.textContent, 'Clip 1 / 3 · 0% · h3_phase_prepare');
        assert.equal(header.hidden, false);
        assert.equal(header.state, 'info');
        report({clip_index: 2, clip_total: 3, percent: 45, phase: 'refine'});
        assert.equal(header.textContent, 'Clip 2 / 3 · 45% · h3_phase_refine');
        const send = (filename, key, id = '1:2') => listeners.get('cat_h3_video_ready')({detail: {
            node_id: id, video: {filename, type: 'output', preview_key: key},
        }});
        send('clip1.mp4', 'run_0');
        const first = node._stvVideo;
        assert.ok(first.src.includes('clip1.mp4'));
        assert.equal(first.muted, true);
        first.listeners.canplay();
        assert.equal(first.paused, false, 'new clip automatically plays');
        first.onclick({preventDefault() {}, stopPropagation() {}});
        assert.equal(first.paused, true);
        first.onclick({preventDefault() {}, stopPropagation() {}});
        assert.equal(first.paused, false);
        first.onmouseenter();
        assert.equal(first.muted, false);
        first.onmouseleave();
        assert.equal(first.muted, true);
        send('clip2.mp4', 'run_1');
        const second = node._stvVideo;
        assert.equal(first.paused, true, 'previous clip is stopped');
        first.listeners.canplay();
        assert.equal(first.paused, true, 'late event cannot restart a detached video');
        second.listeners.canplay();
        second.onclick({preventDefault() {}, stopPropagation() {}});
        node.onExecuted({video: [{filename: 'clip2.mp4', type: 'output', preview_key: 'run_1'}]});
        assert.equal(node._stvVideo, second, 'completion does not replay the first clip or reset user pause');
        assert.equal(second.paused, true);
        send('wrong.mp4', 'run_2', '1:999');
        assert.equal(node._stvVideo, second);
        send('clip2.mp4', 'next-run_0');
        assert.notEqual(node._stvVideo, second, 'same filename in a new run reloads fresh data');
        send('final.mp4', 'next-run_final');
        assert.ok(node._stvVideo.src.includes('final.mp4'));
        const start = id => listeners.get('cat_h3_preview_started')({detail: {node_id: '1:2', preview_id: id}});
        const frame = id => listeners.get('kj_preview_override')({detail: {node_id: id, image: 'frame'}});
        const previousVideo = node._stvVideo;
        start('1:2::h3:run_0');
        const sampling = node._stvSampling;
        assert.equal(previousVideo.paused, true);
        assert.equal(node._stvVideo, null);
        frame('1:2::h3:run_0');
        assert.equal(sampling.updates.length, 1);
        start('1:2::h3:run_1');
        assert.equal(sampling.disposed, true);
        const nextSampling = node._stvSampling;
        frame('1:2::h3:run_0');
        assert.equal(nextSampling.updates.length, 0, 'late previous Clip preview is ignored');
        frame('1:2::h3:run_1');
        assert.equal(nextSampling.updates.length, 1);
        send('finished.mp4', 'run_1');
        assert.equal(node._stvProgress, header, 'sampling/video switches keep the progress header');
        assert.equal(nextSampling.disposed, true);
        assert.equal(node._stvSampling, null);
        frame('1:2::h3:run_1');
        assert.equal(nextSampling.updates.length, 1, 'late sampling cannot replace a saved video');
        assert.ok(node._stvVideo.src.includes('finished.mp4'));
        report({clip_index: 3, clip_total: 3, percent: 95, phase: 'compose'});
        assert.equal(header.state, 'info');
        node.onExecuted({h3_progress: [{clip_index: 3, clip_total: 3, percent: 100, phase: 'done'}]});
        assert.equal(header.textContent, 'Clip 3 / 3 · 100% · h3_phase_done');
        assert.equal(header.state, 'success');
        report({clip_index: 1, clip_total: 2, percent: 0, phase: 'prepare'});
        assert.equal(header.state, 'info', 'next run resets completed state');
        start('1:2::h3:run_2');
        const removedSampling = node._stvSampling;
        node.onRemoved();
        assert.equal(removedSampling.disposed, true);
        assert.equal(node._stvProgress, null);
        continue;
    }
    const observer = node._stvResizeObs;
    node.onRemoved();
    assert.equal(observer.disconnected, true);
}
console.log('Both video nodes: content + DOM margins fit, saved previews, landscape/portrait resizing, stable height and hover audio passed.');

const css = readFileSync(new URL('../js/cap_seq_to_video.css', import.meta.url), 'utf8');
assert.match(css, /\.stv-root\.stv-generator\s*\{[^}]*gap: 10px/s);
assert.match(css, /\.stv-generator > \.stv-progress\s*\{[^}]*opacity: 0\.5/s);
assert.match(css, /\.stv-generator \.cap-sampling-status\s*\{[^}]*position: absolute;[^}]*right: 0;[^}]*bottom: 0;[^}]*text-align: right;[^}]*opacity: 0\.5/s);
assert.match(css, /--cap-preview-radius: 2px/);
assert.match(css, /--cap-preview-status-font-size: 10px/);
assert.match(css, /\.stv-generator > \.cap-sampling-preview\s*\{[^}]*position: relative/s);
assert.match(css, /\.stv-generator > \.stv-video\s*\{[^}]*object-fit: contain/s);
