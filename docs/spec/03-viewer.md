# Viewer

## Screen

- The header shows a back button, the document's file name (one line, cut with "…" in the middle so the extension stays visible), the text size buttons (Reading mode only) and the mode toggle.
- The document fills the rest of the screen and scrolls vertically. While it renders, a spinner shows in the middle; the header works meanwhile, so back cancels the open.
- The Android back gesture does the same as the back button.

## Modes

- The mode toggle switches between Layout and Reading. Its icon shows the mode it switches to, and its label says so ("Switch to Reading mode").
- Switching keeps the reading position roughly: the paragraph at the top of the screen before the switch is brought to the top after it.
- The default mode for new documents is a setting (`04-look-and-settings.md`). A switch applies to the open document only.
- When only one mode is available for a document (html, or a docx whose Layout failed, see Errors), the toggle is hidden.

### Layout mode

- The page is drawn at the document's page width and scaled to fit the screen width. Two-finger pinch zooms in up to 4x and back out to fit; double tap toggles between fit and 2x.
- Pages are white with the document's own colours, on a canvas that follows the app theme (paper in light mode, a dark grey in dark mode). docx pages are separated by a gap; doc, rtf and odt show one continuous page with page breaks drawn as a dashed line.
- If a document has no page size (html never reaches Layout; some RTF and odt files omit it), A4 portrait with 2.54 cm margins is used.

### Reading mode

- Text follows the app theme: ink on paper, in the reading font style (serif or sans, a setting), using the device's serif or sans-serif font so every script displays.
- Text size: the "Smaller text" and "Larger text" buttons step through 14, 16, 18, 20, 22, 24, 28 and 32 px (default 18). The chosen size is saved as a setting and applies to every document. A button is disabled at its end of the range.
- Pinch zoom is off; content is never wider than the screen, except tables, which scroll sideways inside their own box when they don't fit.
- Images are shown at their size, scaled down to the screen width when larger.
- Headings keep their levels (sizes relative to the text size). Paragraph alignment is kept only for centred and right-aligned paragraphs; justified text is shown left-aligned.

## Links

- Pressing a link inside the document opens a confirmation: "Open this link in your browser?" with the full address and "Open" / "Cancel". Open hands the address to the device's browser; the app itself never loads anything.
- Only `http`, `https` and `mailto` links can be opened. Other links (file paths, `javascript:`, internal bookmarks to places that don't exist) do nothing.
- Links to a place inside the document (bookmarks, footnote references) scroll to it without a confirmation.

## Errors while rendering

- A format error found while rendering (`corrupt`, `encrypted`, `unsupported_version`) replaces the document area with the error card (`01-opening-files.md`) and a back button.
- If docx Layout fails but Reading works, the document opens in Reading with a one-line note above it: "Layout isn't available for this document." The toggle is hidden for it. The same applies the other way round.
- Parts of a document the engine can't show are left out silently, except images (placeholder, `02-formats.md`). A document is never refused because one part is unsupported.
- Rendering that takes longer than 20 seconds stops and shows "This document took too long to open." with a back button.
