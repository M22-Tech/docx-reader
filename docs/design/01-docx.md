# docx

docx (and `.docm`, `.dotx`, `.dotm`) is a zip of XML parts. It is the one format read with existing libraries, one per mode.

## Layout: docx-preview

- `renderAsync(bytes, container, styleContainer, options)` into a detached element, then sanitised (Layout profile) and attached.
- Options: `inWrapper: true`, `breakPages: true`, `ignoreWidth: false`, `ignoreHeight: false`, `ignoreFonts: false`, `renderHeaders: true`, `renderFooters: true`, `renderFootnotes: true`, `renderEndnotes: true`, `renderComments: false`, `renderChanges: false` (final text: insertions kept, deletions hidden), `useBase64URL: true` (images as `data:` URLs), `experimental: false`, `className: 'docx'`.
- The viewer renders into a hidden container, so nothing can be measured. The page width for the viewport is read from the inline `width` of the first `section.docx` element in the detached render (docx-preview writes it in `pt`; `px`, `mm`, `cm` and `in` are also accepted), converted at 96 dpi and rounded. When it is missing or unreadable the width is 794 px (A4).
- `docx.css` (imported by the viewer's `main.ts`) overrides docx-preview's own stylesheet inside `.dr-layout-view`: `.docx-wrapper` has no background and no padding, and `section.docx` pages have no shadow, are centred and have a 16 px gap between them. The canvas behind them is the page's theme colour.
- Fonts the document names but the device lacks fall back to the device's fonts. Embedded fonts (obfuscated in the zip) load through `blob:` URLs, which the CSP allows.

## Reading: mammoth

- `convertToHtml({ arrayBuffer }, options)` from mammoth's prebuilt browser bundle (`mammoth/mammoth.browser.min.js`; the Node entry wants a `Buffer` and does not run in unit tests), wrapped in `<div class="dr-reading">` and then sanitised (Reading profile).
- Options: the default style map (Heading 1 to 6 to `h1` to `h6`), plus `p[style-name='Title'] => h1:fresh` (mammoth's default map has no Title) and `p[style-name='Subtitle'] => h2:fresh`; `includeDefaultStyleMap: true`; images converted to `data:` URLs (mammoth's default `imgElement` with base64); `ignoreEmptyParagraphs: true`.
- mammoth puts footnotes and endnotes at the end as an ordered list with links both ways; the page styles them as the notes section.
- mammoth's warnings are logged at debug (never their text content).
- Images in formats the web view can't show (WMF, EMF, TIFF) are replaced with the placeholder by the sanitiser, which checks the `data:` MIME type.

## Fallbacks

- If one library throws, the adapter reports that mode as unavailable and the viewer opens the other one with the note from `docs/spec/03-viewer.md`. If both throw, the error is `corrupt`.
- Strict OOXML documents (ISO 29500 strict namespaces) are not handled specially; if a library can't read one, the fallback rules apply.
