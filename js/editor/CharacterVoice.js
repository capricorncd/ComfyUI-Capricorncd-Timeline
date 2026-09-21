import "../components/Button.js";
import "../components/Dialog.js";
import "../components/TabButton.js";
import { t as T } from "../i18n/timeline_editor.js";

export class CharacterVoice {
    constructor(app, host) {
        this.app = app;
        this.host = host;
        host.innerHTML = `
          <span>${T("voice_reference")}</span>
          <select aria-label="${T("voice_reference")}"></select>
          <div class="cat-te-model-preview-config-actions">
            <cap-button  class="" data-voice-action="import">${T("voice_import")}</cap-button>
            <cap-button  class="" data-voice-action="unbind">${T("voice_unbind")}</cap-button>
          </div>
          <audio controls preload="none" hidden></audio>
          <label>${T("local_voice_language")}<select data-voice-language>
            <option value="">${T("not_set_option")}</option>
            ${['Auto','Chinese','English','Japanese','Korean','German','French','Russian','Portuguese','Spanish','Italian'].map(language => `<option>${language}</option>`).join('')}
          </select></label>
          <div class="cat-te-agent-note" role="status"></div>
          <input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" hidden />`;
        this.select = host.querySelector("select");
        this.language = host.querySelector('[data-voice-language]');
        this.language.addEventListener("change", () => {
            const row = this.current();
            if (!row || (row.voice_language || "") === this.language.value) return;
            this.app._recordUndo();
            if (this.language.value) row.voice_language = this.language.value;
            else delete row.voice_language;
            this.app._saveToWidgets();
        });
        this.audio = host.querySelector("audio");
        this.status = host.querySelector('[role="status"]');
        const button = action => host.querySelector(`[data-voice-action="${action}"]`);
        this.select.addEventListener("change", () => {
            const row = this.current();
            const file = this.select.value;
            if (!row || !file) return;
            this.app._recordUndo();
            const audio = this.app._ensureMedia("audio", file);
            row.voice_audio_id = audio.id;
            this.app._saveToWidgets();
            this.refresh();
        });
        button("unbind").addEventListener("click", () => {
            const row = this.current();
            if (!row?.voice_audio_id) return;
            this.app._recordUndo();
            delete row.voice_audio_id;
            this.app._saveToWidgets();
            this.refresh();
        });
        const input = host.querySelector('input[type="file"]');
        button("import").addEventListener("click", () => { input.value = ""; input.click(); });
        input.addEventListener("change", async () => {
            const file = input.files[0];
            const row = this.current();
            if (!file || !row) return;
            this.status.textContent = T("loading_ellipsis");
            button("import").disabled = true;
            try {
                const uploaded = await this.app._uploadImportBlob("audio", file.name, file);
                // Never bind to a different project/character after an asynchronous upload.
                if (this.app._findMediaById(row.id) !== row) return;
                this.app._recordUndo();
                const audio = this.app._ensureMedia("audio", uploaded.file);
                if (!audio) throw new Error(T("voice_import_failed"));
                row.voice_audio_id = audio.id;
                this.app._saveToWidgets();
                if (this.current() === row) this.refresh();
            } catch (error) { if (this.current() === row) this.status.textContent = error.message; }
            finally { button("import").disabled = false; }
        });
        this.audio.addEventListener("error", () => { this.status.textContent = T("voice_audio_failed"); });
    }

