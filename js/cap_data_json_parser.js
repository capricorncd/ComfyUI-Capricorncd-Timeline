import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Capricorncd.DataJsonClipParser",
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== "CAP_DataJsonClipParser") return;
        const onConfigure = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigure?.apply(this, arguments);
            const output = this.outputs?.[12];
            if (output?.name === "agent" || output?.name === "model") {
                output.name = "model_type";
                if (["agent", "Agent", "エージェント", "model", "Model", "模型", "モデル"].includes(output.label)) delete output.label;
            }
            return result;
        };
    },
});
