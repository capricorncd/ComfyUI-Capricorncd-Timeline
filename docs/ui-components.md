# Shared UI components

Reference project preview offers a shared hover dropdown, “Merge into current project”, with “Insert at beginning” and “Append at end”. Merging preserves reference tracks, assigns new Clip/track/group IDs, remaps material references and supports undo. Insert shifts all existing Clips by the reference timeline length; append starts at the current timeline end. Materials are compared by file content before copying, so matching files reuse the current catalog entry. Missing files stop the merge with an inline error. Current project settings and prompt history are retained.

## Prompt history actions

Editable prompt fields also show two hover icon menus at the bottom left through `PromptTemplateActions.js`. Templates insert at the saved caret/selection with rich-prompt undo. Eight editable H3 examples cover multi-image, video reference, digital avatar, audio-driven performance, first/last frame, first frame, last frame and text-to-image prompts. The last menu item opens shared `cap-dialog` template management: add, edit, delete, five-star ratings, JSON import/export. Ratings sort descending and ties retain stored order. Templates are saved in browser local storage and shared across projects on the same origin. Import validates `schema_version: 1`, updates matching IDs and skips duplicate name/text pairs. Storage/format errors remain visible.

The reference-description menu lists exact named references from the field's uncommented text, deduplicated by asset ID. It inserts the asset's setting description (falling back to its prompt or generation prompt) at the caret; assets without descriptions stay disabled. `bind(..., {getAssets})` supplies the asset list for regular and keyframe fields. Read-only prompt boxes retain only Copy.

`PromptHistoryActions.js` also registers `<cap-readonly-prompt>` for history entries and preview sampling prompts. Set its `value` and `aria-label`. It owns the read-only textarea, shared Copy icon with success feedback, and automatic full-text height; content scrolls with the dialog body. History entries retain their restore and delete actions below the field.

`cap-dialog` supports `previous` and `next` slots for navigation buttons centered outside its left and right edges. Preview sampling management uses these slots for Clip navigation, matching Prompt Management.

`cap-shot-control` exposes a default slot for Clip-owned actions. Its keyframe preview sampling action opens the shared version manager filtered to the selected frame interval, including continuation parts. Sampling and HD generation in this view use that interval. Clicking the Clip outside its markers clears keyframe selection.

The keyframe description heading includes an Expand icon. It opens a resizable shared dialog with the same textarea, keeping edits, asset mentions, history and copy actions bound to the selected keyframe. Closing restores the field to the sidebar; edits are saved as they are typed.

Keyframe prompts use the shared rich prompt editor. `Ctrl+/` toggles `//` comments on the current or selected lines in both the sidebar and expanded dialog; comment lines are omitted from model prompts.

`PromptHistoryActions.js` provides `<cap-prompt-history-actions>` inside prompt fields at the bottom right. The field wrapper reserves a toolbar row within its border so actions do not cover text while scrolling. `bind(textarea, read, write)` supplies the workflow-owned history document (`schema_version: 1`, `items` with `id`, `text`, `created_at`). History, Save and Copy reuse shared icon buttons. Restoring dispatches input/change through the existing editor path. Timeline prompts and keyframe prompts share the node's hidden `prompt_history_json` widget. Project exports include a separate `prompt_history.json`; missing history on import means an empty history, including older packages.

## Project video list

The asset library uses shared `cap-tab-button` controls for Media, Text, Effects, Filters and Adjust. Media has vertical All/Image/Video/Audio tabs and defaults to All; mixed imports keep All selected. Text opens the existing subtitle insertion dialog. Filters offers Fair, Bright and Natural portrait presets. Clicking adds a filter Clip at the playhead on a separate filter/effect track, one third of a normal track's height. Select it to change preset or strength (0–100%, default 70%); drag, trim, split, copy, disable and undo work as for other Clips. Track visibility disables its filters. Filters affect the composed picture for their time range, before subtitles, and stack from lower to upper tracks. Preview and final export share a local RGB LUT with trilinear interpolation; active filters require re-encoding. These are approximate skin-color adjustments, not face detection or proprietary CapCut presets. Effects and Adjust retain empty states. Horizontal and vertical tab sets support their matching arrow keys and Home/End.

Reference trimming uses the shared list's `compact` attribute in the independently scrolling right panel. Rows have 56×32 video thumbnails or audio icons, a single-line name with a full-name tooltip, and the shared Add menu. Hover plays video/audio unmuted; leaving, switching lists or closing pauses it. Only visible video rows preload metadata; compact audio loads on hover and has no native control bar. The default project video list retains its larger cards. Optional `name` labels the asset. The reference-only footer action Reset Clip Duration sets the parent duration to the latest enabled child video/audio end, respecting video trim and speed, with undo.

Reference and generated-video child timeline track hover/context menus include Auto Arrange. Enabled tracks start at zero and close gaps after insertion, removal, movement or trimming, preserving source trims and speed. The flag is persisted as `auto_arrange` on each child row and restored with the track; locked tracks cannot toggle it. Child edits retain the parent editor's undo behavior.

`ProjectVideoList.js` provides `<cap-project-video-list>`. `setVideos(rows, urlFor, menuFor)` renders output file records with unmuted hover playback and a shared dropdown menu. List previews have no native playback controls and pause on pointer leave; playback controls remain available in Details. The project video details dialog places the prompt-overwrite action at the right of its fixed footer, using the shared danger variant. `stop()` pauses previews when switching tabs or closing the editor; disconnect also pauses them. The editor owns menu actions and persists `composed_videos` in the project. Confirmed deletion moves its generated output file to the Windows Recycle Bin. Material-library deletion only removes project records and references, keeping disk files. H3 final-composition notifications carry source Clip IDs and workflow identity to associate results with the project, including single-file results.

Before adding or changing UI, follow the [UI design and acceptance guidelines](ui-guidelines.md) for hierarchy, spacing, prompt display and icon actions. This document describes component APIs and integration.

