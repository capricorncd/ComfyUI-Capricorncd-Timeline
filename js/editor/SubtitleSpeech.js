import { api } from "../../../scripts/api.js";
import { t as T } from "../i18n/timeline_editor.js";
import "../components/Dialog.js";

export function subtitleTiming(clip) {
    const start_ms = Math.round(clip.startTime * 1000);
    const end_ms = Math.round((clip.startTime + clip.duration) * 1000);
    return { start_ms, end_ms, duration_ms: end_ms - start_ms };
}

export class SubtitleSpeech {
    constructor(app, host) {
        this.app = app;
        this.dialog = document.createElement("cap-dialog");
        this.dialog.className = "cat-te-speech-dialog";
        this.dialog.setAttribute("close-label", T("close_title"));
        host.append(this.dialog);
        this.dialog.addEventListener("cancel", e => { if (this.busy) e.preventDefault(); });
        this.dialog.addEventListener("close", () => this.stopAudio());
    }

    stopAudio() { this.dialog.querySelectorAll("audio").forEach(audio => audio.pause()); }

    open(clips, bindOnly = false) {
        if (this.busy || !clips.length) return;
        const app = this.app;
        const timeline = app._timeline;
        const resources = app._projectResources;
        const valid = () => app._timeline === timeline && app._projectResources === resources && this.dialog.open && app._isNodeOnLiveGraph();
        app._timeline.pause();
        this.dialog.setAttribute("aria-label", T(bindOnly ? "speech_bind" : "speech_convert"));
        this.dialog.innerHTML = `<span slot="title">${T(bindOnly ? "speech_bind" : "speech_convert")}</span><div class="cat-te-modal-body"><div class="speech-rows"></div><p role="status"></p></div><div slot="footer" class="cat-te-confirm-actions"><cap-button data-action="settings">${T("voice_configure")}</cap-button><cap-button data-action="close">${T("close_title")}</cap-button><cap-button variant="primary" data-action="submit">${T(bindOnly ? "save_btn" : "speech_convert")}</cap-button></div>`;
        const candidates = resources.filter(row => row.kind === "image" || row.kind === "video");
        const rows = clips.map(clip => {
            const meta = app._meta.get(clip.id);
            const text = meta?.text || "";
            const timing = subtitleTiming(clip);
            const row = document.createElement("fieldset");
            row.innerHTML = `<legend></legend><p></p><select style="width:100%" aria-label="${T("voice_character")}"></select><div class="speech-reference"></div><audio controls preload="none" style="width:100%"></audio><label>${T("speech_prompt")}<textarea rows="2" style="width:100%"></textarea></label>`;
            row.querySelector("legend").textContent = `${clip.id} · ${timing.start_ms / 1000}s → ${timing.end_ms / 1000}s`;
            row.querySelector("p").textContent = text;
            const select = row.querySelector("select");
            select.add(new Option(T("voice_character"), ""));
            candidates.forEach(character => select.add(new Option(character.name || character.file || character.id, character.id)));
            select.value = meta?.characterMediaId || "";
            const audio = row.querySelector("audio");
            const prompt = row.querySelector("textarea");
            prompt.value = meta?.speechPrompt || "";
            const refresh = () => {
                audio.pause();
                const character = app._findMediaById(select.value);
                const reference = app._findMediaById(character?.voice_audio_id);
                row.querySelector(".speech-reference").textContent = `${T("voice_reference")}: ${reference?.file || "—"}`;
                audio.removeAttribute("src");
                if (reference?.kind === "audio") audio.src = app._audioUrl(reference.file);
                audio.hidden = reference?.kind !== "audio";
                audio.load();
            };
            select.addEventListener("change", refresh);
            refresh();
            this.dialog.querySelector(".speech-rows").append(row);
            return { clip, meta, text, timing, select, prompt };
        });
        const status = this.dialog.querySelector('[role="status"]');
        status.textContent = T("speech_note");
        this.dialog.querySelector('[data-action="close"]').onclick = () => { if (!this.busy) this.dialog.close(); };
        this.dialog.querySelector('[data-action="settings"]').onclick = () => {
            if (this.busy) return;
            this.dialog.close(); app._openSettings(); app._setSettingsCategory("speech");
        };
        this.dialog.querySelector('[data-action="submit"]').onclick = async () => {
            if (this.busy) return;
            const unchanged = row => valid() && app._meta.get(row.clip.id) === row.meta && !row.clip.track.locked
                && row.meta.text === row.text && JSON.stringify(subtitleTiming(row.clip)) === JSON.stringify(row.timing);
            this.busy = true;
            this.dialog.closeDisabled = true;
            this.stopAudio();
            this.dialog.querySelectorAll("cap-button, select, textarea").forEach(el => el.disabled = true);
            let completed = 0;
            try {
                const requests = rows.map(row => {
                    if (!unchanged(row)) throw new Error(T("speech_changed"));
                    const character = app._findMediaById(row.select.value);
                    const reference = app._findMediaById(character?.voice_audio_id);
                    if (!bindOnly && (!row.text.trim() || row.meta.disabled || reference?.kind !== "audio")) throw new Error(T("speech_missing"));
                    return { row, character, reference, payload: {
                        subtitle_id: row.clip.id, character_media_id: row.select.value,
                        reference_file: reference?.file, text: row.text,
                        prompt: row.prompt.value.split(/\r?\n/).filter(line => !/^\s*#/.test(line)).join("\n"), ...row.timing,
                    } };
                });
                app._recordUndo();
                rows.forEach(row => { row.meta.characterMediaId = row.select.value; row.meta.speechPrompt = row.prompt.value; });
                app._saveToWidgets();
                if (bindOnly) { this.dialog.close(); return; }
                for (const { row, character, reference, payload } of requests) {
                    const canInsert = () => unchanged(row) && app._findMediaById(character.id) === character
                        && character.voice_audio_id === reference.id && app._findMediaById(reference.id) === reference;
                    if (!canInsert()) throw new Error(T("speech_changed"));
                    status.textContent = `${completed + 1} / ${rows.length} …`;
                    const response = await api.fetchApi("/audio_keyframe_timeline/subtitle_speech", {
                        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
                    });
                    const result = await response.json();
                    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
                    if (!canInsert()) throw new Error(`${T("speech_changed")} ${result.file}`);
                    await app._addAudioAtTime(result.file, payload.start_ms / 1000, null, { canInsert, duration: result.duration_seconds });
                    if (!canInsert()) throw new Error(`${T("speech_changed")} ${result.file}`);
                    completed++;
                }
                status.textContent = `${T("speech_done")} ${completed} / ${rows.length}`;
            } catch (error) { status.textContent = `${completed} / ${rows.length}: ${error.message}`; }
            finally {
                this.busy = false;
                this.dialog.closeDisabled = false;
                this.dialog.querySelectorAll("cap-button, select, textarea").forEach(el => el.disabled = false);
            }
        };
        this.dialog.showModal();
    }
}
