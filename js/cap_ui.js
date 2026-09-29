import "./components/Button.js";
import "./components/Dialog.js";
import { makeT } from "./cap_i18n.js";

const dialogT = makeT({
    zh: {confirm: "确认", notice: "提示", ok: "确定", cancel: "取消"},
    en: {confirm: "Confirm", notice: "Notice", ok: "OK", cancel: "Cancel"},
    ja: {confirm: "確認", notice: "お知らせ", ok: "OK", cancel: "キャンセル"},
});

/** Shared UI helpers: stylesheet loading, buttons. */

export const EXT_PREFIX = "ComfyUI-Capricorncd-Timeline";

const _loaded = new Set();

/**
 * @param {string} filename  CSS file under the extension js/ folder.
 * @param {string} [id]  Optional link element id.
 */
export function loadExtensionCss(filename, id) {
    const linkId = id || `cap-css-${filename.replace(/\W/g, "-")}`;
    const href = `/extensions/${EXT_PREFIX}/${filename}?v=20260910-jade-theme`;
    const existing = document.getElementById(linkId);
    if (existing) {
        if (existing.getAttribute("href") !== href) existing.setAttribute("href", href);
        _loaded.add(linkId);
        return;
    }
    if (_loaded.has(linkId)) return;
    const link = document.createElement("link");
    link.id = linkId;
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
    _loaded.add(linkId);
}

export function ensureCapUiCss() {
    loadExtensionCss("cap_ui.css", "cap-ui-styles");
}

/**
 * @param {string} label
 * @param {{ variant?: "" | "primary" | "danger", title?: string, onClick?: () => void }} [opts]
 */
export function mkUiBtn(label, { variant = "", title = "", onClick, needTarget = false } = {}) {
    const b = document.createElement("cap-button");
    b.textContent = label;
    b.setAttribute("variant", variant);
    if (title) b.title = title;
    if (needTarget) b.dataset.capNeedTarget = "1";
    if (onClick) b.addEventListener("click", onClick);
    return b;
}

/**
 * @param {string} icon  SVG markup
 * @param {{ variant?: "" | "primary" | "danger", title?: string, onClick?: () => void, needTarget?: boolean }} [opts]
 */
export function mkUiIconBtn(icon, { variant = "", title = "", onClick, needTarget = false } = {}) {
    const b = document.createElement("cap-button");
    b.innerHTML = icon;
    b.setAttribute("variant", variant);
    b.setAttribute("shape", "square");
    if (title) b.title = title;
    if (needTarget) b.dataset.capNeedTarget = "1";
    if (onClick) b.addEventListener("click", onClick);
    return b;
}

export function showCapConfirm(message, { title = dialogT("confirm"), confirmLabel = dialogT("ok"), cancelLabel = dialogT("cancel"), alternateLabel = null } = {}) {
    return new Promise(resolve => {
        const dialog = document.createElement("cap-dialog");
        dialog.width = 420;
        dialog.height = "fit-content";
        dialog.minWidth = 280;
        dialog.minHeight = 160;
        dialog.setAttribute("close-label", dialogT("cancel"));
        const heading = document.createElement("span");
        heading.slot = "title";
        heading.textContent = title;
        const body = document.createElement("div");
        body.style.cssText = "padding:18px 20px;white-space:pre-wrap;overflow-wrap:anywhere";
        body.textContent = String(message ?? "");
        const footer = document.createElement("div");
        footer.slot = "footer";
        footer.setAttribute("data-dialog-actions", "");
        let result = false;
        const finish = value => { result = value; dialog.close(); };
        if (cancelLabel !== null) footer.append(mkUiBtn(cancelLabel, {onClick: () => finish(false)}));
        if (alternateLabel) footer.append(mkUiBtn(alternateLabel, {onClick: () => finish("alternate")}));
        footer.append(mkUiBtn(confirmLabel, {variant: "primary", onClick: () => finish(true)}));
        dialog.append(heading, body, footer);
        dialog.addEventListener("close", () => { dialog.remove(); resolve(result); }, {once: true});
        document.body.append(dialog);
        dialog.showModal();
    });
}

export function showCapAlert(message) {
    return showCapConfirm(message, {title: dialogT("notice"), cancelLabel: null});
}
