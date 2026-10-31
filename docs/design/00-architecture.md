# Architecture

How the app works inside. Product behaviour is in `docs/spec/`; this folder explains how it is built and why. The format files (`01-docx.md` to `04-odt.md`) describe each parser.

## Components

- **App** (`app/`, Expo): screens, opening files, private copies, recent files, settings, and the viewer screen that hosts a web view. It never parses documents.
- **Viewer page** (`engine/`, built to one self-contained `viewer.html`): runs inside the web view. It receives the file's bytes, detects the format, renders it in the requested mode, and reports back. It has no access to the file system or the network.
- **Engine modules** inside the page: `detect/`, one adapter per format under `formats/`, the document model and its renderers under `model/`, and `sanitize/`.

The page is built once with Vite into a single HTML file with all scripts and styles inlined. `npm run engine:sync` in `app/` turns it into a generated TypeScript module (`app/src/viewer/generated/viewer-html.ts`, a string export) and copies the bridge message types, so the web view loads it with `source={{ html }}` and there are no asset files or file URLs to manage.

## Opening a document

1. **Arrival.** An Android `VIEW` intent (Open with), a `SEND` intent (share, through `expo-share-intent`) or the document picker gives the app a `content://` URI. Expo Router's `+native-intent.tsx` turns an incoming `VIEW` URI into the route `/viewer?source=<uri>` instead of treating it as a deep link.
2. **Private copy.** The app copies the file into its own storage with `expo-file-system` (`File.copy`): `<documents>/recent/<id>.<ext>` when recent files are kept, `<cache>/open/<id>.<ext>` otherwise. The copy happens before anything else, because the source app's read permission can expire as soon as the activity changes. `id` is a random base36 string. The SHA-256 of the bytes (`expo-crypto`) is stored with the recent entry to spot the same file opened again.
3. **Viewer screen.** The web view loads the page, which posts `ready`. The app reads the copy as base64 and posts `open` with the name, the bytes, the mode and the settings. Files over `LARGE_FILE_WARNING_MB` (`app/src/config/constants.ts`) show the warning line from the spec meanwhile.
4. **Render.** The page decodes the base64 to a `Uint8Array`, calls `detect()`, picks the adapter and renders the mode. It then posts `rendered` (format, mode, `durationMs`, whether the other mode is available) or `error` (a code from the spec and a message).
5. **Timeout and crashes.** The app starts a timer when it posts `open` (the render timeout in `04-look-and-settings.md`). If no answer comes in time it shows `timeout`. If the web view's renderer process dies (`onRenderProcessGone`, usually out of memory) it shows `too_large` and offers back.

## Switching modes

- The bridge's modes are `raw` and `rendered`. For documents (docx, doc, rtf, odt) Raw is the page as Word shows it; for source formats (html; Markdown later) Raw is the source text. Rendered is the reflowed content for both.

- The app posts `setMode`. The page keeps what it needs to switch without starting over: for doc, rtf and odt the parsed document model (both modes render from it); for docx the bytes (each mode uses its own library). The first switch renders the other mode; later switches reuse both rendered results, shown and hidden.
- Reading position: before switching, the page finds the first block whose top is at or below the top of the screen. Both model renderers put `data-block="<index>"` on every top-level block, so for doc, rtf and odt the page scrolls to the same index afterwards. docx's two libraries don't share block indices, so it keeps the scroll position as a fraction of the page height instead, and so does switching between a source view and its preview.
- `setSettings` (theme, text size, font style) only changes CSS variables and classes on the page; nothing is re-rendered.

## Rendering

