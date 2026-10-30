# rtf

RTF is text: control words, groups and plain text. The parser has two stages: a tokenizer and an interpreter that builds the document model. The reference is Microsoft's RTF 1.9.1 specification. Test material: `features.rtf`, `minimal.rtf`, `rtf-named.doc` and the `.rtf` samples.

## Tokenizer

- Tokens: `{`, `}`, control word (`\` + letters + optional signed number, ending at a space, which is consumed, or any other character, which is not), control symbol (`\` + one non-letter: `\\`, `\{`, `\}`, `\~` non-breaking space, `\-` optional hyphen, `\_` non-breaking hyphen, `\*`, `\'hh`), and text. CR and LF outside `\bin` data are ignored.
- `\'hh` is a byte in the current code page. `\binN` is followed by N raw bytes.
- The input is bytes; text bytes are decoded with `TextDecoder` for the current code page (consecutive bytes are decoded together, so double-byte code pages work).

## Interpreter state

- A stack of group states, pushed at `{` and popped at `}`. Each holds the destination, the character properties, the paragraph properties (in RTF these are carried by the group too) and `\ucN` (how many fallback characters to skip after `\uN`).
- `\uN` emits code point N (plus 65536 when negative), then skips the next `\uc` characters of fallback text (a `\'hh` counts as one).
- Code page: `\ansicpgN` sets the document's; a font with `\fcharsetN` uses the matching Windows code page while it is the current font (`\fcharset0` 1252, 2 Symbol, 128 932, 129 949, 134 936, 136 950, 161 1253, 162 1254, 177 1255, 178 1256, 186 1257, 204 1251, 222 874, 238 1250).

## Destinations

| Destination | Handling |
|---|---|
| `\fonttbl` | font index → name and charset |
| `\colortbl` | colour index → `#rrggbb`; the empty first entry is "auto" |
| `\stylesheet` | style index → name, `\sbasedonN`, `\outlinelevelN`, and the style's properties (applied when a paragraph uses `\sN`); headings follow the rule in `00-architecture.md` |
| `\info` | `\title` → model title; the rest skipped |
| `\listtable`, `\listoverridetable` | skipped; markers come from `\listtext` |
| `\listtext`, `\pntext` | the marker text for the paragraph, trimmed of spaces and the trailing `\tab`; `\ilvlN` (or the `\pnlvl` value) gives the level; ordered unless the marker is a bullet character (•, ◦, ▪, ■, ●, ○, -, or a Symbol or Wingdings character, mapped to • ◦ ▪) |
| `\field` | `\fldinst` read for `HYPERLINK "url"` (and `\l "bookmark"`); `\fldrslt` content emitted, as a link when the instruction is one |
| `\pict` | see Images |
| `\shppict` | used; the sibling `\nonshppict` is skipped |
| `\object` | only its `\result` is used |
| `\footnote` | a `Note`; its reference is the `\chftn` (or the custom text) just before it, numbered in order. A `\chftn` inside the footnote's own text repeats the label and is dropped. `\ftnalt` makes it an endnote |
| `\bkmkstart` | an `anchor` with the bookmark name |
| `\header*`, `\footer*`, `\annotation`, `\atnid`, `\shp`, `\shpinst`, `\do`, `\themedata`, `\colorschememapping`, `\latentstyles`, `\datastore`, `\xmlnstbl`, `\rsidtbl`, `\generator`, `\pgdsctbl` | skipped |
| any `{\* ...}` destination not listed | skipped |

## Character properties

`\plain` resets. `\b`, `\i`, `\strike`, `\striked1`, `\ul` (and every `\ul…` style except `\ulnone`), `\super`, `\sub`, `\nosupersub`, `\fsN` (half-points), `\fN`, `\cfN`, `\highlightN`, `\chcbpatN` (used as highlight when no `\highlight`), `\v` (hidden: text dropped), `\deleted` (dropped). A trailing `0` turns a toggle off (`\b0`).

## Paragraph properties

`\pard` resets (and leaves the table unless `\intbl` follows). `\ql`, `\qc`, `\qr`, `\qj`, `\liN`, `\riN`, `\fiN` (twips, `\lin`/`\rin` preferred when present), `\sbN`, `\saN`, `\slN` with `\slmult1` (multiple: N ÷ 240), `\sN` (style), `\outlinelevelN`, `\pagebb` (page break before). `\par` ends a paragraph, `\line` is a line break, `\tab` a tab, `\page` a page break, `\sect` a paragraph end.

## Tables

- `\trowd` starts a row definition: `\cellxN` (right boundaries in twips), with per-cell `\clmgf`/`\clmrg` (horizontal merge) and `\clvmgf`/`\clvmrg` (vertical merge) before each `\cellx`, `\clcbpatN` (background), `\trhdr` (header row).
- Paragraphs with `\intbl` belong to the current cell; `\cell` ends a cell, `\row` ends the row. Consecutive rows form one table until a paragraph without `\intbl`. The row definition (`\trowd` and its cell properties) comes before the row's cells; Word also repeats it just before `\row`, LibreOffice doesn't. The definition read last before `\row` applies to that row.
- Column spans come from the `\cellx` boundaries (the column grid rule in `00-architecture.md`); `\clmgf`/`\clmrg` are also honoured. Vertical merges from `\clvmgf`/`\clvmrg` become `rowSpan`.
- Nested tables (`\itapN`, `\nestcell`, `\nestrow`, `\nesttableprops`) are built as tables inside cells.

## Images

- `\pict` with `\pngblip`, `\jpegblip` → image; `\dibitmap` → BMP (add a file header); `\wmetafile`, `\emfblip`, `\macpict` and anything else → placeholder.
- Data is hex digits (whitespace ignored) or `\bin` bytes.
- Size: `\picwgoalN` and `\pichgoalN` (twips) scaled by `\picscalexN` and `\picscaleyN` (percent); without goals, `\picwN` and `\pichN` (pixels for bitmaps).

## Page

`\paperwN`, `\paperhN`, `\marglN`, `\margrN`, `\margtN`, `\margbN` (twips), document-level. Missing values use A4 portrait with 2.54 cm margins.

## Rules the parser adds

- **Input check.** The bytes must start with `{\rtf` after white space or a byte-order mark, otherwise the file is `corrupt`. Groups nested deeper than 1000 levels are `corrupt`. If the input ends with groups still open, the parser closes them and keeps what it read, unless nothing was read yet (cut off in the header), which is `corrupt`. Closing braces beyond the root group, and anything after it, are ignored.
- **Code pages.** `\ansicpgN` sets the document code page; `\mac` is 10000. `TextDecoder` does not know code pages 437 (`\pc`) and 850 (`\pca`), so those are read as 1252. A font with `\fcharset0` (or an unknown charset) uses the document code page. Bytes in a Symbol or Wingdings font (`\fcharset2`) become private-use characters (U+F000 plus the byte), the same characters `\u` gives for them; the bullet rule maps them to • ◦ ▪.
- **Fallback after `\u`.** The `\ucN` characters to skip are counted over text bytes and `\'hh` escapes that follow directly; any other token ends the skipping.
- **Character properties.** Style properties come first, then a character style (`\csN`), then the direct properties; `\plain` clears the direct ones only, so a paragraph style's formatting survives it. The font family and the size are always set from the font table and `\fs` (12 pt when nothing sets one, `\deffN` for the font); only a size of 11 pt, the renderers' own, leaves `fontSizePt` out. `\ulc` is the underline colour, not an underline.
- **Headings.** `\outlinelevelN` is 0-based: 0 is level 1, and 9 (body text) is no heading. The style names for the heading rule come from the paragraph style and the styles it is based on.
- **Paragraph ends.** `\par` always ends a paragraph, even an empty one. `\sect` and `\page` end the current paragraph only when it has content, `\page` then adds a page break, and an empty `\par` directly after a `\page` adds no paragraph. A paragraph without a `\par` at the end of a group or the document is kept. `\pagebb` and `\page` inside a table, and page breaks inside notes, are ignored.
- **Footnotes.** The reference is made where the `\footnote` group starts (the `\chftn` before it only marks that spot); a custom mark is not kept, the note is numbered like the others. `\ftnalt` makes no difference, since the model shows every note at the end. Leading white space in the note text, the gap after the label, is removed, and so is an empty last paragraph.
- **Lists.** A `\listtext` or `\pntext` that is empty after trimming gives no list. The level is `\ilvlN` of the paragraph, else the `\pnlvlN` (1-based) of the `\pn` group, else 0.
- **Tables.** A cell with no `\cellx` (more `\cell` than `\cellx`) gets a made-up boundary half an inch further right. A `\clmrg` cell is folded into the cell before it, and its content is kept only if it is not empty; the merged cell spans the grid columns of all the cells it covers. A `\clvmrg` cell without a `\clvmgf` cell above it is an ordinary cell. A cell ended by `\cell` with nothing in it holds one empty paragraph. `\row` ends a cell that was left open. Cell widths are the sum of the columns they span.
- **Page.** The first `\paperw`, `\paperh`, `\margl`, `\margr`, `\margt` and `\margb` win; later ones belong to other sections.
- **Images.** The size is the goal times the scale; without a goal, `\picw` and `\pich` (pixels for bitmaps, 0.01 mm for metafiles). A picture with no size and no displayable data is left out. Data of PNG, JPEG and DIB pictures is used as it is (hex or `\bin`), a DIB gets a BMP file header.
