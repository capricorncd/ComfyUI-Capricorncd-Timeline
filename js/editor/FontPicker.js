import { t as T } from "../i18n/timeline_editor.js";

export class FontPicker {
    constructor(beforeOpen) {
        this._beforeOpen = beforeOpen;
        this._menu = null;
        this._onKey = null;
    }

    close() {
        if (!this._menu) return false;
        window.removeEventListener("keydown", this._onKey, true);
        this._menu.remove();
        this._menu = null;
        this._onKey = null;
        return true;
    }

    _cssFontFamily(family) {
        const fam = String(family || "").trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
        return fam ? `"${fam}", sans-serif` : "sans-serif";
    }

    sync(select) {
        if (!select) return;
        select.style.fontFamily = this._cssFontFamily(select.value);
    }

    bind(select) {
        if (!select || select.dataset.fontPreviewBound) return;
        select.dataset.fontPreviewBound = "1";
        select.classList.add("cat-te-font-select");
        select.addEventListener("mousedown", (e) => {
            if (select.disabled) return;
            e.preventDefault();
            e.stopPropagation();
            this.open(select);
        });
        select.addEventListener("keydown", (e) => {
            if (select.disabled) return;
            if (this._menu) return;
            if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown" || e.key === "ArrowUp") {
                e.preventDefault();
                this.open(select, { startDelta: e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0 });
            }
        });
    }

    open(select, { startDelta = 0 } = {}) {
        if (!select) return;
        this._beforeOpen();
        this.close();
        const fonts = [...select.options]
            .map((o) => ({
                family: o.value,
                label: o.textContent || o.value,
            }));
        if (!fonts.length) return;

        const prevFamily = String(select.value || "");
        let activeIndex = Math.max(0, fonts.findIndex((f) => f.family === prevFamily));
        if (startDelta) {
            activeIndex = Math.max(0, Math.min(fonts.length - 1, activeIndex + startDelta));
        }

        const menu = document.createElement("div");
        menu.className = "cat-te-font-picker";
        menu.tabIndex = -1;
        const r = select.getBoundingClientRect();
        menu.style.left = `${r.left}px`;
        menu.style.top = `${r.bottom + 2}px`;
        menu.style.minWidth = `${Math.max(r.width, 200)}px`;

        const items = [];
        const applyFontAt = (index, { commit = false } = {}) => {
            activeIndex = Math.max(0, Math.min(fonts.length - 1, index));
            items.forEach((row, i) => row.classList.toggle("is-active", i === activeIndex));
            const row = items[activeIndex];
            row?.scrollIntoView({ block: "nearest" });
            const f = fonts[activeIndex];
            if (!f) return;
            select.value = f.family;
            this.sync(select);
            // Subtitle panel listens to `input`; watermark listens to `change`.
            select.dispatchEvent(new Event("input", { bubbles: true }));
            select.dispatchEvent(new Event("change", { bubbles: true }));
            if (commit) this.close();
        };

        fonts.forEach((f, index) => {
            const row = document.createElement("button");
            row.type = "button";
            row.className = "cat-te-font-picker-item";
            if (index === activeIndex) row.classList.add("is-active");
            row.style.fontFamily = this._cssFontFamily(f.family);
            row.textContent = f.label;
            row.title = f.family;
            row.addEventListener("mouseenter", () => applyFontAt(index));
            row.addEventListener("click", (e) => {
                e.stopPropagation();
                applyFontAt(index, { commit: true });
            });
            menu.appendChild(row);
            items.push(row);
        });

        const onKey = (e) => {
            if (!menu.isConnected) return;
            if (e.key === "ArrowDown") {
                e.preventDefault();
                e.stopPropagation();
                applyFontAt(activeIndex + 1);
            } else if (e.key === "ArrowUp") {
                e.preventDefault();
                e.stopPropagation();
                applyFontAt(activeIndex - 1);
            } else if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                applyFontAt(activeIndex, { commit: true });
            } else if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                select.value = prevFamily;
                this.sync(select);
                select.dispatchEvent(new Event("input", { bubbles: true }));
                select.dispatchEvent(new Event("change", { bubbles: true }));
                this.close();
            } else if (e.key === "Home") {
                e.preventDefault();
                applyFontAt(0);
            } else if (e.key === "End") {
                e.preventDefault();
                applyFontAt(fonts.length - 1);
            }
        };
        this._menu = menu;
        this._onKey = onKey;
        window.addEventListener("keydown", onKey, true);

        (select.closest(".cat-te-overlay") || document.body).appendChild(menu);
        const mr = menu.getBoundingClientRect();
        if (mr.right > window.innerWidth) {
            menu.style.left = `${Math.max(8, window.innerWidth - mr.width - 8)}px`;
        }
        if (mr.bottom > window.innerHeight) {
            menu.style.top = `${Math.max(8, r.top - mr.height - 2)}px`;
        }
        applyFontAt(activeIndex);
        try { menu.focus({ preventScroll: true }); } catch { /* ignore */ }
    }

    fill(select, fonts, preferred) {
        if (!select) return;
        const prev = String(preferred || "").trim();
        select.innerHTML = "";
        const system = document.createElement("option");
        system.value = "";
        system.dataset.path = "";
        system.textContent = T("system_font");
        select.appendChild(system);
        for (const f of fonts) {
            const opt = document.createElement("option");
            opt.value = f.family;
            opt.dataset.path = f.path || "";
            opt.textContent = f.family;
            opt.style.fontFamily = this._cssFontFamily(f.family);
            select.appendChild(opt);
        }
        if (prev && fonts.some((f) => f.family === prev)) {
            select.value = prev;
        } else if (prev) {
            const opt = document.createElement("option");
            opt.value = prev;
            opt.textContent = prev;
            opt.style.fontFamily = this._cssFontFamily(prev);
            select.appendChild(opt);
            select.value = prev;
        } else {
            select.value = "";
        }
        this.sync(select);
        this.bind(select);
    }
}
