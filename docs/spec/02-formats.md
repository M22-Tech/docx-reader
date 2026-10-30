# Formats

## Detection

The format comes from the file's first bytes and container contents, checked in this order:

| Contents | Format |
|---|---|
| Zip archive with `word/document.xml` (found through `[Content_Types].xml`) | docx |
| Zip archive whose `mimetype` entry is `application/vnd.oasis.opendocument.text` or `...text-template` | odt |
| Any other zip archive | `unsupported_format` |
| OLE compound file with an `EncryptedPackage` stream | `encrypted` (a password-protected docx) |
| OLE compound file with a `WordDocument` stream | doc (encrypted, Word 6/95 and other checks happen in the doc parser) |
| Any other OLE compound file | `unsupported_format` |
| Starts with `{\rtf` (after optional whitespace or a byte-order mark) | rtf |
| Starts with `<html`, `<!DOCTYPE html` or an XML declaration followed by `<html` (case-insensitive, after optional whitespace or a byte-order mark) | html (Word and many websites save HTML with a `.doc` name) |
| Anything else | `unsupported_format` |

A zip archive that can't be opened, or that is missing the part its type needs, is `corrupt`.

## Supported formats

| Format | Extensions | MIME types the app registers for |
|---|---|---|
| docx | `.docx`, `.docm`, `.dotx`, `.dotm` | `application/vnd.openxmlformats-officedocument.wordprocessingml.document`, `...wordprocessingml.template`, `application/vnd.ms-word.document.macroEnabled.12`, `application/vnd.ms-word.template.macroEnabled.12` |
| doc | `.doc`, `.dot` | `application/msword`, `application/vnd.ms-word` |
| rtf | `.rtf` | `application/rtf`, `text/rtf` |
| odt | `.odt`, `.ott` | `application/vnd.oasis.opendocument.text`, `application/vnd.oasis.opendocument.text-template` |
| html | only when found inside a file with one of the extensions above | none |

Macros in `.docm` and `.dotm` files are never run; the documents are shown like `.docx`.

## What each mode shows

Both modes show the main text with bold, italic, underline, strikethrough, superscript and subscript, headings, paragraphs, line and page breaks, tabs (as space), bulleted and numbered lists with their numbers, tables (including merged cells), inline images, links and footnotes. Text in any script displays (Hindi, Bengali and so on use the device's fonts).

| | docx | doc, rtf, odt | html |
|---|---|---|---|
| Layout: page width, margins, fonts, sizes, colours, highlight, alignment, indents, spacing | yes | yes | Reading only |
| Layout: real page breaks, page size, headers and footers, page numbers | yes | no: one continuous page at the document's page width, page breaks drawn as a divider | |
| Footnotes | Layout: at the foot of each page; Reading: at the end | at the end of the document, numbered, linked both ways | |
| Comments, tracked changes | final text only (insertions kept, deletions hidden, comments hidden) | same | |
| Text boxes, shapes, WordArt, charts, SmartArt, equations | the text inside where the library provides it, otherwise left out | left out | |
| Images: PNG, JPEG, GIF, BMP | yes | yes | only images embedded in the file (`data:` URLs) |
| Images: WMF, EMF, TIFF and other formats | a placeholder box with "Image not shown" at the image's size | same | |
| Linked images (stored outside the file) | not loaded (privacy); placeholder box | same | not loaded; placeholder box |
| Embedded objects (another document or spreadsheet inside) | the object's preview image if there is one, otherwise left out | same | |

- **docx** uses two different libraries for the two modes (`CLAUDE.md`), so small differences between modes are expected: Reading keeps structure (headings, lists, tables, emphasis), Layout keeps appearance.
- **doc** covers Word 97 to 2003 files, including those saved by LibreOffice, Google Docs and WPS. Word 6 and Word 95 files give `unsupported_version`; files encrypted with a password give `encrypted`. "Fast saved" files are read correctly.
- **rtf** covers the RTF written by Word, WordPad, LibreOffice and macOS TextEdit: text and paragraph formatting, fonts and colour tables, Unicode (`\u`) and code-page text, lists (`\listtext` and `\pntext`), tables (`\trowd ... \row`, merged cells), `\pict` images, `HYPERLINK` fields, footnotes and page breaks. Headers and footers are left out.
- **odt** covers ODF 1.2 and later text documents, including those saved by Word and Google Docs: automatic and named styles (inheritance included), lists, tables (`table:number-columns-spanned` and `...rows-spanned`), images in `Pictures/`, links, footnotes and endnotes, page size from the default page layout. Headers and footers are left out.
- **html** (an HTML file with a `.doc`-style name) is shown in Reading mode only, after sanitising: scripts, styles that load anything, forms and remote images are removed. The mode toggle is hidden for it.