## Export Directory

`ExportDirectory.js` provides `<cap-export-directory>` for project, composition and Clip video/audio export. The header shows `label` (default: Export directory) and a launcher-only Choose/Change folder action; the directory field shows the full selected path or `default-dir` (default: output). `value` is the chosen directory, not the displayed fallback: empty means ComfyUI output. `disabled` controls export-time availability and `change` reports selection or reset. Cancel preserves selection; picker failures use the shared status component. `exportKind` / `export-kind` selects independent `project` or `video` preferences (default `video`; Clip audio shares the video preference). In the launcher, `restore(projectDirectory)` first uses that kind's last successful directory; only project export falls back to the associated project directory. Video export falls back to its own default output folder. `remember(directory)` saves the successful destination, including relative/default paths; cancellation and failure do not update it. Project association fields never read or write export preferences. The old mixed preference is not reused because its export kind is unknown. Browser mode allows manual input without native picker actions. Project exports default to `output/cap_timeline_projects/`; remote browser project exports still use the browser save picker. Paths remain in the editor's private launcher session/localStorage, never graph nodes or exported JSON. Test with `tests/export_directory.browser.html`, `test_compose_settings.mjs`, and `test_clip_export.mjs`.

```html
<cap-export-directory default-dir="output/cap_timeline_compose/"></cap-export-directory>
```

The reflected JS property is `defaultDir`; `directory` resolves `value || defaultDir`. `exportSettings` maps absolute paths to `output_directory` and output-relative paths to `filename_prefix` for composition requests. The old separate prefix controls have been removed. `label` can override the localized default heading.

Outside the launcher, the input is editable. Relative paths (including `output/...`) refer to ComfyUI output; absolute paths refer to the ComfyUI server's filesystem and are limited to local clients. Typing checks directory existence after 350 ms and shows missing-directory or connection errors below the field using the red status component. Call `await validate()` before export; false blocks submission. Unmodified defaults may be created by the export operation. The check never creates directories, and stale responses cannot replace the current input's feedback.

## Status message

While the editor is visible and idle, associated project directories are checked every five seconds for changes to the active project JSON and its matching storyboard. External changes offer a shared confirmation dialog; accepting first saves current edits as `project.<timestamp>.<id>.json` and matching `storyboard.<timestamp>.<id>.json`, then reloads. Declining suppresses that revision only. Self-saves and automatic `.bak` files do not trigger the prompt. Directory imports with multiple `project*.json` files offer a shared dialog showing filenames and modification times, newest first; each version loads its own matching storyboard. Cancelling preserves the current project. Tests: `test_project_watch.mjs`, `test_launcher_project.mjs`, `test_launcher_project.py`.

Project settings reuse the directory component with `project-directory`, `default-dir=""` and a localized Project directory label. This mode never restores an export preference. A danger-variant Unbind button appears when a directory is set; it clears the address and emits change through the existing association path, stopping future disk saves without deleting files. Without a launcher bridge it allows manual input: `input` invalidates the old association, while committed `change` validates and associates the new directory. Clearing it stops disk saves. A stored workflow directory is re-associated when opening the editor; existing project files require confirmation before linking. Project saving and automatic backups work in both launcher and local browsers; only the native picker depends on the launcher. `project_directory` is saved in project files and workflow project widgets, including their restore mirrors. Session tokens remain private. Local same-origin backend restrictions remain in effect.

Use `js/components/StatusMessage.js` for bordered operation-status messages. Project export and video composition both use this component.

Add `toast` for global feedback that must not shift page content, such as project-save results. Toasts are fixed at the top center, constrained to the viewport, and keep the existing close button and live-region semantics. Success/info messages dismiss after 3.5 seconds; errors/warnings remain closable. Each new message replaces the old timer. Inline field validation stays in normal flow without `toast`.

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

Both components accept `textContent` for the label, `disabled` for availability, and `focus()` / `click()` for native-button behavior. Variants are `accent`, `amber`, `danger` (theme red for deletion, removal and clearing content), `primary` (solid action), or the default neutral style. `<cap-button shape="square">` is 28 px square; `shape="circle"` is 34 px round. `aria-pressed="true"` marks selection (blue, or red for primary playback). Icon-only buttons, including dropdowns, must provide `aria-label`, which is forwarded to the native button. Dropdown labels must not include a caret. Timeline keyboard handlers leave focused component buttons to the native button.

Use `dropdown.bindMenu(event => createMenu(event.currentTarget))` to enable hover opening. The callback creates and positions the menu and must return its DOM element. The dropdown keeps it open while the pointer is over either the button or the menu, with a 180 ms closing delay to cross the gap. Click/keyboard activation is also supported. Disabling or disconnecting the dropdown removes its menu. Menu contents, actions, placement and coordination with other menus remain caller-owned; opening a menu must not create undo history.

Run `node tests/test_dropdown_button.mjs`; `tests/dropdown_button.browser.html` also checks actual styles, event retargeting and the add-track button's clone/rebind behavior in a browser.

Editor dialogs (including dynamically built lists, track controls, font choices and confirmation actions) use the same buttons. `variant="ghost"` is for unobtrusive list actions; `variant="success"` shows brief successful actions such as copying. `size="small"` is 22 px tall, `size="large"` is 44 px; combine with `shape="square"` for icon controls. Use `align="start"` and `truncate` for long filenames, with width/flex constraints supplied by the list layout.

`js/components/TabButton.js` defines `<cap-tab-button>`, reusing Button with native `role="tab"`. Its parent supplies `role="tablist"`; callers retain panel switching and arrow-key handling, and set `aria-selected`, `aria-controls` and `tabIndex` as appropriate. Use `aria-pressed` for toggle buttons instead of page-specific selected styles. Button forwards accessibility attributes, title and tab index to its native control; `focusable` lets legacy modal focus traps include enabled components without creating a second tab stop on the host.

