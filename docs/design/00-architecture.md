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
3. **Viewer screen.** The web view loads the page, which posts `ready`. The app reads the copy as base64 and posts `open` with the name, the bytes, the mode and the settings. Files over `largeFileWarningMb` show the warning line from the spec meanwhile.
4. **Render.** The page decodes the base64 to a `Uint8Array`, calls `detect()`, picks the adapter and renders the mode. It then posts `rendered` (format, mode, `durationMs`, whether the other mode is available) or `error` (a code from the spec and a message).
5. **Timeout and crashes.** The app starts a timer when it posts `open` (`renderTimeoutSeconds`). If no answer comes in time it shows `timeout`. If the web view's renderer process dies (`onRenderProcessGone`, usually out of memory) it shows `too_large` and offers back.

## Switching modes

- The app posts `setMode`. The page keeps what it needs to switch without starting over: for doc, rtf and odt the parsed document model (both modes render from it); for docx the bytes (each mode uses its own library). The first switch renders the other mode; later switches reuse both rendered results, shown and hidden.
- Reading position: before switching, the page finds the first block whose top is at or below the top of the screen. Both model renderers put `data-block="<index>"` on every top-level block, so for doc, rtf and odt the page scrolls to the same index afterwards. docx's two libraries don't share block indices, so it keeps the scroll position as a fraction of the page height instead.
- `setSettings` (theme, text size, font style) only changes CSS variables and classes on the page; nothing is re-rendered.

## Rendering

- **Layout**: the page sets the viewport width to the document's page width in CSS pixels (`widthMm × 96 / 25.4`), so the web view scales the page to fit the screen and native pinch zoom works (`user-scalable=yes`, maximum scale 4). docx uses `docx-preview`'s pages. The others use the model's Layout renderer: one white sheet at page width with page margins as padding, inline styles for fonts, sizes, colours, alignment, indents and spacing, and a dashed line for each page break.
- **Reading**: the viewport is `width=device-width` with zoom off. The content is semantic HTML (headings, paragraphs, lists, tables, figures, links, footnotes) styled only by the page's Reading stylesheet, which uses the CSS variables `--ink`, `--paper`, `--text-size` and `--font` (`serif` or `sans-serif`). Tables sit in a wrapper with `overflow-x: auto`.
- **Sanitising**: every HTML string passes through DOMPurify with one of two profiles. Layout allows `style` attributes and the `<style>` elements docx-preview generates. Reading drops all `style` and `class` attributes except the page's own. Both drop scripts, event handlers, forms, iframes, objects and any `src` or `href` that isn't `data:`, `blob:`, `#…`, `http(s):` or `mailto:`. `http(s)` and `mailto` links are rewritten so tapping one posts `openLink` instead of navigating. Remote and file images are replaced with the placeholder box.
- **Security net**: the page's Content-Security-Policy is `default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data: blob:`. The web view also blocks every navigation away from the initial page (`onShouldStartLoadWithRequest`).

## The document model

doc, rtf and odt parsers produce the same structure (`engine/src/model/document-model.ts`): optional page setup, a list of blocks (paragraphs, tables, page breaks), and notes. Paragraphs hold inlines: text runs with marks, line breaks, tabs, images, links, note references and anchors (bookmark targets). The model holds final values only: list markers are already computed ("3.", "b)", "•"), styles already resolved, hidden and deleted text already removed. That keeps the renderers simple and makes parser tests assert on plain data.

Mapping rules shared by all parsers:
- Lengths are converted to millimetres for page and indent values, points for spacing and font size, CSS pixels at 96 dpi for image sizes.
- Colours are `#rrggbb`; "auto" colours are left unset.
- A run's marks are only the ones that differ from defaults; renderers merge adjacent runs with equal marks.
- Headings: a paragraph is a heading when its style is a built-in heading style or its outline level is 1 to 6 (levels 7 to 9 become 6).
- Unknown or unsupported content is skipped; an image whose format the page can't show keeps its size with no `src` (placeholder).

## Storage

- Settings and the recent list are JSON in AsyncStorage under the keys `setting` and `recent`, validated with zod on read (a value that fails validation is replaced by defaults).
- A recent entry: `{ id, name, sizeBytes, sha256, format, openedAt, path }`. `format` is filled in from the `rendered` message.
- Private copies are excluded from Android backup by a config plugin that writes `dataExtractionRules` and `fullBackupContent` rules for the `recent/` folder.

## Decisions

- **No LibreOffice on the device.** Bundling it would make the app hundreds of megabytes; a server would break the privacy promise.
- **A web view rather than native rendering.** Documents map naturally to HTML and CSS, the same page can run on iOS later, and the engine can be tested in a desktop browser.
- **docx through libraries, the rest through our own parsers.** `docx-preview` and `mammoth` are mature and permissively licensed. For RTF, `rtf.js` flattened tables, ignored alignment and dropped footnotes in a test, and WebODF (odt) is AGPL and unmaintained, so those formats get parsers of our own. There is no maintained JavaScript library for .doc formatting; Apache POI is Java and would not run on iOS.
- **One model for doc, rtf and odt.** One pair of renderers, consistent output, and parser tests that don't depend on HTML.
- **Bytes as base64 in one message.** Simple and fast enough for documents (a few MB); avoids giving the page file access. Large files are warned about rather than refused.
- **No internet permission in release builds.** The strongest privacy guarantee available, visible on the Play Store.
