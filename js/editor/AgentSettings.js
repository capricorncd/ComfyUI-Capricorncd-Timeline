import "../components/Button.js";
import { api } from "../../../scripts/api.js";
import { t as T } from "../i18n/timeline_editor.js";

const AGENT_DEFAULT_MODELS = { openai: "gpt-5.4", gemini: "gemini-3.7-flash" };

export class AgentSettings {
    constructor(root, confirmDelete) {
        this._confirmDelete = confirmDelete;
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
        this.agentProviderSelect?.addEventListener("change", () => {
            if (Object.values(AGENT_DEFAULT_MODELS).includes(this.agentModelInput.value) || !this.agentModelInput.value.trim()) {
                this.agentModelInput.value = AGENT_DEFAULT_MODELS[this.agentProviderSelect.value] || "";
            }
        });
    }

    async load() {
        if (!this.agentList) return;
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
        this.agentModelInput.value = config?.model || AGENT_DEFAULT_MODELS[this.agentProviderSelect.value] || "";
        this.agentKeyInput.value = "";
        this.agentKeyInput.placeholder = config?.has_key ? T("leave_blank_keep_key") : T("enter_api_key");
        this.agentEnabledCb.checked = config?.enabled !== false;
        this.agentDeleteBtn.hidden = !config;
        this.agentForm.hidden = false;
        this.agentLabelInput.focus();
    }

    cancel() {
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
            api_key: this.agentKeyInput?.value.trim() || "",
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