Run `node tests/test_dialog_buttons.mjs` for migration coverage, and open `tests/dialog_buttons.browser.html` for actual dialog markup, focus, disabled actions, tab/toggle states, watermark targets, dynamic font/confirmation actions and long-label layout checks.

## Storyboards

`js/editor/StoryboardPage.js` provides the storyboard page and right-side settings form. The timeline More menu switches between storyboard and playback mode in the existing program area. Clicking a `js/components/StoryboardCard.js` card selects its settings; adding and changing shots use the editor's save and undo paths. Cards use `cap-button size="content"` for an accessible, variable-height selection surface. Images fit the project aspect ratio without cropping.

Shots are stored separately from `project_json` in the node's hidden, serialized `storyboard_json` textarea. Its document is `{ "schema_version": 1, "shots": [...] }`. Directory and ZIP exports include `storyboard.json`, even without workflow export; both import paths restore it. Older embedded `project.storyboards` migrate on load when the separate document is absent. Unsupported document versions fail before replacing saved data. Storyboard-only image references are included in exported media.

Each shot stores `id`, `title`, `description`, `duration` (seconds), `shot_size`, `camera_move`, `image_id` (project media ID), `speaker`, `dialogue`, `emotion`, and `delivery`. “Generate from director clips” appends one shot per director clip in timeline order, copying its name, duration, clip prompt and first enabled image reference. `source_clip_id` prevents duplicates on subsequent clicks. Existing shots and clips are preserved; generation is one undo step. This UI does not generate timeline clips from storyboards.

`tests/storyboard.browser.html` exercises selection, editing, long durations, save/load, undo/redo, safe text rendering, aspect ratio and switching back to playback.
`tests/test_storyboard_document.mjs` and `tests/test_storyboard_export.py` cover version validation, legacy migration, widget serialization and package round trips.

## Media carousel

The timeline More menu's “Load reference project” opens a native `project.json` picker on the local ComfyUI machine. `js/editor/ReferenceProject.js` keeps the selected project read-only in the editor session and reopens it without picking again. It uses the shared dialog’s non-modal `show()` so the timeline and other controls remain operable without a backdrop. Its tabs show director tracks first, preserve duplicate track names, and put global settings last. Clip prompts can be copied; image, video and audio references are served from the selected project directory or their declared ComfyUI input/output location. Missing media remains labeled. The footer loads another project; cancellation or failure preserves the previous reference. Run `node tests/test_reference_project.mjs` and `python tests/test_reference_project.py` for behavior and path-containment checks.

`js/components/MediaCarousel.js` provides `<cap-media-carousel>` for Clip settings and Prompt Manager's read-only asset-description tab. It owns the 16:9 frame, vertically centered Lucide navigation buttons (using `cap-button`), wraparound switching and item counter. Call `setSelection(index, count)` without emitting a change; user navigation emits `media-change` with `detail.index`. Set localized `previous-label` / `next-label` attributes. Zero or one item hides navigation.

The default slot holds caller-owned media. `setItems([{name, kind, url, enabled}], {index, editable, allowList, labels})` enables the top-right full-width/list switch. The default is preview mode; `setMode("list")` opens the scrollable list. List rows select on click/Enter/Space, drag vertically to reorder (or Alt+Up/Down), and use shared buttons to enable/disable or remove references. `media-edit` requests carry `action` (`reorder` with `from/to`, `toggle` or `delete` with `index`). `media-view-change` carries `mode`. Labels include `list`, `preview`, `enable`, `disable`, `remove`, `empty`.

Full-width preview exposes bottom-right eye and remove buttons, using the same `media-edit` toggle/delete requests as list rows. Preview navigation/count includes enabled references only; disabled references remain visible and can be re-enabled in list mode. Indices in events and `carousel.index` still refer to the full item array, not the filtered preview position. When the selected item is disabled, preview selects the next enabled item (wrapping); if all are disabled, `index` is `-1`. Callers render using the resolved component index after `setItems`. Empty previews hide actions; locked previews disable them. The `drop-active` attribute highlights a valid library-resource drop target.

The component does not load project data or mutate references. The editor owns validation, track locks, confirmation, undo and saving; removal never deletes the library asset or disk file. Clip settings and Prompt Manager share the selected reference and editing path. Both accept image/video resources dragged from the library via the existing pointer-based drag path; insertion appends and selects the new reference, without changing Clip timing. Descriptions remain read-only below the preview/list; browsing alone never changes prompt inclusion. Prompt Manager releases full audio/video on selection change, list mode, tab change and close. The old separate sorting modal is removed.

Serve the repository locally and open `tests/media_carousel.browser.html` for layout and interaction checks.

## Dialog

Use `showCapConfirm(message, options)` and `showCapAlert(message)` from `cap_ui.js` instead of native `confirm`/`alert`. Both use a compact modal `cap-dialog` and render messages as plain text. Await confirmations: OK resolves `true`, Cancel/Close/Escape resolves `false`, and the optional third button resolves `"alternate"`. Alerts have one acknowledgement button. Default labels follow the current UI language. Verify with `node tests/test_message_dialog.mjs`.

The editor's shared delete confirmation uses modal `cap-dialog`, including deletion from the compose window, so it stays above its parent dialog. Watermarks default to disabled; explicitly saved enabled settings are retained.

Use `js/components/Dialog.js` for new dialogs. `<cap-dialog>` owns an isolated native dialog, draggable header, shared button for Close, border, downward shadow, backdrop and scroll container. Export, voice conversion, subtitle speech/binding, batch subtitles, shortcuts and generated-media association use it. Legacy editor modals reuse its `bindDialogDrag()` helper and the same shadow/backdrop tokens while retaining their existing content and keyboard handling.

