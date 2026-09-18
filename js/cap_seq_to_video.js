import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { bindCanvasWheelPassthrough } from "./cap_canvas_wheel.js";
import { loadExtensionCss } from "./cap_ui.js";
import { t } from "./i18n/seq_to_video.js";
import { createPreviewPlayer } from "./cap_model_preview.js";
import "./components/StatusMessage.js";

const PLAYER_NODES   = new Set(["CAP_SeqToVideo", "CAP_ComposeClipVideos", "CAP_H3VideoGenerator"]);
const PLAYER_H       = 200;  // placeholder / initial height in px
const PLAYER_MARGIN  = 10;   // ComfyUI DOM widget inset on each side
const MIN_NODE_WIDTH = 300;  // px

// Session-only state survives graph replacement; keep only the latest frame per node.
const generatorStates = new Map();
function generatorState(data) {
    if (!data?.workflow_id || data.node_id == null) return null;
    const key = `${data.workflow_id}/${data.node_id}`;
    let state = generatorStates.get(key);
    if (!state || (data.prompt_id && state.promptId !== data.prompt_id)) {
        state = { workflowId: data.workflow_id, nodeId: data.node_id, promptId: data.prompt_id };
    }
    generatorStates.delete(key);
    generatorStates.set(key, state);
    if (generatorStates.size > 16) generatorStates.delete(generatorStates.keys().next().value);
    return state;
}

function activeGenerator(state) {
    const graph = app.rootGraph ?? app.graph;
    return state && graph?.id === state.workflowId ? findGeneratorVideoNode(graph, state.nodeId) : null;
}

function restoreGenerator(node) {
    for (const state of generatorStates.values()) {
        if (activeGenerator(state) !== node) continue;
        showGeneratorProgress(node, state.progress);
        if (state.preview) {
            startSamplingPreview(node, state.preview);
            if (state.frame) node._stvSampling?.update(state.frame);
        } else if (state.video) showVideo(node, state.video);
        return true;
    }
    return false;
}

function loadCss() {
    loadExtensionCss("cap_seq_to_video.css", "stv-styles");
}

function videoUrl(info) {
    return api.apiURL(
        `/view?filename=${encodeURIComponent(info.filename)}&type=${info.type}&subfolder=${encodeURIComponent(info.subfolder ?? "")}`
        + (info.preview_key ? `&v=${encodeURIComponent(info.preview_key)}` : "")
    );
}

function findGeneratorVideoNode(graph, id) {
    const parts = String(id ?? "").split(":");
    if (!parts.every(part => /^\d+$/.test(part))) return null;
    let node;
    for (let i = 0; i < parts.length; i++) {
        node = graph?.getNodeById(Number(parts[i]));
        if (i < parts.length - 1) graph = node?.subgraph;
    }
    return node?.comfyClass === "CAP_H3VideoGenerator" ? node : null;
}

function showVideo(node, info) {
    if (!info || !node?._stvRoot) return;
    clearSamplingPreview(node);
    node._stvLastVideoInfo = info;
    const url = videoUrl(info);
    if (url === node._stvCurrent) return;
    node._stvCurrent = url;
    _loadVideo(node, url);
}

api.addEventListener("cat_h3_video_ready", event => {
    const data = event.detail;
    if (!data?.video) return;
    const state = generatorState(data);
    if (!state) return;
    state.video = data.video;
    state.preview = state.frame = null;
    showVideo(activeGenerator(state), data.video);
});

function showGeneratorProgress(node, data) {
    if (!node?._stvProgress || !data) return;
    const percent = Math.max(0, Math.min(100, Number(data.percent) || 0));
    node._stvProgress.setStatus(t("h3_progress", {
        current: data.clip_index, total: data.clip_total, percent,
        phase: t(`h3_phase_${data.phase}`),
    }), data.phase === "done" ? "success" : "info");
}

api.addEventListener("cat_h3_progress", event => {
    const data = event.detail;
    const state = generatorState(data);
    if (!state) return;
    state.progress = data;
    showGeneratorProgress(activeGenerator(state), data);
});