    openForAudioClip(clip) {
        if (!clip.src) return;
        const app = this.app;
        const resources = app._projectResources;
        const timeline = app._timeline;
        const file = clip.src;
        const duration = Number(clip.duration);
        if (!Number.isFinite(duration) || duration <= 0) return;
        const source = { file, location: "input", trim_in_sec: Math.max(0, Number(clip.sourceOffset) || 0),
            duration_sec: duration, playback_rate: Number(clip.playbackRate) || 1 };
        const candidates = resources.filter(row => row.kind === "image" || row.kind === "video");
        const types = ["character", "prop", "scene", "other"];
        const dialog = document.createElement("cap-dialog");
        dialog.className = "cat-te-bind-character-dialog";
        dialog.setAttribute("close-label", T("close_title"));
        dialog.innerHTML = `<span slot="title">${T("audio_bind_character")}</span>
          <div class="cat-te-bind-character-body">
            <div class="cat-te-bind-character-tabs" role="tablist">${types.map(type => `<cap-tab-button data-type="${type}" id="voice-bind-tab-${type}" aria-controls="voice-bind-panel">${T(`asset_type_${type}`)}</cap-tab-button>`).join("")}</div>
            <div id="voice-bind-panel" role="tabpanel"><select></select><div class="cat-te-bind-character-preview" hidden></div></div>
            <p role="status" hidden></p>
          </div>
          <div slot="footer" class="cat-te-confirm-actions"><cap-button data-action="close">${T("cancel_btn")}</cap-button>
          <cap-button data-action="bind" variant="primary">${T("audio_bind_character")}</cap-button></div>`;
        const select = dialog.querySelector("select");
        const preview = dialog.querySelector(".cat-te-bind-character-preview");
        const updatePreview = () => {
            preview.replaceChildren();
            const row = candidates.find(item => item.id === select.value);
            preview.hidden = !row;
            if (!row) return;
            const image = document.createElement("img");
            image.alt = row.name || row.file;
            image.draggable = false;
            preview.append(image);
            if (row.kind === "image") image.src = app._imgUrl(row.file);
            else app._getVideoThumbnail(row.file).then(url => {
                if (url) image.src = url;
            });
        };
        select.addEventListener("change", updatePreview);
        const bind = dialog.querySelector('[data-action="bind"]');
        const tabs = types.map(type => dialog.querySelector(`[data-type="${type}"]`));
        const selectType = type => {
            tabs.forEach((tab, index) => {
                tab.setAttribute("aria-selected", String(types[index] === type));
                tab.setAttribute("tabindex", types[index] === type ? "0" : "-1");
            });
            dialog.querySelector('[role="tabpanel"]').setAttribute("aria-labelledby", `voice-bind-tab-${type}`);
            select.setAttribute("aria-label", T(`asset_type_${type}`));
            select.replaceChildren();
            const matches = candidates.filter(row => {
                const category = app._getMediaMeta(row.kind, row.file).mediaType;
                return (types.includes(category) ? category : "other") === type;
            });
            for (const row of matches) {
                const option = document.createElement("option");
                option.value = row.id;
                option.textContent = row.name || row.file;
                select.append(option);
            }
            select.value = matches[0]?.id || "";
            select.disabled = bind.disabled = !matches.length;
            const status = dialog.querySelector('[role="status"]');
            status.hidden = !!matches.length;
            status.textContent = matches.length ? "" : T("audio_bind_empty_category");
            updatePreview();
        };
        tabs.forEach((tab, index) => {
            tab.addEventListener("click", () => selectType(types[index]));
            tab.addEventListener("keydown", event => {
                const next = event.key === "ArrowRight" ? (index + 1) % types.length : event.key === "ArrowLeft" ? (index + types.length - 1) % types.length : event.key === "Home" ? 0 : event.key === "End" ? types.length - 1 : -1;
                if (next < 0) return;
                event.preventDefault();
                selectType(types[next]);
                tabs[next].focus();
            });
        });
        selectType("character");
        dialog.querySelector('[data-action="close"]').addEventListener("click", () => dialog.close());
        bind.addEventListener("click", async () => {
            const character = candidates.find(row => row.id === select.value);
            const valid = () => app._timeline === timeline && app._projectResources === resources
                && character && app._findMediaById(character.id) === character;
            if (!valid()) {
                dialog.close();
                return;
            }
            const status = dialog.querySelector('[role="status"]');
            const close = dialog.querySelector('[data-action="close"]');
            dialog.closeDisabled = close.disabled = bind.disabled = select.disabled = true;
            tabs.forEach(tab => { tab.disabled = true; });
            status.hidden = false;
            status.textContent = T("loading_ellipsis");
            try {
                const excerpt = await app._extractAudioFromMedia(file, { location: "input", durationSec: duration, mix: [source] });
                if (!valid()) { dialog.close(); return; }
                app._recordUndo();
                const audio = app._ensureMedia("audio", excerpt);
                character.voice_audio_id = audio.id;
                app._saveToWidgets();
                dialog.close();
                app._openMediaPreview(character.file, character.kind);
            } catch (error) {
                status.textContent = error.message;
            } finally {
                dialog.closeDisabled = close.disabled = bind.disabled = select.disabled = false;
                tabs.forEach(tab => { tab.disabled = false; });
            }
        });
        dialog.addEventListener("close", () => dialog.remove(), { once: true });
        app._overlay.append(dialog);
        timeline.pause();
        dialog.showModal();
    }

    current() {
        const item = this.app._mediaPreviewItem();
        return item && item.kind !== "audio" ? this.app._findMedia(item.kind, item.file) : null;
    }

    stop() {
        this.audio.pause();
        this.audio.removeAttribute("src");
        this.audio.load();
    }

    refresh() {
        this.stop();
        const item = this.app._mediaPreviewItem();
        this.host.hidden = !item || !["image", "video"].includes(item.kind);
        if (this.host.hidden) return;
        const row = this.app._ensureMedia(item.kind, item.file);
        const reference = this.app._findMediaById(row.voice_audio_id);
        const valid = reference?.kind === "audio";
        this.select.replaceChildren();
        const empty = document.createElement("option");
        empty.value = "";
        empty.disabled = true;
        empty.textContent = T("voice_choose_audio");
        this.select.append(empty);
        const files = new Set([...this.app._audioFiles, ...this.app._projectResources.filter(r => r.kind === "audio").map(r => r.file)]);
        for (const file of files) {
            const option = document.createElement("option");
            option.value = file;
            option.textContent = file;
            this.select.append(option);
        }
        this.select.value = valid ? reference.file : "";
        this.language.value = row.voice_language || "";
        this.host.querySelector('[data-voice-action="unbind"]').disabled = !row.voice_audio_id;
        this.audio.hidden = !valid;
        if (valid) this.audio.src = this.app._audioUrl(reference.file);
        this.status.textContent = row.voice_audio_id && !valid ? T("voice_reference_missing") : T("voice_binding_note");
    }
}
