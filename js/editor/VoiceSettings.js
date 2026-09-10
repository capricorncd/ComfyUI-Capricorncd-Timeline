import { api } from "../../../scripts/api.js";
import { t as T } from "../i18n/timeline_editor.js";

export class VoiceSettings {
    constructor(root, { endpoint = "/audio_keyframe_timeline/voice_settings", title = T("voice_service"), note = T("voice_config_note") } = {}) {
        this.root = root;
        this.endpoint = endpoint;
        root.innerHTML = `
          <div class="cat-te-agent-heading">${title}</div>
          <div class="cat-te-agent-note">${note}</div>
          <div class="cat-te-agent-form">
            <label><span>${T("voice_endpoint")}</span><input data-voice="url" type="url" placeholder="http://127.0.0.1:PORT/voice/convert" /></label>
            <label><span>${T("model_label")}</span><input data-voice="model" type="text" /></label>
            <label><span>API Key</span><input data-voice="api_key" type="password" autocomplete="new-password" /></label>
            <label class="cat-te-agent-enabled"><input data-voice="clear_key" type="checkbox" /><span>${T("bgm_clear_key")}</span></label>
            <label><span>${T("voice_timeout")}</span><input data-voice="timeout_seconds" type="number" min="10" max="1800" step="1" value="300" /></label>
            <button data-voice="save" type="button" class="cat-te-btn cat-te-btn-primary" disabled>${T("save_btn")}</button>
          </div>
          <details><summary>${T("voice_contract")}</summary><pre class="cat-te-voice-contract"></pre></details>
          <div data-voice="status" role="status" class="cat-te-agent-note"></div>`;
        this.field = key => root.querySelector(`[data-voice="${key}"]`);
        this.field("save").addEventListener("click", () => void this.save());
    }

    fill(config) {
        for (const key of ["url", "model", "timeout_seconds"]) this.field(key).value = config[key] ?? "";
        this.field("api_key").value = "";
        this.field("api_key").placeholder = config.has_key ? T("leave_blank_keep_key") : T("bgm_optional_key");
        this.field("clear_key").checked = false;
        this.root.querySelector("pre").textContent = JSON.stringify(config.contract, null, 2);
    }

    async load() {
        if (this.loaded) return;
        try {
            const response = await api.fetchApi(this.endpoint);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            this.fill((await response.json()).config);
            this.loaded = true;
            this.field("save").disabled = false;
        } catch (error) { this.field("status").textContent = error.message; }
    }

    async save() {
        this.field("save").disabled = true;
        try {
            const payload = Object.fromEntries(["url", "model", "api_key"].map(key => [key, this.field(key).value.trim()]));
            payload.timeout_seconds = Number(this.field("timeout_seconds").value);
            payload.clear_key = this.field("clear_key").checked;
            const response = await api.fetchApi(this.endpoint, {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.fill(data.config);
            this.field("status").textContent = T("bgm_saved");
        } catch (error) { this.field("status").textContent = error.message; }
        finally { this.field("save").disabled = false; }
    }
}
