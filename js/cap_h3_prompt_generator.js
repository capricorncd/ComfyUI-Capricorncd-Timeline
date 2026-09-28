import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import './components/SkillPicker.js';
import { t as T } from './i18n/timeline_editor.js';

app.registerExtension({
    name: 'Capricorncd.H3PromptSkillPicker',
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== 'CAP_H3AutoPromptConfig') return;
        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            const button = document.createElement('cap-button');
            button.textContent = T('select_prompt_skill_title');
            const picker = document.createElement('cap-skill-picker');
            button.addEventListener('click', () => {
                if (!picker.isConnected) document.body.append(picker);
                void picker.show(path => api.apiURL(path));
            });
            picker.addEventListener('skill-select', event => {
                const preset = this.widgets.find(widget => widget.name === 'skill_preset');
                const row = event.detail.skill;
                const value = `${row.title} [${row.id}]`;
                if (!preset.options.values.includes(value)) preset.options.values.push(value);
                preset.value = value;
                preset.callback?.(value);
                this.setDirtyCanvas(true, true);
                picker.close();
            });
            const widget = this.addDOMWidget('skill_picker', 'button', button, {
                getMinHeight: () => 32, getHeight: () => 32,
            });
            widget.serialize = false;
            widget.computeLayoutSize = () => ({ minHeight: 32, maxHeight: 32 });
            const index = this.widgets.findIndex(item => item.name === 'skill_preset');
            this.widgets.splice(this.widgets.indexOf(widget), 1);
            this.widgets.splice(index + 1, 0, widget);
            const removed = this.onRemoved;
            this.onRemoved = function () {
                picker.remove();
                removed?.apply(this, arguments);
            };
        };
    },
});
