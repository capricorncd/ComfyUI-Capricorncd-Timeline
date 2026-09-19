import "../components/Button.js";
import "../components/StatusMessage.js";
import { api } from "../../../scripts/api.js";
import { t as T } from "../i18n/timeline_editor.js";


export class AgentSettings {
    constructor(root, confirmDelete, { getSelectedModel, selectModel }) {
        this._confirmDelete = confirmDelete;
        this.promptDirectoryInput = root.querySelector(".cat-te-agent-prompt-directory-input");
        this.promptDirectoryStatus = root.querySelector(".cat-te-agent-prompt-directory-status");
        this.promptDirectorySaveBtn = root.querySelector(".cat-te-agent-prompt-directory-save");
        this.promptDirectorySaveBtn.addEventListener("click", () => void this._savePromptDirectory());
        root.querySelector(".cat-te-agent-prompt-directory-reset").addEventListener("click", () => {
            this.promptDirectoryInput.value = "";
            void this._savePromptDirectory();
        });
        this._getSelectedModel = getSelectedModel;
        this._selectModel = selectModel;
        this._localModels = null;
        this._localModelTests = new Map();
        this._localTestAbort = null;
        this.localModelList = root.querySelector(".cat-te-local-model-list");
        this.localModelScanBtn = root.querySelector(".cat-te-local-model-scan");
        this.localModelScanBtn.addEventListener("click", () => void this._loadLocalModels());
        this._agentConfigs = [];
        this._editingAgentId = "";
        this.agentList = root.querySelector(".cat-te-agent-list");
        this.agentForm = root.querySelector(".cat-te-agent-form");
        this.agentLabelInput = root.querySelector(".cat-te-agent-label");
        this.agentProviderSelect = root.querySelector(".cat-te-agent-provider");
        this.agentModelInput = root.querySelector(".cat-te-agent-model");
        this.agentKeyInput = root.querySelector(".cat-te-agent-key");
        this.agentEnabledCb = root.querySelector(".cat-te-agent-enabled input");
        this.agentDeleteBtn = root.querySelector(".cat-te-agent-delete");
        root.querySelector(".cat-te-agent-add")?.addEventListener("click", () => this.edit());
        root.querySelector(".cat-te-agent-cancel")?.addEventListener("click", () => this.cancel());
        root.querySelector(".cat-te-agent-save")?.addEventListener("click", () => void this.save());
        this.agentDeleteBtn?.addEventListener("click", () => void this.requestDelete());

    }

    async load() {
        if (!this.agentList) return;
        this._renderLocalModels();
        await Promise.all([this._loadAgents(), this._loadPromptDirectory()]);
    }