```html
<cap-dialog aria-label="Export" close-label="Close">
  <span slot="title">Export</span>
  <div class="cat-te-modal-body">
    <!-- Business controls stay in light DOM and use shared button components. -->
  </div>
  <div slot="footer" class="cat-te-confirm-actions">
    <cap-button>Cancel</cap-button>
    <cap-button variant="primary">Export</cap-button>
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

Prefer `width`, `height`, `minWidth` and `minHeight` properties for caller-owned dimensions:

```js
dialog.width = 460;
dialog.height = 240;            // Numbers mean px.
dialog.minWidth = 360;
dialog.minHeight = 220;
// Or: dialog.height = "fit-content" / "70vh".
```

HTML supports `width`, `height`, `min-width` and `min-height` attributes (for example `<cap-dialog height="240" min-height="220">`). Numbers and unitless numeric attributes mean pixels; width/height also accept CSS sizes. Keep minimum sizes in pixels for the resize handle. Getters return the declared attribute string, or an empty string when unset, rather than measured dimensions. Assign null/undefined/empty string or remove the attribute to restore CSS defaults. Properties/attributes override the existing CSS sizing variables without replacing theme styles. Setting width/height after manual resizing clears that axis's drag size, so the new requested size takes effect immediately; changing one axis preserves the other.

Existing CSS callers can still configure `--cap-dialog-width` (default 460px). The component caps dimensions at 80vw/80vh and scrolls content without losing the header. `--cap-dialog-shadow` and `--cap-dialog-backdrop` are shared theme tokens; do not override native dialog styles from business CSS. The generated-video association panel uses `show()` and keeps the timeline selectable, allowing selection changes to retarget its contents. The generated-audio picker retains its previous blocking behavior with `showModal()`.

Global actions (confirm, cancel, export, run) belong in a direct child with `slot="footer"`. The component pins the header and footer while the body scrolls, including after resizing. Omit the footer slot for dialogs without global actions; an empty footer is hidden automatically. Keep contextual form actions beside their fields. Legacy modals use the same separate body/footer structure. Set `--cap-dialog-height` for a fixed height (Compose uses 80vh; project version selection and project-update confirmation use 240px), or `fit-content` for a compact content-sized dialog. The default `auto` height can stretch a fixed-position modal between its inset edges; do not rely on it for compact forms.

Drag the bottom-right grip to resize. The top-left stays fixed, and resizing is limited by both 80vw/80vh and available viewport space. Size is retained while the component exists; reopening still recenters it. Set `--cap-dialog-min-width` and `--cap-dialog-min-height` in pixels (defaults 320 × 160); smaller viewports take precedence over these minimums. Close uses the shared [Lucide X](https://lucide.dev/icons/x) SVG at 18px.

The legacy media-preview dialog reuses `cap-dialog-resize-handle` and `bindDialogResize`, with a 640 × 360 minimum and the same 80vw/80vh maximum. Keep resize-grip styling in `Dialog.js`; do not duplicate it in editor CSS.

In media preview, plain Left/Right browse adjacent assets even when a select (such as media type) is focused; prevent the native select action so its option stays unchanged. Up/Down and Enter retain native select behavior. Text inputs, editable text, tabs, modifier shortcuts and metadata subdialogs keep their own keyboard behavior. Test with `node tests/test_media_preview_keyboard.mjs`.

| Dialog | Minimum width × height (px) |
| --- | --- |
| Project export | 420 × 320 |
| Compose export | 640 × 420 |
| Local audio | 360 × 260 |
| Shortcuts | 400 × 240 |
| Batch subtitles | 460 × 360 |
| Subtitle speech / character binding | 560 × 360 |
| Generated video/audio association | 480 × 320 |

Run `node tests/test_dialog.mjs` plus the existing native-dialog/export/speech tests. `tests/dialog.browser.html` verifies real layout, drag, shared shadow isolation, nested dialogs, busy-close veto, scroll bounds and background hit testing in non-modal mode. `tests/dialog_footer.browser.html` checks fixed footers against the actual editor dialog templates, including long content, short windows and dialogs without global actions.

## Training dataset workspace

`js/training_dataset/Editor.js` defines `<cap-training-dataset-editor>`. Its `open(saved, onSave, apiURL)` method opens the fullscreen dataset workspace; `onSave` receives workflow-safe source paths, scene boundaries, captions, selection and export settings. Removal stops playback, releases the reused Timeline component and requests cancellation of an active job. It reuses `cap-button`, native form wrappers, `cap-status-message`, `cap-theme-picker` and the existing locked video timeline. Business pages do not access component Shadow DOM. Timeline's existing `addTrackTypes: []` now also hides its add-track entry.

Use `tests/training_dataset.browser.html` with the isolated fixture server; usage and limits are documented in `docs/training-dataset.md`.

## Export range

`js/components/ExportRange.js` provides `<cap-export-range>`. Call `configure(totalFrames, fps, labels)` and `update(currentFrame, playing)`; `exportRange` returns frame boundaries with an exclusive end, or `null` for the full timeline. The component emits `toggleplay`, `seek` and `rangechange`; seek/range events contain `detail.frame`. Playback and export remain owned by the editor. `tests/export_range.browser.html` checks frame stepping, range limits, playback stopping, independent output selection and preview layout.

Optional range labels `lock`, `match` and `advance` enable the trim toolbar's “Lock duration”, “Match Clip duration” and “Next segment” controls. Lock defaults off on configure; dragging or stepping either endpoint then translates the whole selection, clamped at source boundaries. `matchrange` asks the caller for a target; `setRangeLength(frames)` sets the length from the current start and emits `rangechange`. `advanceRange()` starts at the previous end. Both explicit actions may shorten the selection at the source end, even when dragging is locked. `hide-current-time` omits the duplicate playback position. `tests/export_range_advance.browser.html` covers these controls and boundary behavior.

## Slider with reset

Import `js/components/Slider.js`. `<cap-slider>` wraps a native range input and optional value label, with a shared `<cap-button>` at the end. Set `default-value` for the reset target and a localized `reset-label` for the accessible button name. Without `default-value`, reset uses the input's HTML `value` attribute. Changing the current value does not change that default.

```html
<cap-slider default-value="100" reset-label="Reset to default">
  <input type="range" min="0" max="500" value="100" aria-label="Volume">
  <output>100%</output>
