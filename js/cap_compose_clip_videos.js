import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "Capricorncd.ComposeClipVideos",
    beforeConfigureGraph(graphData) {
        for (const node of graphData.nodes || []) {
            if (node.type !== "CAP_ComposeClipVideos") continue;
            const values = node.widgets_values;
            if (Array.isArray(values) && values.length === 7 && ["from_start", "index"].includes(values[2])) {
                // Old workflows stored directory and filename matching before the prefix.
                node.widgets_values = [values[0], ...values.slice(3)];
            }
        }
    },
});
