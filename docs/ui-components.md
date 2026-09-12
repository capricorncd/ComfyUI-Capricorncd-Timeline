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

## Button and dropdown button

All new buttons must use these components. Native `<button>` creation and button presentation styles belong only inside shared components, not in business UI modules. Extend a component for missing behavior; specialized tabs or radio groups should compose the shared button while retaining their semantics. Existing specialized controls can be migrated when their owning UI is changed.

`js/components/Button.js` defines `<cap-button>`, a reusable ordinary button. It owns the native button, shared sizing, spacing, variants, border, hover, focus and disabled presentation. It has no dropdown indicator.

Import `js/components/DropdownButton.js` and use `<cap-dropdown-button>` for menu triggers. It imports and composes `<cap-button>`, adding only the triangle and menu semantics. Track, Insert Clip, Run and the header Import button share this component. Header Export, Compose Video, Settings and Close use `<cap-button>`.

The timeline toolbar also uses these components for generated-video mode, More (hover menu), Undo/Redo, zoom and playback controls. Mode selection uses `aria-pressed`; playback retains its round shape and red playing state. Replaced `.tl-btn` presentation rules are removed from the timeline stylesheet.

```html
<cap-dropdown-button variant="accent" title="Add a track">+ Track</cap-dropdown-button>
```

Both components accept `textContent` for the label, `disabled` for availability, and `focus()` / `click()` for native-button behavior. Variants are `accent`, `amber`, `danger` (red hover for Close), `primary` (solid action), or the default neutral style. `<cap-button shape="square">` is 28 px square; `shape="circle"` is 34 px round. `aria-pressed="true"` marks selection (blue, or red for primary playback). Icon-only buttons, including dropdowns, must provide `aria-label`, which is forwarded to the native button. Dropdown labels must not include a caret. Timeline keyboard handlers leave focused component buttons to the native button.

Use `dropdown.bindMenu(event => createMenu(event.currentTarget))` to enable hover opening. The callback creates and positions the menu and must return its DOM element. The dropdown keeps it open while the pointer is over either the button or the menu, with a 180 ms closing delay to cross the gap. Click/keyboard activation is also supported. Disabling or disconnecting the dropdown removes its menu. Menu contents, actions, placement and coordination with other menus remain caller-owned; opening a menu must not create undo history.

Run `node tests/test_dropdown_button.mjs`; `tests/dropdown_button.browser.html` also checks actual styles, event retargeting and the add-track button's clone/rebind behavior in a browser.

Editor dialogs (including dynamically built lists, track controls, font choices and confirmation actions) use the same buttons. `variant="ghost"` is for unobtrusive list actions; `variant="success"` shows brief successful actions such as copying. `size="small"` is 22 px tall, `size="large"` is 44 px; combine with `shape="square"` for icon controls. Use `align="start"` and `truncate` for long filenames, with width/flex constraints supplied by the list layout.

`js/components/TabButton.js` defines `<cap-tab-button>`, reusing Button with native `role="tab"`. Its parent supplies `role="tablist"`; callers retain panel switching and arrow-key handling, and set `aria-selected`, `aria-controls` and `tabIndex` as appropriate. Use `aria-pressed` for toggle buttons instead of page-specific selected styles. Button forwards accessibility attributes, title and tab index to its native control; `focusable` lets legacy modal focus traps include enabled components without creating a second tab stop on the host.

Run `node tests/test_dialog_buttons.mjs` for migration coverage, and open `tests/dialog_buttons.browser.html` for actual dialog markup, focus, disabled actions, tab/toggle states, watermark targets, dynamic font/confirmation actions and long-label layout checks.

## Media carousel

`js/components/MediaCarousel.js` provides `<cap-media-carousel>` for Clip settings and Prompt Manager's read-only asset-description tab. It owns the 16:9 frame, vertically centered Lucide navigation buttons (using `cap-button`), wraparound switching and item counter. Call `setSelection(index, count)` without emitting a change; user navigation emits `media-change` with `detail.index`. Set localized `previous-label` / `next-label` attributes. Zero or one item hides navigation.

The default slot holds caller-owned media. `setItems([{name, kind, url, enabled}], {index, editable, allowList, labels})` enables the top-right full-width/list switch. The default is preview mode; `setMode("list")` opens the scrollable list. List rows select on click/Enter/Space, drag vertically to reorder (or Alt+Up/Down), and use shared buttons to enable/disable or remove references. `media-edit` requests carry `action` (`reorder` with `from/to`, `toggle` or `delete` with `index`). `media-view-change` carries `mode`. Labels include `list`, `preview`, `enable`, `disable`, `remove`, `empty`.