    async _loadPromptDirectory() {
        this.promptDirectoryStatus.setStatus("");
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/agent_prompt_settings"));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.promptDirectoryInput.value = data.directory;
            this.promptDirectoryInput.placeholder = data.default_directory;
        } catch (error) {
            this.promptDirectoryStatus.setStatus(T("load_failed", { msg: error.message }), "error");
        }
    }

    async _savePromptDirectory() {
        if (this.promptDirectorySaveBtn.disabled) return;
        this.promptDirectorySaveBtn.disabled = true;
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/agent_prompt_settings"), {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ directory: this.promptDirectoryInput.value.trim() }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.promptDirectoryInput.value = data.directory;
            this.promptDirectoryInput.placeholder = data.default_directory;
            this.promptDirectoryStatus.setStatus(T("agent_prompt_directory_saved"), "success");
        } catch (error) {
            this.promptDirectoryStatus.setStatus(T("save_agent_failed", { msg: error.message }), "error");
        } finally {
            this.promptDirectorySaveBtn.disabled = false;
        }
    }

    async _loadAgents() {
        this.agentList.textContent = T("loading_ellipsis");
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/agents"));
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this._agentConfigs = Array.isArray(data.agents) ? data.agents : [];
            this._render();
        } catch (error) {
            this.agentList.textContent = T("load_failed", { msg: error instanceof Error ? error.message : String(error) });
        }
    }

    async _loadLocalModels() {
        if (this.localModelScanBtn.disabled) return;
        this.localModelScanBtn.disabled = true;
        this.localModelList.textContent = T("loading_ellipsis");
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/vl_models?refresh=1"));
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this._localModels = Array.isArray(data.models) ? data.models : [];
            this._renderLocalModels();
        } catch (error) {
            this.localModelList.textContent = T("load_failed", { msg: error instanceof Error ? error.message : String(error) });
        } finally {
            this.localModelScanBtn.disabled = false;
        }
    }

    _renderLocalModels() {
        this.localModelList.replaceChildren();
        if (this._localModels === null) {
            this.localModelList.textContent = T("local_prompt_models_scan_hint");
            return;
        }
        if (!this._localModels.length) {
            this.localModelList.textContent = T("local_prompt_models_empty");
            return;
        }
        const selected = this._getSelectedModel();
        for (const name of this._localModels) {
            const row = document.createElement("div");
            row.className = "cat-te-agent-row";
            const text = document.createElement("div");
            text.className = "cat-te-agent-row-text";
            const title = document.createElement("strong");
            title.textContent = name;
            text.appendChild(title);
            const status = document.createElement("cap-status-message");
            const result = this._localModelTests.get(name);
            status.setStatus(result?.text || T("local_prompt_model_untested"), result?.state);
            text.appendChild(status);
            const test = document.createElement("cap-button");
            test.textContent = T("local_prompt_model_test");
            test.disabled = !!this._localTestAbort;
            test.addEventListener("click", () => void this._testLocalModel(name));
            const select = document.createElement("cap-button");
            const active = selected === `local:${name}` || selected === name;
            select.textContent = T(active ? "local_prompt_model_selected" : "select_btn");
            select.setAttribute("aria-pressed", String(active));
            select.addEventListener("click", async () => {
                await this._selectModel(name);
                this._renderLocalModels();
            });
            row.append(text, test, select);
            this.localModelList.appendChild(row);
        }
    }

    async _testLocalModel(name) {
        if (this._localTestAbort) return;
        const controller = new AbortController();
        this._localTestAbort = controller;
        this._localModelTests.set(name, { text: T("local_prompt_model_testing"), state: "info" });
        this._renderLocalModels();
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/optimize_clip_prompt"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: controller.signal,
                body: JSON.stringify({
                    model: name, files: [], keep_loaded: false, max_new_tokens: 64,
                    system_prompt: "Reply briefly.",
                    user_prompt: "Write one short sentence describing a sunny forest.",
                    output_language: "English",
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            if (!String(data.prompt || "").trim()) throw new Error(T("model_no_prompt_returned"));
            this._localModelTests.set(name, { text: T("local_prompt_model_passed"), state: "success" });
        } catch (error) {
            if (controller.signal.aborted) this._localModelTests.delete(name);
            else this._localModelTests.set(name, { text: T("load_failed", { msg: error instanceof Error ? error.message : String(error) }), state: "error" });
        } finally {
            this._localTestAbort = null;
            this._renderLocalModels();
        }
    }

    _render() {
        if (!this.agentList) return;
        this.agentList.replaceChildren();
        if (!this._agentConfigs?.length) {
            const empty = document.createElement("div");
            empty.className = "cat-te-agent-empty";
            empty.textContent = T("no_agents_yet");
            this.agentList.appendChild(empty);
            return;
        }
        for (const config of this._agentConfigs) {
            const row = document.createElement("div");
            row.className = "cat-te-agent-row";
            const text = document.createElement("div");
            text.className = "cat-te-agent-row-text";
            const title = document.createElement("strong");
            title.textContent = config.label || T("unnamed");
            const detail = document.createElement("span");
            detail.textContent = `${config.provider === "gemini" ? "Gemini" : "OpenAI"} · ${config.model}${config.enabled ? "" : T("agent_disabled_suffix")}`;
            text.append(title, detail);
            const edit = document.createElement("cap-button");
            edit.textContent = T("edit_btn");
            edit.addEventListener("click", () => this.edit(config));
            row.append(text, edit);
            this.agentList.appendChild(row);
        }
    }

    edit(config = null) {
        if (!this.agentForm) return;
        this._editingAgentId = config?.id || "";
        this.agentLabelInput.value = config?.label || "";
        this.agentProviderSelect.value = config?.provider || "openai";
        this.agentModelInput.value = config?.model || "";
        this.agentKeyInput.value = config?.has_key ? "****" : "";
        this.agentKeyInput.placeholder = config?.has_key ? T("leave_blank_keep_key") : T("enter_api_key");
        this.agentEnabledCb.checked = config?.enabled !== false;
        this.agentDeleteBtn.hidden = !config;
        this.agentForm.hidden = false;
        this.agentLabelInput.focus();
    }

    cancel() {
        this._localTestAbort?.abort();
        this._editingAgentId = "";
        if (this.agentForm) this.agentForm.hidden = true;
        if (this.agentKeyInput) this.agentKeyInput.value = "";
    }

    async save() {
        const payload = {
            id: this._editingAgentId || undefined,
            label: this.agentLabelInput?.value.trim() || "",
            provider: this.agentProviderSelect?.value || "openai",
            model: this.agentModelInput?.value.trim() || "",
            api_key: this.agentKeyInput?.value.trim() === "****" ? "" : (this.agentKeyInput?.value.trim() || ""),
            enabled: !!this.agentEnabledCb?.checked,
        };
        try {
            const response = await fetch(api.apiURL("/audio_keyframe_timeline/agents"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            this.cancel();
            await this.load();
        } catch (error) {
            alert(T("save_agent_failed", { msg: error instanceof Error ? error.message : String(error) }));
        }
    }

    async requestDelete() {
        const agentId = this._editingAgentId;
        if (!agentId) return;
        this._confirmDelete(T("confirm_delete_agent"), () => this._delete(agentId));
    }

    async _delete(agentId) {
        try {
            const response = await fetch(api.apiURL(`/audio_keyframe_timeline/agents/${encodeURIComponent(agentId)}`), { method: "DELETE" });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
            if (this._editingAgentId === agentId) this.cancel();
            await this.load();
        } catch (error) {
            alert(T("delete_agent_failed", { msg: error instanceof Error ? error.message : String(error) }));
        }
    }

}