function clearSamplingPreview(node) {
    node._stvSampling?.dispose();
    node._stvSampling?.root.remove();
    node._stvSampling = null;
    node._stvSamplingId = null;
}

function startSamplingPreview(node, data) {
    if (!node?._stvRoot || !data.preview_id) return;
    if (node._stvSamplingId === data.preview_id) return;
    clearSamplingPreview(node);
    node._stvVideo?.pause();
    node._stvVideo?.removeAttribute("src");
    node._stvVideo?.load();
    node._stvVideo?.remove();
    node._stvVideo = null;
    node._stvCurrent = null;
    node._stvHolder?.remove();
    node._stvHolder = null;
    node._stvSamplingId = data.preview_id;
    node._stvSampling = createPreviewPlayer();
    node._stvSampling.root.style.width = "100%";
    node._stvRoot.classList.add("stv-loaded");
    node._stvRoot.appendChild(node._stvSampling.root);
}

api.addEventListener("cat_h3_preview_started", event => {
    const data = event.detail;
    const state = generatorState(data);
    if (!state) return;
    state.preview = data;
    state.frame = state.video = null;
    startSamplingPreview(activeGenerator(state), data);
});

api.addEventListener("kj_preview_override", event => {
    const data = event.detail;
    const id = String(data?.node_id ?? "");
    const separator = id.indexOf("::h3:");
    if (separator < 0) return;
    // Ignore late encodes from a completed Clip or an earlier execution.
    for (const state of generatorStates.values()) {
        if (state.preview?.preview_id !== id) continue;
        if (typeof data.image === "string") state.frame = data;
        const node = activeGenerator(state);
        if (node?._stvSamplingId === id) node._stvSampling.update(data);
        break;
    }
});

function clampWidth(size) {
    return [Math.max(size[0], MIN_NODE_WIDTH), size[1]];
}

function clearStvWidgetWidth(node) {
    const w = node._stvWidget;
    if (w && w.width != null) delete w.width;
}

function playerWidgetHeight(node) {
    // DOM content occupies the layout height minus both widget margins.
    return node._stvPlayerH + PLAYER_MARGIN * 2;
}

function resizeGeneratorPreview(node, size) {
    if (!node._stvClickToPause || !node._stvWidget) return;
    const minHeight = PLAYER_H + PLAYER_MARGIN * 2;
    const controlsHeight = node.computeSize()[1] - minHeight;
    node._stvPlayerH = Math.max(PLAYER_H, size[1] - controlsHeight - PLAYER_MARGIN * 2);
    size[1] = controlsHeight + playerWidgetHeight(node);
    node._stvRoot.style.height = `${node._stvPlayerH}px`;
}

// ── ffmpeg status — checked once, result cached ────────────────────────────

let _ffmpegPromise = null;

async function checkFfmpeg() {
    if (_ffmpegPromise) return _ffmpegPromise;
    _ffmpegPromise = fetch(api.apiURL("/cap/ffmpeg_status"))
        .then(r => r.ok ? r.json() : { available: false, version: null })
        .catch(() => ({ available: false, version: null }));
    return _ffmpegPromise;
}

// ── Extension ──────────────────────────────────────────────────────────────

