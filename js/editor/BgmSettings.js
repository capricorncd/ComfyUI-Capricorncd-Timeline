import { api } from "../../../scripts/api.js";
import { t as T } from "../i18n/timeline_editor.js";

export class BgmSettings {
    constructor(root) {
        this.root = root;
        this.workflow = null;
        this.loaded = false;
        root.innerHTML = `
          <div class="cat-te-agent-heading">BGM</div>
          <div class="cat-te-agent-note">${T("bgm_config_note")}</div>
          <div class="cat-te-agent-form">
            <label><span>${T("bgm_connection")}</span><select data-bgm="connection"><option value="comfyui">ComfyUI API</option><option value="standalone">${T("bgm_standalone")}</option></select></label>
            <label><span>${T("bgm_url")}</span><input data-bgm="url" type="url" placeholder="http://127.0.0.1:8188" /></label>
            <label><span>${T("model_label")}</span><input data-bgm="model" type="text" placeholder="ACE / MiniMaxH3 Music" /></label>
            <label><span>API Key</span><input data-bgm="api_key" type="password" autocomplete="new-password" /></label>
            <label class="cat-te-agent-enabled"><input data-bgm="clear_key" type="checkbox" /><span>${T("bgm_clear_key")}</span></label>
            <div data-bgm="workflow-row">
              <button type="button" class="cat-te-btn" data-bgm="import">${T("bgm_import")}</button>
              <button type="button" class="cat-te-btn" data-bgm="clear">${T("clear_btn")}</button>
              <div data-bgm="workflow-name" class="cat-te-agent-note"></div>
              <input data-bgm="file" type="file" accept=".json,application/json" hidden />
            </div>
            <div class="cat-te-agent-form-actions"><button type="button" class="cat-te-btn cat-te-btn-primary" data-bgm="save" disabled>${T("save_btn")}</button></div>
          </div>
          <div data-bgm="status" class="cat-te-agent-note" role="status"></div>`;
        this.field = key => root.querySelector(`[data-bgm="${key}"]`);
        this.field("connection").addEventListener("change", () => this.updateWorkflow());
        this.field("import").addEventListener("click", () => { this.field("file").value = ""; this.field("file").click(); });
        this.field("clear").addEventListener("click", () => { this.workflow = null; this.updateWorkflow(); });
        this.field("file").addEventListener("change", async () => {
            const file = this.field("file").files[0];
            if (!file) return;
            try {
                const workflow = JSON.parse(await file.text());
                if (!workflow || Array.isArray(workflow) || !Object.keys(workflow).length ||
                    !Object.values(workflow).every(n => n && typeof n.class_type === "string" && n.inputs && !Array.isArray(n.inputs))) {
                    throw new Error(T("bgm_api_workflow_only"));
                }
                this.workflow = workflow;
                this.updateWorkflow();
                this.field("status").textContent = T("bgm_unsaved");
            } catch (error) { this.field("status").textContent = error.message; }
        });
        this.field("save").addEventListener("click", () => void this.save());
    }

    updateWorkflow() {
        this.field("workflow-row").hidden = this.field("connection").value !== "comfyui";
        this.field("workflow-name").textContent = this.workflow ? T("bgm_workflow_loaded", { n: Object.keys(this.workflow).length }) : T("bgm_workflow_empty");
    }

    fill(config) {
        for (const key of ["connection", "url", "model"]) this.field(key).value = config[key] || "";
        this.field("api_key").value = "";
        this.field("api_key").placeholder = config.has_key ? T("leave_blank_keep_key") : T("bgm_optional_key");
        this.field("clear_key").checked = false;
        this.workflow = config.workflow || null;
        this.updateWorkflow();
    }

    async load() {
        if (this.loaded) return;
        try {
            const res = await api.fetchApi("/audio_keyframe_timeline/bgm_settings");
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            this.fill((await res.json()).config);
            this.loaded = true;
            this.field("save").disabled = false;
        } catch (error) { this.field("status").textContent = error.message; }
    }

    async save() {
        this.field("save").disabled = true;
        try {
            const payload = Object.fromEntries(["connection", "url", "model", "api_key"].map(key => [key, this.field(key).value.trim()]));
            payload.clear_key = this.field("clear_key").checked;
            payload.workflow = payload.connection === "comfyui" ? this.workflow : null;
            const res = await api.fetchApi("/audio_keyframe_timeline/bgm_settings", {
                method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
            this.fill(data.config);
            this.field("status").textContent = T("bgm_saved");
        } catch (error) { this.field("status").textContent = error.message; }
        finally { this.field("save").disabled = false; }
    }
}
