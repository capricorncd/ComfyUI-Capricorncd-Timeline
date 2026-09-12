import "../components/Button.js";
import { t as T } from "../i18n/timeline_editor.js";

export class CharacterVoice {
    constructor(app, host) {
        this.app = app;
        this.host = host;
        host.innerHTML = `
          <span>${T("voice_reference")}</span>
          <select aria-label="${T("voice_reference")}"></select>
          <div class="cat-te-model-preview-config-actions">
            <cap-button  class="" data-voice-action="bind">${T("voice_bind")}</cap-button>
            <cap-button  class="" data-voice-action="import">${T("voice_import")}</cap-button>
            <cap-button  class="" data-voice-action="unbind">${T("voice_unbind")}</cap-button>
          </div>
          <audio controls preload="none" hidden></audio>
          <div class="cat-te-agent-note" role="status"></div>
          <input type="file" accept="audio/*,.wav,.mp3,.flac,.ogg,.m4a" hidden />`;
        this.select = host.querySelector("select");
        this.audio = host.querySelector("audio");
        this.status = host.querySelector('[role="status"]');
        const button = action => host.querySelector(`[data-voice-action="${action}"]`);
        button("bind").addEventListener("click", () => {
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
        this.host.querySelector('[data-voice-action="unbind"]').disabled = !row.voice_audio_id;
        this.audio.hidden = !valid;
        if (valid) this.audio.src = this.app._audioUrl(reference.file);
        this.status.textContent = row.voice_audio_id && !valid ? T("voice_reference_missing") : T("voice_binding_note");
    }
}