- **Raw, documents**: the page sets the viewport width to the document's page width in CSS pixels (`widthMm × 96 / 25.4`), so the web view scales the page to fit the screen and native pinch zoom works (`user-scalable=yes`, maximum scale 4). docx uses `docx-preview`'s pages. The others use the model's Raw renderer: one white sheet at page width with page margins as padding, inline styles for fonts, sizes, colours, alignment, indents and spacing, and a dashed line for each page break.
- **Raw, source formats**: the decoded text (the same decoding the format's Rendered renderer uses) in `<pre class="dr-source">`, escaped, with `white-space: pre-wrap` and `overflow-wrap: anywhere`, in the device's monospace font at `--text-size`, using `--ink` and `--paper`. The viewport is the same as Rendered's (below). It never goes through a parser or the sanitiser as HTML, so nothing in it can run or load.
- **Rendered**: the viewport is `width=device-width` with zoom off. The content is semantic HTML (headings, paragraphs, lists, tables, figures, links, footnotes) styled only by the page's Rendered stylesheet, which uses the CSS variables `--ink`, `--paper`, `--text-size` and `--font` (`serif` or `sans-serif`). Tables sit in a wrapper with `overflow-x: auto`.
- **Sanitising**: every HTML string passes through `sanitize/` before it is inserted (see Sanitising below).
- **Security net**: the page's Content-Security-Policy is `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:`. The web view also blocks every navigation away from the initial page (`onShouldStartLoadWithRequest`).

## Viewer page

- **Transport.** The page sends with `window.ReactNativeWebView.postMessage(json)` when that exists (inside the app), otherwise with `window.parent.postMessage(json, '*')` (the dev harness, which embeds the page in an iframe). It receives `message` events on both `window` and `document` (the web view uses either, depending on the platform). Every message is a JSON string validated with the bridge schemas; anything else is ignored.
- **Opening.** Each `open` aborts the previous one (an `AbortController`; a stale result is discarded). The page decodes the base64 in chunks, calls `detect()`, picks the adapter from `formats/registry.ts`, and renders the requested mode, or the other mode when the adapter has only that one. Adapters return Rendered HTML wrapped in `<div class="dr-rendered">`; Raw renderers draw into a container and return `{ pageWidthPx }` (none for source text).
- **Fallback.** If the requested mode throws and the error is not `encrypted` or `unsupported_version`, the page tries the other mode; when that works it shows the note bar "Raw mode isn't available for this document." (or "Rendered mode isn't available for this document.") and reports `otherModeAvailable: false`. A `DocumentError` is reported with its code; any other exception from a parser or library is reported as `corrupt`, with details logged at debug.
- **Modes.** Each mode renders into its own container (`.dr-raw-view`, `.dr-rendered-view`) the first time it is shown and is then kept; switching shows one and hides the other, sets the viewport meta (Raw for documents: `width=<pageWidthPx>, user-scalable=yes, maximum-scale=4`; Raw for source formats and Rendered: `width=device-width, initial-scale=1, user-scalable=no`) and restores the reading position (see Switching modes).
- **Theme.** `setSettings` writes CSS variables on `:root`: `--ink`, `--paper`, `--canvas` (the paper colour; the Raw sheet stays white on it), `--text-size` (px) and `--font` (`serif` or `sans-serif`), and sets `color-scheme`. Nothing is re-rendered.
- **Links.** One click handler on the document: `.dr-link` (and Enter on a focused one) posts `openLink` with its `data-external-href`; an `a[href^="#"]` scrolls to the element whose id is the decoded fragment; every other link click is cancelled. The page never navigates.
- **CSP.** The strict policy (`05-privacy.md`) is added to `viewer.html` by a Vite plugin at build time only; the dev server serves the page with a policy that allows its own module scripts and hot reload.
- **Dev harness.** `engine/dev/harness.html`, served by `npm run dev`, plays the app: it embeds the viewer in an iframe and has a file picker, mode, theme and text size controls and a log of the page's messages. Files never leave the browser.

## The document model

doc, rtf and odt parsers produce the same structure (`engine/src/model/document-model.ts`): optional page setup, a list of blocks (paragraphs, tables, page breaks), and notes. Paragraphs hold inlines: text runs with marks, line breaks, tabs, images, links, note references and anchors (bookmark targets). The model holds final values only: list markers are already computed ("3.", "b)", "•"), styles already resolved, hidden and deleted text already removed. That keeps the renderers simple and makes parser tests assert on plain data.

Mapping rules shared by all parsers:
- Lengths are converted to millimetres for page and indent values, points for spacing and font size, CSS pixels at 96 dpi for image sizes.
- Colours are `#rrggbb`; "auto" colours are left unset.
- A run's marks are only the ones that differ from defaults; renderers merge adjacent runs with equal marks.
- Headings: a paragraph is a heading when its outline level is 1 to 6 (levels 7 to 9 become 6), or else when its style, or a style it is based on, is named "Heading 1" to "Heading 9" (case-insensitive; 7 to 9 become 6), "Title" (level 1) or "Subtitle" (level 2), the same mapping docx Rendered uses. Files converted by LibreOffice and Word often carry only the style name.
- Table columns: when rows give their cells as right-hand boundaries (RTF `\cellx`, doc `rgdxaCenter`), the table's columns are the sorted set of all boundaries across its rows, and a cell spans as many columns as its boundaries cover. That is how a horizontally merged cell is usually written.
- Unknown or unsupported content is skipped; an image whose format the page can't show keeps its size with no `src` (placeholder).

## Model renderers

`renderRaw(model)` and `renderRendered(model)` in `engine/src/model/` turn the document model into HTML strings. They escape every text and attribute value themselves, even though the sanitiser runs afterwards. Class names all start with `dr-`, and the page's stylesheets (`raw.css`, `rendered.css` next to the renderers) are written against them.

| Model | Raw | Rendered |
|---|---|---|
| document | `<div class="dr-sheet">` at the page width in `mm`, page margins as padding, white background, default text 11pt sans-serif in black; returns `{ html, pageWidthPx }` | `<div class="dr-rendered">` |
| top-level block | carries `data-block="<index>"` | same |
| paragraph | `<p>`, or `<h1>`…`<h6>` with class `dr-h` (whose sizes come from the runs); inline style for alignment, indents (`mm`), spacing (`pt`) and line height; margins 0 unless the model sets them; an empty paragraph holds a `<br>` so it keeps its height | `<p>` or `<h1>`…`<h6>`; class `dr-center` or `dr-right` for those alignments only; no other paragraph formatting; empty paragraphs are left out |
| list paragraph | the same paragraph with class `dr-li`, starting with `<span class="dr-marker">` holding the model's marker; the parser's indents position it | `<p class="dr-li" data-level="<level>">` with the marker span; `rendered.css` indents by level |
| text run | `<strong>`, `<em>`, `<u>`, `<s>`, `<sup>`, `<sub>` for the marks, wrapped in `<span style>` for colour, highlight (`background-color`), font family and size | the same tags, no span |
| line break, tab | `<br>`; `<span class="dr-tab"></span>` (a fixed-width gap) | `<br>`; a space |
| image | `<img src="data:…;base64,…" width height alt>` at its size, never wider than the sheet | the same, scaled down to the screen width |
| image without `src` | `<span class="dr-placeholder">Image not shown</span>` sized to the image | the same, never wider than the screen |
| link | `<a href>`; `#id` becomes `#dr-bm-<id>` | same |
| anchor | `<a id="dr-bm-<id>" class="dr-anchor"></a>` (the prefix keeps document ids from clashing with the page's own) | same |
| note reference | `<sup class="dr-noteref"><a id="dr-noteref-<id>" href="#dr-note-<id>">label</a></sup>` (the id only on a note's first reference) | same |
| notes | after the last block: `<section class="dr-notes">`, each `<div class="dr-note" id="dr-note-<id>">` starting with `<a class="dr-note-label" href="#dr-noteref-<id>">label</a>`, then its blocks | same |
| page break | `<hr class="dr-page-break">` (dashed) | the same, drawn lighter |
| table | `<div class="dr-table-wrap"><table>` with `<colgroup>` widths in `mm`; header rows in `<thead>` with `<th>` cells; `colspan`, `rowspan`; cell width and background as inline style; cell blocks rendered the same way, so nested tables work | the same without widths or backgrounds; the wrapper scrolls sideways |

Values go into styles only after checks: colours must match `#rrggbb`, font family names lose quotes, backslashes, semicolons and braces, and numbers must be finite. A value that fails is left out. Image data is turned into base64 in chunks so large images don't overflow the call stack.

## Sanitising

`engine/src/sanitize/` holds two DOMPurify instances, one per mode, each with its own configuration and hooks (hooks are per instance). Both take an HTML string and return a string.

- **Both**: HTML profile only (no SVG or MathML). No `script`, `style` (Rendered), `iframe`, `frame`, `object`, `embed`, `form`, `input`, `button`, `textarea`, `select`, `link`, `meta`, `base`, `audio`, `video`, `source`, `template`, and no event handler attributes.
- **Images**: an `img` whose `src` is not `data:image/png`, `jpeg`, `gif`, `bmp` or `webp` (base64), or `blob:`, is replaced by the placeholder span, keeping its `width` and `height`. `data:image/svg+xml` counts as not allowed, since SVG can carry script.
- **Links**: `href="#…"` stays. `http:`, `https:` and `mailto:` hrefs move to `data-external-href`, the `href` is removed, and the element gets class `dr-link`, `role="link"` and `tabindex="0"`; the viewer turns a tap on it into `openLink`. Any other `href` (`javascript:`, `file:`, `data:`, relative paths) is removed and the text kept. `target` and `ping` are removed.
- **Raw**: keeps `class`, `id` and `style` attributes and `<style>` elements (docx-preview writes its styles that way). In both, any `url(…)` that isn't `data:` or `blob:` is replaced with `none`, and `@import` rules are removed.
- **Rendered**: an allow-list of tags: `p`, `h1`–`h6`, `strong`, `b`, `em`, `i`, `u`, `s`, `sup`, `sub`, `br`, `hr`, `a`, `img`, `span`, `div`, `section`, `table`, `thead`, `tbody`, `tfoot`, `tr`, `td`, `th`, `caption`, `ul`, `ol`, `li`, `blockquote`, `pre`, `code`, `figure`, `figcaption`. Others are removed with their content kept. No `style` attributes; only `dr-` classes stay; `id`, `colspan`, `rowspan`, `width`, `height`, `alt`, `href`, `src`, `role`, `tabindex` and `data-*` attributes stay.

## Storage

- Settings are JSON in AsyncStorage under the key `setting`, validated with zod on read (a value that fails validation is replaced by defaults).
- The recent list is JSON in `<documents>/recent/recent.json`, next to the copies, validated the same way. It isn't in AsyncStorage because AsyncStorage is one database that Android backs up whole, and file names can be as private as the documents.
- A recent entry: `{ id, name, sizeBytes, sha256, format, openedAt, path }`. `format` is filled in from the `rendered` message.
- A config plugin writes `dataExtractionRules` (Android 12 and later) and `fullBackupContent` (older versions) rules that exclude the `recent/` folder, so neither the copies nor the list are backed up or moved to a new phone; settings are.

## Decisions

- **No LibreOffice on the device.** Bundling it would make the app hundreds of megabytes; a server would break the privacy promise.
- **A web view rather than native rendering.** Documents map naturally to HTML and CSS, the same page can run on iOS later, and the engine can be tested in a desktop browser.
- **docx through libraries, the rest through our own parsers.** `docx-preview` and `mammoth` are mature and permissively licensed. For RTF, `rtf.js` flattened tables, ignored alignment and dropped footnotes in a test, and WebODF (odt) is AGPL and unmaintained, so those formats get parsers of our own. There is no maintained JavaScript library for .doc formatting; Apache POI is Java and would not run on iOS.
- **One model for doc, rtf and odt.** One pair of renderers, consistent output, and parser tests that don't depend on HTML.
- **Bytes as base64 in one message.** Simple and fast enough for documents (a few MB); avoids giving the page file access. Large files are warned about rather than refused.
- **No internet permission in release builds.** The strongest privacy guarantee available, visible on the Play Store.