app.registerExtension({
    name: "Capricorncd.SeqToVideo",

    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (!PLAYER_NODES.has(nodeData.name)) return;
        loadCss();

        // ── prevent automatic layout from narrowing the node ────────────────
        nodeType.prototype.setSize = function (size) {
            const isUserResize = app.canvas?.resizing_node === this;
            if (!isUserResize) {
                const curW = this.size?.[0] ?? 0;
                if (curW > 0 && size[0] < curW) size = [curW, size[1]];
            }
            this.size = clampWidth(size);
            this.onResize?.(this.size);
        };

        const computeSize = nodeType.prototype.computeSize;
        nodeType.prototype.computeSize = function (out) {
            const size = computeSize?.apply(this, arguments) ?? (out ? [...out] : [0, 0]);
            return clampWidth(size);
        };

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            configure?.apply(this, arguments);
            if ((this.size?.[0] ?? 0) < MIN_NODE_WIDTH) {
                this.setSize([MIN_NODE_WIDTH, this.size[1]]);
            }
            clearStvWidgetWidth(this);
            resizeGeneratorPreview(this, this.size);
            // Restore last video after workflow reload / browser refresh
            const vi = info?.properties?.stv_video;
            if (vi && !this._stvCurrent) {
                this._stvLastVideoInfo = vi;
                const url = videoUrl(vi);
                this._stvCurrent = url;
                requestAnimationFrame(() => {
                    if (this._stvRoot && !this._stvVideo && !this._stvSampling && this._stvCurrent === url) _loadVideo(this, url);
                });
            }
            if (this._stvClickToPause) requestAnimationFrame(() => restoreGenerator(this));
        };

        // Persist last video info in workflow JSON
        const onSerialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            onSerialize?.apply(this, arguments);
            if (!info.properties) info.properties = {};
            if (this._stvLastVideoInfo) {
                info.properties.stv_video = this._stvLastVideoInfo;
            }
        };

        const onSelected = nodeType.prototype.onSelected;
        nodeType.prototype.onSelected = function () {
            onSelected?.apply(this, arguments);
            clearStvWidgetWidth(this);
        };

        const onResize = nodeType.prototype.onResize;
        nodeType.prototype.onResize = function (size) {
            onResize?.apply(this, arguments);
            resizeGeneratorPreview(this, size);
        };

        // ── node created ────────────────────────────────────────────────────
        const onNodeCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            onNodeCreated?.apply(this, arguments);
            this._stvRoot          = null;
            this._stvVideo         = null;
            this._stvHolder        = null;
            this._stvWidget        = null;
            this._stvCurrent       = null;
            this._stvLastVideoInfo = null;
            this._stvPlayerH       = PLAYER_H;
            this._stvResizeObs     = null;
            this._stvControls      = nodeData.name === "CAP_ComposeClipVideos";
            this._stvClickToPause  = nodeData.name === "CAP_H3VideoGenerator";
            _buildPlayer(this);
        };

        // ── execution result ────────────────────────────────────────────────
        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            onExecuted?.apply(this, arguments);
            if (this._stvClickToPause && restoreGenerator(this)) return;
            // Prefer custom "video" payload; also accept core PreviewVideo shape
            // (images + animated) so previews still work across frontend versions.
            const info = output?.video?.[0]
                || (output?.animated?.find?.(Boolean) ? output?.images?.[0] : null);
            showVideo(this, info);
            showGeneratorProgress(this, output?.h3_progress?.[0]);
        };

        // ── cleanup ─────────────────────────────────────────────────────────
        const onRemoved = nodeType.prototype.onRemoved;
        nodeType.prototype.onRemoved = function () {
            _destroyPlayer(this);
            onRemoved?.apply(this, arguments);
        };
    },
    loadedGraphNode(node) {
        if (node.comfyClass === "CAP_H3VideoGenerator") requestAnimationFrame(() => restoreGenerator(node));
    },
});

// ── Player helpers ─────────────────────────────────────────────────────────

