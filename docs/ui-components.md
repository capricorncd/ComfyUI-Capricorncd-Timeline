# Shared UI components

## Status message

Use `js/components/StatusMessage.js` for bordered operation-status messages. Project export and video composition both use this component.

```js
import "./components/StatusMessage.js";
```

```html
<cap-status-message hidden></cap-status-message>
```

```js
status.setStatus("Processing…");           // info: neutral text
status.setStatus("Saved", "success");      // green
status.setStatus("Write failed", "error"); // red
status.setStatus("");                      // hide and clear
```

Messages are plain text; newlines and long paths are supported. Shadow DOM owns the background, border, typography, state colors and polite live-region semantics. Theme variables `--cat-text`, `--cat-raised` and `--cat-border` are inherited, with standalone defaults. Callers may set outside spacing or width, but should not duplicate status styles or manipulate internal markup.

Run `node tests/test_status_message.mjs` for behavior tests. Serve the repository locally and open `tests/status_message.browser.html` for native-browser rendering and style-isolation checks.
