# doc (Word 97 to 2003)

The binary Word format, defined in Microsoft's [MS-DOC] specification (publicly available). The parser follows [MS-DOC] for every structure named here; field names below are the specification's, so they can be looked up there. Offsets inside the FIB vary by version and must be read from the specification, never guessed. The `features.doc` and `minimal.doc` fixtures (saved by LibreOffice) and the `.doc` samples are the test material.

The parser is split into stages, each a pure function with its own tests: container, FIB, text, formatting, structure (tables, lists), extras (images, links, notes), and the final model build.

## Container

- The file is an OLE compound file, opened with `cfb`. Streams used: `WordDocument` (the FIB, text and formatting pages), `0Table` or `1Table` (which one is given by `FibBase.fWhichTblStm`), and `Data` (pictures). A missing stream the FIB needs gives `corrupt`.

## FIB

- `FibBase` at offset 0 of `WordDocument`: `wIdent` must be `0xA5EC`, otherwise `corrupt`. `nFib` below `0x00C1` (Word 6 and 95) gives `unsupported_version`. `fEncrypted` or `fObfuscated` set gives `encrypted`.
- Then `csw` and `FibRgW97`, `cslw` and `FibRgLw97` (read `ccpText`, `ccpFtn`, `ccpHdd`, `ccpAtn`, `ccpEdn`, `ccpTxbx`, `ccpHdrTxbx`), `cbRgFcLcb` and `FibRgFcLcbBlob` (the `fc`/`lcb` pairs), read by their position for the FIB version found.
- Pairs used: `Clx`, `PlcBteChpx`, `PlcBtePapx`, `Stshf`, `SttbfFfn`, `PlfLst`, `PlfLfo`, `PlcfSed`, `PlcffndRef`, `PlcffndTxt`, `PlcfendRef`, `PlcfendTxt`, `PlcfBkf`, `PlcfBkl`, `SttbfBkmk`. Each pair is an offset and length in the table stream; every read is bounds-checked and a pair pointing outside the stream gives `corrupt`.

## Text

- Character positions (CPs) are positions in the document's text; file positions (FCs) are byte offsets in `WordDocument`. The `Clx` holds `Prc` entries (skipped, except their property modifiers, see Formatting) followed by the `Pcdt`, whose `PlcPcd` maps CP ranges to pieces.
- For each `Pcd`: `fc` with bit 30 (`fCompressed`) set means 8-bit text at byte `(fc & ~0x40000000) / 2`, one byte per character, decoded as Windows-1252 (bytes `0x80` to `0x9F` map to the Windows-1252 table, not Latin-1). Otherwise the text is UTF-16LE at byte `fc`, two bytes per character.
- The document's text is CPs `[0, ccpText)`. Footnote text follows it (`ccpFtn`), then headers (`ccpHdd`), comments, endnotes and text boxes. Only the main text, footnotes and endnotes are used.
- Special characters in the text stream:

| Character | Meaning | Model |
|---|---|---|
| `0x0D` | paragraph end | ends the paragraph |
| `0x07` | cell end, or row end when the paragraph is a table row mark | see Tables |
| `0x0B` | line break | `lineBreak` |
| `0x0C` | page or section break | `pageBreak` block |
| `0x09` | tab | `tab` |
| `0x13`, `0x14`, `0x15` | field begin, separator, end | see Fields |
| `0x01` with `sprmCFSpec` | inline picture | see Images |
| `0x08` with `sprmCFSpec` | floating drawing | skipped in v1 |
| `0x02` with `sprmCFSpec` | auto-numbered footnote or endnote reference | `noteRef` |
| `0x05` with `sprmCFSpec` | comment reference | skipped |
| `0x1E` | non-breaking hyphen | `-` (U+2011) |
| `0x1F` | optional hyphen | dropped |
| `0x28` with `sprmCSymbol` | symbol from a symbol font | the symbol's character code, mapped from Symbol or Wingdings to Unicode where a mapping exists, otherwise dropped |

## Formatting