</cap-slider>
```

Keep listeners and value labels on the native input as usual. Reset emits `input` then `change` only when the value changes, so existing preview, saving and undo handlers also apply. Disabled inputs disable reset. Clip volume and generated-video edit volume use this component; both reset to 100%.

## Context menu

Use `js/components/ContextMenu.js` and `<cap-context-menu>`. Call `setItems([{ label, icon, shortcut, disabled, danger, strike }, { separator: true }])`. Icons use keys from `cap_icons.js`; shortcuts are presentation only, not new key bindings. Existing labels ending in two spaces plus `Ctrl+…` are split into the shortcut column.

The component owns the menu surface, three-column layout and `cap-button` actions. `menu-select` carries the original item; the caller performs its action and removes the menu. `menu-close` requests dismissal; `detail.restoreFocus` is true for Escape. Arrow keys, Home and End navigate enabled items. The caller owns placement and outside-click dismissal. `focus()` selects the first enabled item.

Run `node tests/test_context_menu.mjs` and `node tests/test_context_menu_dismiss.mjs`.

## Appearance and form controls

`Disclosure.js` provides `<cap-disclosure>` for collapsible settings. Put the heading in `slot="title"` and controls in the default slot. The `open` attribute/property controls expansion. It reuses `cap-button`, the shared chevron and theme. Enter/Space toggle expansion, the native button exposes `aria-expanded`, and collapsed controls leave the tab order. The training dataset workspace uses it for Appearance, separate from export settings.

`ThemePicker.js` adds `<cap-theme-picker>` inline under Settings → General, without a second dialog. Light/dark mode defaults to the system preference and responds to system changes. Jade, ocean, violet and amber accents and the mode are stored locally. Theme tokens are scoped to the editor, including its dialogs and timeline; the ComfyUI canvas is unaffected. `cap-theme-change` triggers canvas ruler repainting.

`Switch.js` defines `<cap-switch>` independently and `FormControls.js` re-exports it. The switch wraps a native checkbox with `role="switch"`; native labels, Space, focus, disabled state and input/change events are preserved. Programmatic `checked` changes do not emit events.

`FormControls.js` provides `<cap-input>`, `<cap-select>`, `<cap-textarea>` and `<cap-switch>`. Each wraps a native control in light DOM, preserving labels, `form.elements`, validation and native events. Apply `name`, `required`, `disabled`, number constraints and accessibility attributes to the native control. Wrappers expose `value`, `disabled`, `focus()`, `checkValidity()` and `reportValidity()`; switches also expose `checked`. Input/select support `size="small"`.

```html
<label>Clip name<cap-input><input name="title" required></cap-input></label>
<label>Camera<cap-select><select name="camera"><option>Fixed</option></select></cap-select></label>
<label>Prompt<cap-textarea><textarea name="prompt" rows="4"></textarea></cap-textarea></label>
<label><cap-switch><input type="checkbox" name="snap"></cap-switch>Snap</label>
```

Buttons support `size="regular"` (36px), existing compact/large sizes, and `variant="card"` for selectable content. Presentation stays in the shared component. Storyboard cards display a bounded summary (the `summary:` section when available); the inspector retains the full prompt.

The main editor has three columns above a full-width timeline. The horizontal separator resizes the entire upper workspace and preserves the existing height preference. Browser fixtures: `components.browser.html`, `theme.browser.html`, `editor_layout.browser.html`; `storyboard.browser.html` covers existing storyboard interactions.

## Tags and radio buttons

Import `Tag.js` for `<cap-tag>` and `<cap-tag-group>`. Tags support `variant="accent|amber|danger"`, `closable`, `disabled`, `value`, and a localized `close-label`. Clicking the close button emits a bubbling, cancelable `tag-close` with `detail.value`; the tag removes itself unless the listener calls `preventDefault()`. Data-backed callers prevent the default and update their own data. Tag groups wrap by default; `nowrap` enables horizontal scrolling, and `values` reads the current child tag values. Give groups an `aria-label`.

```html
<cap-tag-group aria-label="Bound clips">
  <cap-tag variant="accent" value="clip-1" closable close-label="Unbind Lighthouse">Lighthouse</cap-tag>
</cap-tag-group>
```

The storyboard inspector uses closeable tags for bound clips. Closing one updates `clip_ids` through the existing save/undo path; it does not delete the clip.

Import `RadioButton.js` for `<cap-radio-button>` and `<cap-radio-group>`. Radio buttons reuse the shared button and accept its size/variant attributes plus `value`, `checked`, and `disabled`. Add `indicator` for a leading radio circle inside the bordered button, as used by the export format selector. A standalone radio can be checked; exclusivity is owned by the group. Direct child radio values must be unique and nonempty.

```html
<cap-radio-group name="mode" value="system" required aria-label="Color mode">
  <cap-radio-button value="system">System</cap-radio-button>
  <cap-radio-button value="light">Light</cap-radio-button>
  <cap-radio-button value="dark">Dark</cap-radio-button>