Full-width preview exposes bottom-right eye and remove buttons, using the same `media-edit` toggle/delete requests as list rows. Preview navigation/count includes enabled references only; disabled references remain visible and can be re-enabled in list mode. Indices in events and `carousel.index` still refer to the full item array, not the filtered preview position. When the selected item is disabled, preview selects the next enabled item (wrapping); if all are disabled, `index` is `-1`. Callers render using the resolved component index after `setItems`. Empty previews hide actions; locked previews disable them. The `drop-active` attribute highlights a valid library-resource drop target.

The component does not load project data or mutate references. The editor owns validation, track locks, confirmation, undo and saving; removal never deletes the library asset or disk file. Clip settings and Prompt Manager share the selected reference and editing path. Both accept image/video resources dragged from the library via the existing pointer-based drag path; insertion appends and selects the new reference, without changing Clip timing. Descriptions remain read-only below the preview/list; browsing alone never changes prompt inclusion. Prompt Manager releases full audio/video on selection change, list mode, tab change and close. The old separate sorting modal is removed.

Serve the repository locally and open `tests/media_carousel.browser.html` for layout and interaction checks.

## Dialog

Use `js/components/Dialog.js` for new dialogs. `<cap-dialog>` owns an isolated native dialog, draggable header, shared button for Close, border, downward shadow, backdrop and scroll container. Export, voice conversion, subtitle speech/binding, batch subtitles, shortcuts and generated-media association use it. Legacy editor modals reuse its `bindDialogDrag()` helper and the same shadow/backdrop tokens while retaining their existing content and keyboard handling.

```html
<cap-dialog aria-label="Export" close-label="Close">
  <span slot="title">Export</span>
  <div class="cat-te-modal-body">
    <!-- Business controls stay in light DOM and use shared button components. -->
  </div>
</cap-dialog>
```

```js
dialog.showModal();             // Native modality, backdrop and focus isolation.
dialog.show();                  // Floating panel: no backdrop, background stays operable.
dialog.closeDisabled = true;    // Disable Close and Escape while busy.
dialog.closeDisabled = false;
dialog.close();                 // Programmatic close; also works while busy.
dialog.addEventListener("cancel", event => {
    if (cannotClose) event.preventDefault();
});
dialog.addEventListener("close", stopAudition);
```

`open` is read-only; do not toggle `hidden` or the reflected `open`/`modal` attributes. `cancel` is the cancelable close request from Close or Escape; `close` reports completed closure. Close an open dialog before changing its modal mode. Each fresh open centers it. Pointer drag is limited to the title bar, excludes interactive controls, clamps to the viewport and releases capture/listeners on cancellation or removal.

Configure width using `--cap-dialog-width` (default 460px). The component caps dimensions at 80vw/80vh and scrolls content without losing the header. `--cap-dialog-shadow` and `--cap-dialog-backdrop` are shared theme tokens; do not override native dialog styles from business CSS. The generated-video association panel uses `show()` and keeps the timeline selectable, allowing selection changes to retarget its contents. The generated-audio picker retains its previous blocking behavior with `showModal()`.

Drag the bottom-right grip to resize. The top-left stays fixed, and resizing is limited by both 80vw/80vh and available viewport space. Size is retained while the component exists; reopening still recenters it. Set `--cap-dialog-min-width` and `--cap-dialog-min-height` in pixels (defaults 320 × 160); smaller viewports take precedence over these minimums. Close uses the shared [Lucide X](https://lucide.dev/icons/x) SVG at 18px.

The legacy media-preview dialog reuses `cap-dialog-resize-handle` and `bindDialogResize`, with a 640 × 360 minimum and the same 80vw/80vh maximum. Keep resize-grip styling in `Dialog.js`; do not duplicate it in editor CSS.

| Dialog | Minimum width × height (px) |
| --- | --- |
| Project export | 420 × 320 |
| Voice conversion | 420 × 280 |
| Shortcuts | 400 × 240 |
| Batch subtitles | 460 × 360 |
| Subtitle speech / character binding | 560 × 360 |
| Generated video/audio association | 480 × 320 |

Run `node tests/test_dialog.mjs` plus the existing native-dialog/export/speech tests. `tests/dialog.browser.html` verifies real layout, drag, shared shadow isolation, nested dialogs, busy-close veto, scroll bounds and background hit testing in non-modal mode.