function _buildPlayer(node) {
    const root = document.createElement("div");
    root.className = "stv-root";  // no stv-loaded → placeholder CSS applies
    bindCanvasWheelPassthrough(root);

    if (node._stvClickToPause) {
        root.classList.add("stv-generator");
        const progress = document.createElement("cap-status-message");
        progress.className = "stv-progress";
        progress.hidden = true;
        progress.title = t("h3_progress_tip");
        root.appendChild(progress);
        node._stvProgress = progress;
    }

    const holder = document.createElement("div");
    holder.className = "stv-placeholder";
    holder.textContent = t("waiting_compose");
    root.appendChild(holder);

    const w = node.addDOMWidget("stv_ui", "stv_player", root, {
        // Required after ComfyUI frontend Vue-widget migration: without
        // canvasOnly the player is not rendered on the node canvas.
        canvasOnly: true,
        hideOnZoom: false,
        margin: PLAYER_MARGIN,
        getMinHeight: () => node._stvClickToPause ? PLAYER_H + PLAYER_MARGIN * 2 : playerWidgetHeight(node),
        getHeight:    () => playerWidgetHeight(node),
    });
    w.serialize = false;
    w.computeLayoutSize = () => ({
        minHeight: node._stvClickToPause ? PLAYER_H + PLAYER_MARGIN * 2 : playerWidgetHeight(node),
        maxHeight: node._stvClickToPause ? Infinity : playerWidgetHeight(node),
        minWidth: MIN_NODE_WIDTH,
    });
    if (node._stvClickToPause) w.computeSize = () => [0, PLAYER_H + PLAYER_MARGIN * 2];

    // Prevent stale widget.width from narrowing the player when node is selected
    Object.defineProperty(w, "width", {
        get() { return undefined; },
        set() {},
        enumerable: true,
        configurable: true,
    });

    // ── ResizeObserver: update getHeight when video changes root size ───────
    // Use current node width explicitly — never let computeSize() dictate the width,
    // as its base implementation returns LiteGraph's minimum (280px) when widgets
    // don't report a fixed size, which would shrink the node on every DOM resize.
    const ro = new ResizeObserver(() => {
        if (node._stvClickToPause) return;
        const h = root.offsetHeight;
        if (h > 0 && h !== node._stvPlayerH) {
            node._stvPlayerH = h;
            const curW = node.size?.[0] ?? MIN_NODE_WIDTH;
            const newH = (node.computeSize?.() ?? [curW, h])[1];
            node.setSize([curW, newH]);
            app.graph?.setDirtyCanvas(true, true);
        }
    });
    ro.observe(root);
    node._stvResizeObs = ro;

    node._stvRoot   = root;
    node._stvHolder = holder;
    node._stvWidget = w;
    resizeGeneratorPreview(node, node.size);

    // Async ffmpeg check — update placeholder if not found
    checkFfmpeg().then(status => {
        if (!node._stvRoot) return;
        if (node._stvVideo) return;
        if (!status.available) {
            _showError(node, t("ffmpeg_not_found"));
        }
    });
}

function _showError(node, message) {
    const root = node._stvRoot;
    if (!root) return;
    node._stvHolder?.remove();

    const banner = document.createElement("div");
    banner.className = "stv-error";
    banner.innerHTML =
        `<span class="stv-error-icon">✕</span>` +
        `<span>${message}</span>`;
    root.appendChild(banner);
    node._stvHolder = banner;
}

function _loadVideo(node, url) {
    const root = node._stvRoot;
    if (!root) return;

    if (node._stvVideo) {
        node._stvVideo.pause();
        node._stvVideo.removeAttribute("src");
        node._stvVideo.load();
        node._stvVideo.remove();
    }
    node._stvHolder?.remove();
    node._stvHolder = null;

    const video = document.createElement("video");
    video.className   = "stv-video";
    bindCanvasWheelPassthrough(video);
    video.loop        = true;
    video.muted       = true;   // start muted per browser autoplay policy
    video.autoplay    = false;
    video.playsInline = true;
    video.controls    = node._stvControls;

    // Hover unmute — attach directly to <video> (same pattern as VideoHelperSuite)
    video.onmouseenter = () => { video.muted = false; video.volume = 1; };
    video.onmouseleave = () => { video.muted = true; };
    if (node._stvClickToPause) {
        video.onclick = event => {
            event.preventDefault();
            event.stopPropagation();
            if (video.paused) void video.play().catch(() => {});
            else video.pause();
        };
    }

    video.src = url;
    video.addEventListener("canplay", () => {
        if (node._stvVideo === video) video.play().catch(() => {});
    }, { once: true });

    // Switch root from placeholder layout to auto-height layout
    root.classList.add("stv-loaded");
    root.appendChild(video);
    node._stvVideo = video;
}

function _destroyPlayer(node) {
    clearSamplingPreview(node);
    node._stvProgress = null;
    node._stvResizeObs?.disconnect();
    node._stvResizeObs = null;
    node._stvVideo?.pause();
    node._stvVideo?.removeAttribute("src");
    node._stvVideo   = null;
    node._stvRoot    = null;
    node._stvWidget  = null;
    node._stvCurrent = null;
}

console.log("[CAP_SeqToVideo] extension loaded");