</cap-radio-group>
```

Groups expose `value`, `disabled`, `focus()`, `checkValidity()` and `reportValidity()`. User selection emits one bubbling `change` with `detail.value`; assigning `value` does not emit it. Groups support form serialization/reset, `required`, disabled fieldsets, arrow/Home/End navigation and one Tab stop, skipping disabled choices. Set `orientation="vertical"` for a vertical arrangement. Examples and regression checks are in `tests/components.browser.html`.

`FormRow.js` provides `<cap-form-row>` for a label and right-aligned control. Wrap the row in a native `<label>` to preserve input labeling; use `<cap-input>` / `<cap-select>` for controls. `--cap-form-row-control-width` defaults to 180px. Text uses the current theme.

Interface font size is set in Settings → General (default 16px, 10–24px), saved locally. UI typography uses the scoped rem-based `--cat-font-size` token with size ratios, including shared shadow components and timeline labels. It does not change the document root or video/subtitle output sizes; the prompt font size remains independent.

`ShotControl.js` provides `<cap-shot-markers>` (timeline diamonds) and `<cap-shot-control>` (selected marker settings). Markers accept `configure(points, sourceStart, sourceDuration, selectedPoint, label)` and emit `point-select` with a point index. Settings accept `configure(point, clipTime, fps, locked, labels)` and emit `prompt-change`, `prompt-commit`, `delete`, and `insert`. `DirectorKeyframes.js` owns selection, undo, source/Clip time conversion, and persistence in the existing media `video_shots` object; no second marker store is created. New video-reference data gets a starting marker. Right-click or Ctrl+P inserts at the playhead; double-click inserts at the clicked position. Selected points move one timeline frame with arrows and delete with Delete/Backspace. Input fields retain text editing. VideoTrim now only edits the reference range and preserves its existing shot data.

“Smart markers (PySceneDetect)” runs only on request, on the visible source range, and merges new frame-aligned cuts without replacing descriptions. Install the optional dependency in ComfyUI's Python environment with `python -m pip install "scenedetect>=0.7,<0.8"`. Detection does not split Clips or download models. Tests: `test_director_keyframes.mjs`, `test_shot_control.mjs`, `test_video_trim_navigation.mjs`, and `test_scene_detection.py`.

## Rich prompt editor

`js/components/RichPrompt.js` owns the shared `<cap-rich-prompt>` syntax mirror, comment shortcut, plain-text paste, line clipboard and cleanup. It enhances an existing native textarea without moving it, preserving ComfyUI widget bindings, labels, selection and form events. The mirror is hidden from assistive technology; the textarea remains the accessible input. Removing the component releases its listeners and resize observer.

Use `attachRichPromptHandler(textarea, { mode: "overlay" })` in editor forms; the default `widget` mode supports ComfyUI nodes. Use `setRichPromptValue(textarea, text)` for programmatic updates and `detachRichPromptHandler(textarea)` for explicit disposal. Existing native `input` events carry edits. `bindRichPromptWidget(widget)` handles node widgets. Callers do not manipulate mirror markup.

Only lines beginning with `//` (after optional whitespace) are dimmed and omitted from generated prompts. Ctrl+/ toggles the two-character marker; Markdown `#` headings remain active text. Preset titles are inserted as `//title`. Old `#` notes are now ordinary text and must be changed explicitly if they should remain comments. `js/prompt_text.js` shares the parsing rule across frontend output and validation; `backend/prompt_text.py` applies the same rule at execution.

Run `node tests/test_rich_prompt.mjs` and the prompt-related regression tests. Serve `tests/rich_prompt_clipboard.browser.html` to check native clipboard, widget binding and cleanup.

Asset status badges use `cap-tag size="small"`: accent for direct use, amber for references from other assets. Unused assets have no badge.

Rich prompts keep up to 100 text undo steps per textarea. Ctrl/Cmd+Z undoes; Ctrl+Y or Ctrl/Cmd+Shift+Z redoes. Typing within 750 ms is grouped; paste, preset insertion and comment toggles are separate edits. `replaceRichPromptRange` performs undoable edits; `setRichPromptValue` replaces external content and resets history when the value changes. Editor shortcut routing calls `undoRichPrompt` before timeline undo.


## H3 first-pass versions

Motion-context SaveLatent files are kept alongside the corresponding video with its final basename: `.safetensors` for one sampling pass, or `_low.safetensors` / `_high.safetensors` for two resolutions. The upstream fixed-slot counter is removed by renaming after the video is saved; continuation loads the returned final paths. Existing latent contents are not rewritten.

Video-reference H3 runs use `editor/KeyframeRun.js` and a shared `cap-dialog` to confirm keyframe intervals before queueing. Interval numbers start at 1; `1,3,5-90` includes 90 and supports include/exclude mode plus individual checkboxes. The Clip end closes the final interval without adding a marker. The confirmation is injected only into the queued `h3_generation.keyframe_runs` snapshot. `backend/h3_keyframe_runs.py` divides selected intervals into frame-aligned passes of at most 10 visible seconds; SaveLatent continuation is limited to passes within the same interval. Each output is associated with the original Clip, positioned independently in Trim Video, and trimmed using the generated context/carry/tail frame counts, including interpolated output. Segment runs do not compose or delete their videos. Replayed completion preserves manual trims; reruns disable overlapping previous takes while keeping their files. Tests: `test_keyframe_run.mjs`, `test_h3_keyframe_runs.py`, `test_h3_video_association.mjs`, `test_h3_video_generator.py`; browser fixture: `keyframe_run.browser.html`.

`js/editor/H3DraftVersions.js` manages director Clip first-pass candidates in a non-modal `cap-dialog`. Each version links a low-resolution preview to its persisted AV latent and prompt/seed snapshot. Disabled versions remain viewable. Run automatically uses the latest enabled preview whose latent files exist and duration/fps match; other Clips follow ordinary generation. Deleting confirms first, then unlinks the version and records a tombstone so completion-event replay cannot resurrect it. Video, latent and metadata files remain on disk; undo restores the association. Editor history owns undo; version arrays are copied in Clip snapshots.

Batch preview actions are injected into only the queued Timeline Editor API snapshot, not saved as a project generation mode. The H3 generator controls preview megapixels and sequential candidate count (`preview_sampling_batch`, default 1). `tests/h3_drafts.browser.html` exercises browsing, disabled state, non-modal behavior and serialization; queue and saved-output tests cover event replay and isolation from finished videos.

