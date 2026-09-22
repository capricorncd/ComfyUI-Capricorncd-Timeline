import { app } from "../../scripts/app.js";

const INPUT_ORDER = [
    "model", "base_model", "clip", "vae", "audio_vae", "data_json", "audio_refine_config", "face_refine_config", "selflift_config", "interpolation_config",
    "steps", "attention",
    "second_sampling", "first_pass_megapixels", "upscaler_model", "refine_sigmas",
    "motion_deblur",
    "sampling_preview", "preview_tiny_vae",
    "generate_audio", "normalize_audio",
    "compose_final",
];
const WIDGET_ORDER = INPUT_ORDER.slice(10);
const rank = name => {
    const index = INPUT_ORDER.indexOf(name);
    return index < 0 ? INPUT_ORDER.length : index;
};

function arrange(node) {
    node.inputs?.sort((a, b) => rank(a.name) - rank(b.name));
    node.inputs?.forEach((input, slot) => {
        const link = node.graph?.getLink(input.link);
        if (link && String(link.target_id) === String(node.id)) link.target_slot = slot;
    });
    node.widgets?.sort((a, b) => rank(a.name) - rank(b.name));
    node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: "Capricorncd.H3VideoGeneratorLayout",
    async beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CAP_H3VideoGenerator") return;
        const schemaOrder = [
            ...Object.keys(nodeData.input?.required ?? {}),
            ...Object.keys(nodeData.input?.optional ?? {}),
        ].filter(name => WIDGET_ORDER.includes(name) || name === "strict_keyframes");

        const created = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            created?.apply(this, arguments);
            arrange(this);
        };

        const configure = nodeType.prototype.configure;
        nodeType.prototype.configure = function (info) {
            // LiteGraph saves widget values positionally; restore by the saved names.
            const inputWidgets = info.inputs?.filter(input => WIDGET_ORDER.includes(input.widget?.name) || ["strict_keyframes", "audio_refine", "audio_refine_steps"].includes(input.widget?.name))
                .map(input => input.widget.name) ?? [];
            const legacyOrder = [...schemaOrder];
            if (!info.properties?.cap_h3_widget_order && info.widgets_values?.length >= schemaOrder.length + 1) {
                legacyOrder.splice(legacyOrder.indexOf("normalize_audio"), 0, "audio_refine", "audio_refine_steps");
                if (typeof info.widgets_values[2] === "boolean") {
                    legacyOrder.splice(legacyOrder.indexOf("steps") + 1, 0, "strict_keyframes");
                }
            }
            const savedOrder = info.properties?.cap_h3_widget_order
                ?? (inputWidgets.length === info.widgets_values?.length ? inputWidgets : legacyOrder.slice(0, info.widgets_values?.length));
            if (Array.isArray(info.widgets_values) && savedOrder.length === info.widgets_values.length) {
                const values = new Map(savedOrder.map((name, i) => [name, info.widgets_values[i]]));
                info = {...info, widgets_values: this.widgets.filter(widget => WIDGET_ORDER.includes(widget.name))
                    .map(widget => values.has(widget.name) ? values.get(widget.name)
                        : widget.name === "motion_deblur" ? false : widget.value)};
            }
            configure?.call(this, info);
            // Graph loading/paste installs links after node.configure returns.
            requestAnimationFrame(() => arrange(this));
        };

        const serialize = nodeType.prototype.onSerialize;
        nodeType.prototype.onSerialize = function (info) {
            serialize?.apply(this, arguments);
            info.properties ??= {};
            info.properties.cap_h3_widget_order = this.widgets
                .filter(widget => WIDGET_ORDER.includes(widget.name)).map(widget => widget.name);
        };
    },
    loadedGraphNode(node) {
        if (node.comfyClass === "CAP_H3VideoGenerator") arrange(node);
    },
});