- **Character properties**: `PlcBteChpx` lists the FKP pages (512 bytes each, in `WordDocument`) of type `ChpxFkp`. Each page maps FC ranges to a `Chpx` (a `grpprl`, a list of property modifiers called sprms). **Paragraph properties**: `PlcBtePapx` and `PapxFkp` pages map FC ranges (ending at paragraph marks) to `PapxInFkp`: a style index (`istd`) and a `grpprl`.
- Because FKPs are indexed by FC, the text stage keeps, for each piece, its CP-to-FC mapping so properties can be looked up for any CP.
- A piece's `Pcd.prm` can add sprms to all its text (`Prm0` holds one sprm inline, `Prm1` indexes a `Prc` in the `Clx`); they apply after the FKP sprms.
- **Order of application** for a character: paragraph style's character properties → character style (`sprmCIstd`) → the run's sprms → the piece's sprms. For a paragraph: paragraph style (with its base styles, `istdBase`, applied from the root down) → the paragraph's sprms.
- **sprm reading**: the operand size comes from the sprm's `spra` bits (bits 13 to 15): 0 and 1 → 1 byte, 2, 4 and 5 → 2 bytes, 3 → 4 bytes, 7 → 3 bytes, 6 → variable (a size byte first; `sprmTDefTable` and `sprmPChgTabs` have their own size rules). Unknown sprms are skipped by size.
- **Toggle properties** (bold, italic, strike, hidden): operand `0` off, `1` on, `0x80` same as the style, `0x81` opposite of the style.
- Sprms mapped to the model (verify each value against [MS-DOC] when implementing):

| Sprm | Model |
|---|---|
| `sprmCFBold`, `sprmCFItalic`, `sprmCFStrike` | `bold`, `italic`, `strike` |
| `sprmCKul` | `underline` (any style but none) |
| `sprmCIss` | `superscript` (1), `subscript` (2) |
| `sprmCHps` | `fontSizePt` (half-points ÷ 2) |
| `sprmCIco`, `sprmCCv` | `color` (`sprmCCv` wins; ico 0 and cv "auto" mean unset) |
| `sprmCHighlight` | `highlight` (ico table) |
| `sprmCRgFtc0` | `fontFamily` (index into `SttbfFfn`) |
| `sprmCFVanish`, `sprmCFRMarkDel` | text is dropped (hidden, deleted revision) |
| `sprmPJc`, `sprmPJc80` | `align` (0 left, 1 center, 2 right, 3 to 5 justify) |
| `sprmPDxaLeft`, `sprmPDxaRight`, `sprmPDxaLeft1` (and the `80` variants) | `indentLeftMm`, `indentRightMm`, `firstLineMm` (twips) |
| `sprmPDyaBefore`, `sprmPDyaAfter` | `spaceBeforePt`, `spaceAfterPt` (twips ÷ 20) |
| `sprmPDyaLine` | `lineHeight` when the rule is "multiple" (value ÷ 240) |
| `sprmPOutLvl` | heading level (0 to 5 → 1 to 6) |
| `sprmPIlfo`, `sprmPIlvl` | list (see Lists) |
| `sprmPFInTable`, `sprmPItap`, `sprmPFTtp`, `sprmPFInnerTtp`, `sprmTDefTable`, `sprmTTableHeader` | tables (see Tables) |

- **Styles**: the `STSH` at `Stshf`: `STSHI`, then one `LPStd` per style index. Each `STD` gives `sti` (built-in id: 1 to 9 are Heading 1 to 9), `stk` (paragraph or character), `istdBase`, the name, and its `UPX`s (paragraph: `istd` + `grpprl`; character: `grpprl`). A paragraph is a heading if its style chain has a heading `sti` or a heading outline level.
- **Fonts**: `SttbfFfn` entries (`FFN`) give the font names, in index order.
- **Page**: the first section's `SEPX` (from `PlcfSed`'s first `Sed.fcSepx`): `sprmSXaPage`, `sprmSYaPage`, `sprmSDxaLeft`, `sprmSDxaRight`, `sprmSDyaTop`, `sprmSDyaBottom` (twips). Missing values use Word's defaults (Letter, 1 inch top and bottom, 1.25 inch left and right).