## Prompt asset mentions

`PromptMentions.js` provides `<cap-prompt-mentions>`. Append it beside an existing textarea and call `bind(textarea, getAssets)`. Assets contain `id`, `name`, `file`, `kind`, optional `category` and `preview`. Typing `@` opens name search, category filters and thumbnails; arrows/Enter select and Escape closes. Selection inserts `@name` and emits `asset-mention` with the asset. The component leaves persistence to the caller. Read-only fields do not open suggestions; disconnection removes listeners.

Timeline prompt fields and `ShotControl.setMentionSource(getAssets)` share this component. Prompt references persist as `prompt_media_ids`, separately from visible `media_ids`, and participate in export and unused-media checks. The H3 generation adapter converts names using actual loaded reference order. The bundled `backend/h3_reference_skill.md` guides Agent generation without imposing a fixed output structure.

Verify with `node tests/test_prompt_mentions.mjs`, `python -m unittest discover -s tests -p test_h3_prompt_mentions.py`, and `tests/prompt_mentions.browser.html`.

The media carousel accepts `allowLastFrame` and item `lastFrame` state; its bottom-right icon emits `media-edit` with action `last-frame`. In First+Last Frame mode the editor stores `last_frame_media_id` on the Clip, with undo and localized set/clear labels. Assigning a tail image moves it to the end when another enabled image supplies the first frame; a tail-only Clip keeps its order. H3 and Data Json Clip Parser honor that assignment independently of media order; a disabled assigned image is omitted. H3 also accepts a last-frame-only image. Without an assignment, existing ordered-image behavior is preserved.

## Clip Prompt Skills

H3 Auto Prompt Config selects `tail_name` directly and has no node-level enabled switch: Clip `auto_prompt` flags in `data_json` control generation. It outputs only `CAP_H3_AUTO_PROMPT_CONFIG`; connect it to H3 Video Generator, which executes automatic prompting with its own CLIP. There are no CLIP, data_json or tail_clip inputs and no standalone prompt generation node. Normal runs with a valid matching preview skip prompt generation before checking the tail or text generator; video refinement restores the saved preview snapshot. Missing/disabled/incompatible previews retain normal automatic generation. Explicit refinement and keyframe/long-video runs also skip text generation; new preview sampling still generates automatic prompts for ordinary Clips. Tests: `test_h3_shared_prompt.py`, `test_h3_drafts.py`.

Preview-version cards select playback across the card surface, excluding checkbox and action controls. The playing card uses the accent outline. Confirmed deletion recycles its video, latent and manifest on Windows; other platforms fail without permanent deletion. Deleted IDs are excluded when restoring editor history, so Ctrl+Z cannot revive their associations. “Associate existing folder” uses `cap-export-directory` inside `cap-dialog` to read restored versions for the current Clip from the H3 draft root or a single version directory. It validates file containment and requires both video and latent. Test file operations with `test_h3_draft_files.py`; the browser fixture covers card selection and disabled previews.

`PromptSkills.js` provides `<cap-prompt-skills>`. Call `configure(rows, disabled)` with `{id, name, text, enabled}` entries. It emits `skills-change` with copied `detail.rows`; the caller owns Clip binding, undo and project persistence. The component owns custom entry editing, enable switches, deletion, JSON export and atomic JSON/Markdown/TXT import. File contents are displayed as text. Preset selection remains in the existing Skill picker. Tests: `test_prompt_skills.mjs` and `test_h3_shared_prompt.py`.

The timeline preview mode dropdown opens on hover. Its `bindMenu` uses `primaryAction` for direct clicks to switch Clip/generated video; ArrowDown opens the menu for keyboard users. The menu toggles preview-version playback without changing saved Clip modes or output associations. It plays the latest enabled preview per director Clip, capped to Clip duration, and keeps timeline audio tracks while excluding finished-video audio. Tests: `test_draft_playback.mjs`.

Preview sampling management follows selected director Clips while open. Header arrows navigate director tracks in timeline order, select the target Clip, stop previous playback and reset the version selection. Boundary arrows are disabled; Clips without previews show the empty state. Non-director selections do not retarget it. Tests: `test_h3_draft_navigation.mjs`, `h3_drafts.browser.html`.

Keyframe preview versions carry their parent Clip ID and `keyframe_segment` range/trim metadata. The manager sorts them by Clip-relative start time and displays interval, part and `mm:ss.ff`; Generate HD queues the current Clip through keyframe interval confirmation. Normal generation matches preview latents by segment range and fps. Preview playback uses the latest enabled take for each non-overlapping segment and trims continuation frames. Preview batches retain separate continuation chains. Tests: `test_h3_drafts.py`, `test_h3_keyframe_runs.py`, `test_h3_video_generator.py`, `test_draft_playback.mjs`.


### Skill picker

`cap-skill-picker` shares the searchable preview gallery between Clip prompt management and the H3 auto prompt configuration node. `show(apiURL, boundSkills)` opens it; `setSkills(rows)` refreshes the catalog; `skill-select` carries `detail.skill`. Apply remains caller-owned. The footer adds/imports/exports local custom Skills, including optional GIF/MP4/WebM previews. Custom files live in the plugin's ignored `user_skills/skills` directory. Export includes custom Skills and supplied Clip bindings; import adds library entries without changing Clip bindings. `close()` stops video playback.

Verify with `tests/skill_picker.browser.html`, `node tests/test_prompt_skills.mjs`, and `test_h3_custom_skills.py`.

Skill picker regression fixture also covers revealing and focusing the New Skill form from a scrolled gallery, and bubbling file-input cancellation. `cap-dialog` handles only its native dialog cancel event; cancelling an embedded file input does not close the dialog.

`cap-select.setOptions([{value, label}], accessibleLabel)` creates and updates its native control internally, preserving a still-valid selection. Dynamic dialogs such as the project-version picker use this API instead of constructing unwrapped selects or duplicating control styles.


