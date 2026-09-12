import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../js/cap_seq_to_video.js', import.meta.url), 'utf8');
let extension;
const app = { canvas: {}, graph: { setDirtyCanvas() {} }, registerExtension(e) { extension = e; } };
function element() {
    return {
        offsetHeight: 200, children: [], classList: { add() {} },
        appendChild(child) { this.children.push(child); },
        remove() {}, removeAttribute() {}, load() {}, pause() {},
        play: () => Promise.resolve(), addEventListener() {},
    };
}
const context = vm.createContext({
    app, api: { apiURL: path => path }, console,
    document: { createElement: element },
    bindCanvasWheelPassthrough() {}, loadExtensionCss() {}, t: key => key,
    fetch: async () => ({ ok: true, json: async () => ({ available: true }) }),
    requestAnimationFrame: callback => callback(),
    ResizeObserver: class {
        constructor(callback) { this.callback = callback; }
        observe(root) { this.root = root; }
        disconnect() { this.disconnected = true; }
    },
});
vm.runInContext(source.replace(/^import .*;\r?\n/gm, ''), context);

for (const type of ['CAP_SeqToVideo', 'CAP_ComposeClipVideos']) {
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
    node.onExecuted({ video: [{ filename: 'new.mp4', type: 'output' }] });
    node._stvVideo.onmouseenter();
    assert.equal(node._stvVideo.muted, false);
    node._stvVideo.onmouseleave();
    assert.equal(node._stvVideo.muted, true);
    const observer = node._stvResizeObs;
    node.onRemoved();
    assert.equal(observer.disconnected, true);
}
console.log('Both video nodes: content + DOM margins fit, saved previews, landscape/portrait resizing, stable height and hover audio passed.');
