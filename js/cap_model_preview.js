import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { bindCanvasWheelPassthrough } from "./cap_canvas_wheel.js";

export function findPreviewNode(graph, id) {
    const parts = String(id ?? "").split(":");
    if (!parts.every(part => /^\d+$/.test(part))) return null;
    let node;
    for (let i = 0; i < parts.length; i++) {
        node = graph?.getNodeById(Number(parts[i]));
        if (i < parts.length - 1) graph = node?.subgraph;
    }
    return node?.comfyClass === "CAP_ModelPreviewOverride" ? node : null;
}

export function createPreviewPlayer() {
    const root = document.createElement("div");
    root.style.cssText = "height:224px;box-sizing:border-box;overflow:hidden;background:#111;color:#ddd;border-radius:6px";
    const status = document.createElement("div");
    status.style.cssText = "height:24px;padding:3px 8px;box-sizing:border-box;font:12px sans-serif";
    status.textContent = "Preview";
    const stage = document.createElement("div");
    stage.style.cssText = "height:200px;overflow:hidden";
    root.append(status, stage);
    let current = null, pending = null, disposed = false;
    function release(frame) {
        if (!frame) return;
        frame.media.onload = frame.media.onloadeddata = frame.media.onerror = null;
        if (frame.media.tagName === "VIDEO") frame.media.pause();
        frame.media.removeAttribute("src");
        if (frame.media.tagName === "VIDEO") frame.media.load();
        URL.revokeObjectURL(frame.url);
    }
    return {
        root,
        update(data) {
            if (disposed) return;
            status.textContent = `${Number(data.step) || 0} / ${Number(data.total) || 0}`;
            if (typeof data.image !== "string") return;
            const mime = data.mime || (data.step === 0 ? "image/jpeg" : "");
            if (!["image/jpeg", "image/webp", "video/mp4"].includes(mime)) return;
            let bytes;
            try { bytes = Uint8Array.from(atob(data.image), c => c.charCodeAt(0)); }
            catch { return; }
            release(pending);
            const media = document.createElement(mime === "video/mp4" ? "video" : "img");
            media.style.cssText = "display:block;width:100%;height:100%;object-fit:contain";
            if (mime === "video/mp4") {
                media.muted = true;
                media.loop = true;
                media.playsInline = true;
                media.preload = "auto";
            } else media.alt = "Sampling preview";
            const frame = {media, url: URL.createObjectURL(new Blob([bytes], {type: mime}))};
            pending = frame;
            const ready = () => {
                if (disposed || pending !== frame) return;
                release(current);
                current = frame;
                pending = null;
                stage.replaceChildren(media);
                if (mime === "video/mp4") void media.play().catch(() => {});
            };
            if (mime === "video/mp4") media.onloadeddata = ready;
            else media.onload = ready;
            media.onerror = () => {
                if (pending !== frame) return;
                pending = null;
                release(frame);
                status.textContent = "Preview decode failed";
            };
            media.src = frame.url;
        },
        dispose() {
            disposed = true;
            release(pending);
            release(current);
            pending = current = null;
            stage.replaceChildren();
        },
    };
}

api.addEventListener("kj_preview_override", event => {
    const data = event.detail;
    if (!data) return;
    findPreviewNode(app.rootGraph ?? app.graph, data.node_id)?._capModelPreview?.update(data);
});

app.registerExtension({
    name: "Capricorncd.ModelPreviewOverride",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CAP_ModelPreviewOverride") return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const player = createPreviewPlayer();
            this._capModelPreview = player;
            bindCanvasWheelPassthrough(player.root);
            const widget = this.addDOMWidget("cap_preview", "preview", player.root, {
                canvasOnly: true, hideOnZoom: false, margin: 10,
                getMinHeight: () => 244, getHeight: () => 244,
            });
            widget.serialize = false;
            widget.computeLayoutSize = () => ({minHeight: 244, maxHeight: 244, minWidth: 280});
            this.setSize([Math.max(300, this.size[0]), Math.max(this.size[1], this.computeSize()[1])]);
            const removed = this.onRemoved;
            this.onRemoved = function () {
                player.dispose();
                this._capModelPreview = null;
                removed?.apply(this, arguments);
            };
        };
    },
});