`VideoCrop.js` provides `<cap-video-crop>` with a slotted video. `configure(settings, crop, editable)` sets output dimensions, fit mode and per-clip `{zoom, x, y}` (zoom 1–4, normalized x/y 0–1). Drag or arrows reposition the crop frame; `crop-change` returns the updated crop. The video stays contained and fixed. Four corner handles resize the aspect-locked frame; +/- resize and Home resets it. Business code owns persistence; padding mode disables cropping.

`PanelDivider.js` provides `<cap-panel-divider>` for horizontal pane widths. `resize(px, notify=true)` clamps width and emits `panel-resize` with `detail.width`. Pointer capture and Left/Right keys adjust the right pane. `aria-label` localizes its name. Training source errors clear on successful selection; explicit Relink preserves validated source edits.

Reference audio/video trimming and generated-video trimming share a divider between the preview/timeline and settings panels. Drag it or use Left/Right while focused to adjust widths; the settings pane keeps a minimum width and is limited to half the available space.

Timeline Ctrl/Meta+wheel accumulates zoom until the next animation frame and retains the pointer pivot. Explicit setZoom and destroy cancel pending wheel work. Clip position updates avoid replacing unchanged duration text and color styles. TrainingDatasetEditor mounts clip elements only around its visible viewport; all Clip model objects remain in the track for geometry and data operations.

## Image comparison

`ImageCompare.js` provides `<cap-image-compare>`. Call `setImages(beforeUrl, afterUrl, beforeLabel, afterLabel)` to compare two contained images. The divider starts at the left edge, showing the new image; pointer dragging and range keyboard controls reveal the original on the left. Replacement previews use a resizable `cap-dialog` sized `80vw` by `80vh`. Closing releases pending object URLs.

Non-audio Clips support local keyframes and a “Clear all keyframes” context action. Local points persist in `clip.keyframes`; source-backed video keyframes retain their media metadata. Clip and main-track mute affect timeline playback and export, while the video badge previews the generated child timeline with its own mute and volume settings.

Director reference editing uses the shared child timeline, stored separately in `clip.reference_timeline`. It accepts multiple catalog video/audio assets. “Send each track to the model” defaults off: model input is one composed video, or one mixed audio when no video exists. When enabled, each reference track is composed separately. Project packaging remaps nested asset files through their catalog IDs.

The Run menu offers “Selected keyframe” for an unlocked H3 Clip with a selected marker. It queues only that marker’s interval through the existing keyframe-run path, ending at the next marker or Clip end, without the interval selection dialog.

Converting a media video Clip or track to director stores the existing file ID, source offset, duration and playback rate in its reference sub-timeline. Conversion creates no trimmed file or catalog asset; the original media metadata remains unchanged.

Generated prompt fill uses the same editor action in H3 preview versions and generated-video details. It saves nonempty original text to workflow prompt history before replacement, deduplicates identical history entries, and records undo. Clip results target the recorded Clip; keyframe results target the exact recorded interval start (new continuation records retain `interval_start_frame`). Missing/locked targets and conflicting prompts for the same target are skipped; filling unchanged text is a no-op. Older continuation records without an exact keyframe match cannot be filled. AI prompt generation in Prompt Manager also preserves the replaced Clip text through this action. Tests: `test_video_prompt_restore.mjs`, `test_h3_keyframe_runs.py`.
`H3DraftVersions` provides a Details button for every preview version. It opens the shared video details dialog with that version's saved prompt, seed and keyframe mapping, without requiring embedded MP4 metadata. Prompt fill uses the same history-preserving action as final video details. Opening details stops preview playback; closing details releases its video.

## Inline prompt editor

`InlinePromptEditor.js` provides `<cap-inline-prompt>`, an independent contenteditable editor. `configure(textarea, assets)` connects existing plain-text prompt storage/events and rich-prompt undo to the visible editor. References are inline `contenteditable="false"` tags in the prompt body, with shared danger × buttons and image/video hover previews. The previous external tag row is removed. Clipboard/export/generation use plain `@name` text, never tag HTML or × labels. The hidden textarea retains the caller's value/selection interface; disconnect restores it. Readonly/disabled fields and IME composition are supported. Arrow keys retain native cursor movement and Shift selection without bubbling into canvas shortcuts; the reference picker captures its own navigation while open. Remaining occurrences or keyframe references retain a Clip binding; undo restores removed references.

Run preparation also filters `prompt_media_ids` against uncommented active Clip, enabled global and keyframe prompts before queuing. Unreferenced or missing IDs are pruned from the queued snapshot and written back to the running Clips without changing library assets.

Verify with `tests/inline_prompt.browser.html`, `node tests/test_run_prompt_cleanup.mjs` and `node tests/test_rich_prompt.mjs`.

Preview sampling management scrolls the version list and playback/prompt column independently, preserving list position when selecting a version. Its Disable all previews action disables the displayed Clip/interval versions; the timeline More menu disables all unlocked director Clips’ preview versions. Both record one undo entry and retain preview files for browsing. Narrow dialogs stack two independently scrollable panes.

The selected keyframe settings emit `prompt-expand` to open the existing Clip prompt manager. Its Clip prompt tab becomes Keyframe prompt, reading/writing the captured point description; resource and global prompt tabs retain their usual scope. The full prompt uses the keyframe description in place of the Clip prompt. Clip navigation is disabled in keyframe mode. Closing or opening a normal Clip restores the normal scope.

Shared buttons with `role="menuitem"` or `role="menuitemcheckbox"` have no border or resting fill, including danger actions. Context menus in the toolbar and main/child track hover menus use this presentation; danger text and hover feedback remain red.

Running from keyframe prompt management queues only the captured keyframe interval, including draft sampling; the interval ends at the next keyframe or the Clip end. Clearing timeline selection while the dialog is open does not change this scope. Removed points and locked Clips do not queue a run.
