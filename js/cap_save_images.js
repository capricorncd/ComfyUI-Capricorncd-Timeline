import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { loadExtensionCss } from "./cap_ui.js";
import { t } from "./i18n/seq_to_video.js";
import "./components/Button.js";
import "./components/StatusMessage.js";

function showSavedImages(node, images) {
    if (!node._capSavedImages) {
        loadExtensionCss("cap_save_images.css");
        const root = document.createElement("div");
        root.className = "cap-saved-images";
        const widget = node.addDOMWidget("cap_saved_images", "saved_images", root, {
            canvasOnly: true,
            hideOnZoom: false,
            margin: 10,
            getMinHeight: () => 220,
            getHeight: () => 260,
        });
        widget.serialize = false;
        widget.computeLayoutSize = () => ({ minHeight: 220, maxHeight: Infinity, minWidth: 280 });
        node._capSavedImages = root;
        node.setSize([Math.max(node.size[0], 300), Math.max(node.size[1], node.computeSize()[1])]);
    }
    const root = node._capSavedImages;
    root.replaceChildren();
    for (const info of images) {
        const url = `/cap/saved_images/${encodeURIComponent(info.token)}/${info.index}`;
        const card = document.createElement("div");
        card.className = "cap-saved-image";
        const image = document.createElement("img");
        image.src = api.apiURL(url);
        image.alt = info.filename;
        image.title = info.filename;
        image.loading = "lazy";
        const status = document.createElement("cap-status-message");
        status.hidden = true;
        const button = document.createElement("cap-button");
        button.className = "cap-saved-image-folder";
        button.setAttribute("size", "small");
        button.setAttribute("variant", "primary");
        button.textContent = t("open_folder");
        button.title = info.filename;
        button.addEventListener("pointerdown", event => event.stopPropagation());
        button.addEventListener("click", async event => {
            event.preventDefault();
            event.stopPropagation();
            if (button.disabled) return;
            button.disabled = true;
            status.setStatus("");
            try {
                const response = await api.fetchApi(`${url}/reveal`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: "{}",
                });
                if (!response.ok) throw new Error(await response.text() || response.statusText);
            } catch (error) {
                status.setStatus(`${t("open_folder_failed")} ${error.message}`, "error");
            } finally {
                button.disabled = false;
            }
        });
        card.append(image, button, status);
        root.appendChild(card);
    }
    node.graph?.setDirtyCanvas(true, true);
}

app.registerExtension({
    name: "Capricorncd.SaveImages",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CAP_SaveImages") return;
        const executed = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (message) {
            executed?.apply(this, arguments);
            if (message.cap_saved_images) showSavedImages(this, message.cap_saved_images);
        };
    },
});