## Fields

- `0x13` instruction `0x14` result `0x15`, possibly nested. The parser keeps a stack. Only the result (between the separator and the end) is shown; a field with no separator shows nothing.
- `HYPERLINK "url"` instructions turn the result into a `link`; the `\l "bookmark"` switch makes it `#bookmark`. `PAGEREF`, `REF`, `TOC` and the rest show their result as text.

## Tables

- A paragraph with `sprmPFInTable` (depth `sprmPItap`, 1 when absent) is in a table. Inside a row, `0x07` ends a cell's last paragraph. The row ends at a paragraph that is a table row mark (`sprmPFTtp`, or `sprmPFInnerTtp` for nested depths); that paragraph's `sprmTDefTable` gives the cell boundaries (`rgdxaCenter`, so widths in twips) and per-cell `TC80` flags: `fVertRestart` and `fVertMerge` for vertical merges, `fFirstMerged` and `fMerged` for old-style horizontal merges. `sprmTTableHeader` marks a header row.
- Merges become `rowSpan` and `colSpan`; merged-away cells are omitted. Consecutive rows at the same depth form one table.
- Nested tables (depth above 1) are built as tables inside cells. If the nesting is inconsistent, inner rows are flattened into paragraphs in the outer cell.

## Lists

- `sprmPIlfo` (1-based index into `PlfLfo`) and `sprmPIlvl` (level 0 to 8) put a paragraph in a list. `LFO.lsid` finds the `LSTF` in `PlfLst`; the `LVL` structures follow the `PlfLst` in the table stream, nine per list (one for "simple" lists). `LFOLVL` overrides in the `LFO` can change a level's start value.
- Each `LVL` gives `nfc` (number format: 0 decimal, 1 upper Roman, 2 lower Roman, 3 upper letter, 4 lower letter, 22 decimal with leading zero, 23 bullet, 255 none), `iStartAt`, and `xst`, the marker template, where characters 0 to 8 are placeholders for the current number of that level.
- The parser keeps a counter per list and level: a paragraph increments its level's counter and resets the deeper levels; the marker is `xst` with each placeholder replaced by that level's number in its level's format. Bullet markers that use a Symbol or Wingdings code point are mapped to "•", "◦" or "▪".
- `ordered` is false for bullets (`nfc` 23 or 255), true otherwise.

## Images

- An inline picture is a `0x01` character with `sprmCFSpec`; its `sprmCPicLocation` operand is an offset into the `Data` stream, where a `PICFAndOfficeArtData` starts: a `PICF` (`lcb`, `cbHeader`, `mfpf.mm`, `dxaGoal`, `dyaGoal`, `mx`, `my`), the picture name when `mm` is `0x0066`, then an OfficeArt `OfficeArtInlineSpContainer`: a shape container followed by `OfficeArtFBSE` records holding the BLIP.
- BLIP record types: `0xF01D` JPEG, `0xF02A` JPEG (CMYK), `0xF01E` PNG, `0xF01F` DIB (made into a BMP by adding a file header), `0xF01A` EMF, `0xF01B` WMF, `0xF029` TIFF. Bitmaps skip the record header, one or two 16-byte UIDs (two when the instance is the "two UIDs" value) and the tag byte. EMF, WMF and TIFF become a placeholder of the right size.
- Display size: `dxaGoal × mx / 1000` by `dyaGoal × my / 1000` twips, converted to pixels.
- Floating pictures and shapes (`0x08`, OfficeArt in the table stream) are not read in v1.

## Notes and bookmarks

- `PlcffndRef` gives the CP of each footnote reference and `PlcffndTxt` the CP ranges of their text inside the footnote part (starting at `ccpText`); endnotes likewise. Each becomes a `Note` (labels "1", "2"… for footnotes, "i", "ii"… for endnotes, unless the reference is a custom mark, in which case its text is the label) and a `noteRef` at the reference.
- `PlcfBkf`, `PlcfBkl` and `SttbfBkmk` give bookmark names and their start CPs; each start becomes an `anchor` inline so `#bookmark` links work.
