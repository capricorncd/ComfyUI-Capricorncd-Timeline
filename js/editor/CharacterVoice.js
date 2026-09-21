import "../components/Button.js";
import "../components/Dialog.js";
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
        const candidates = resources.filter(row => row.kind === "image" || row.kind === "video");
        const dialog = document.createElement("cap-dialog");
        dialog.className = "cat-te-bind-character-dialog";
        dialog.setAttribute("close-label", T("close_title"));
        dialog.innerHTML = `<span slot="title">${T("audio_bind_character")}</span>
          <div class="cat-te-bind-character-body">
            <label>${T("voice_character")}<select></select></label>
            <p role="status" hidden></p>
          </div>
          <div slot="footer" class="cat-te-confirm-actions"><cap-button data-action="close">${T("cancel_btn")}</cap-button>
          <cap-button data-action="bind" variant="primary">${T("audio_bind_character")}</cap-button></div>`;
        const select = dialog.querySelector("select");
        for (const character of candidates) {
            const option = document.createElement("option");
            option.value = character.id;
            option.textContent = character.name || character.file;
            select.append(option);
        }
        const bind = dialog.querySelector('[data-action="bind"]');
        bind.disabled = !candidates.length;
        if (!candidates.length) {
            const status = dialog.querySelector('[role="status"]');
            status.hidden = false;
            status.textContent = T("audio_bind_no_character");
        }
        dialog.querySelector('[data-action="close"]').addEventListener("click", () => dialog.close());
        bind.addEventListener("click", () => {
            const character = candidates.find(row => row.id === select.value);
            if (app._timeline !== timeline || app._projectResources !== resources
                || !character || app._findMediaById(character.id) !== character) {
                dialog.close();
                return;
            }
            app._recordUndo();
            const audio = app._ensureMedia("audio", file);
            character.voice_audio_id = audio.id;
            app._saveToWidgets();
            dialog.close();
            app._openMediaPreview(character.file, character.kind);
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
