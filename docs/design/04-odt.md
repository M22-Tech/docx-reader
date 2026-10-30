# odt

An OpenDocument text file is a zip with `content.xml` (the body and automatic styles), `styles.xml` (named styles, default styles, page layouts), `Pictures/` and `META-INF/manifest.xml`. The reference is the OASIS OpenDocument 1.3 specification. Test material: `features.odt`, `minimal.odt` and the `.odt` samples.

## Reading

- Open with `jszip`; parse `content.xml` and `styles.xml` with `DOMParser` (`application/xml`). A missing `content.xml` or a parse error gives `corrupt`.
- Elements are matched by namespace URI and local name, never by prefix.
- A password-protected file lists `manifest:encryption-data` on `content.xml` in `META-INF/manifest.xml`; that gives `encrypted`, checked before `content.xml` is read. A `meta.xml` or manifest that can't be parsed is ignored; `content.xml` or `styles.xml` that can't be parsed is `corrupt`, and so is a `content.xml` without `office:body` / `office:text`.
- Pictures named in the body are read from the zip before the body walk, so the walk itself is a plain function of the XML and those bytes. The abort signal is checked between the stages (package, styles, pictures, body).
- `meta.xml`'s `dc:title`, if present, becomes the model title.

## Styles

- Sources: `office:font-face-decls` (font name → `svg:font-family`), `style:default-style` per family, named styles in `styles.xml` `office:styles`, automatic styles in both files' `office:automatic-styles` (content.xml's apply to the body).
- A style's effective properties: default style for its family → each `style:parent-style-name` ancestor from the root down → the style itself. Resolved values are cached per style name.
- A `text:span`'s text properties apply on top of its paragraph's resolved text properties.
- Text properties: `fo:font-weight` (bold at `bold` or 600 and above), `fo:font-style` (`italic`, `oblique`), `style:text-underline-style` (anything but `none`), `style:text-line-through-style`, `style:text-position` (`super` or a positive percent → superscript, `sub` or negative → subscript), `fo:color`, `fo:background-color` (highlight, unless `transparent`), `style:font-name`, `fo:font-size` (pt, or a percent of the inherited size).
- Headings: `text:h`, a style's `style:default-outline-level`, or the style name rule in `00-architecture.md`, using `style:display-name` when present (`Heading_20_1` is displayed as "Heading 1"; `_20_` encodes a space).
- Paragraph properties: `fo:text-align` (`start` and `left` → left, `end` and `right` → right, `center`, `justify`), `fo:margin-left`, `fo:margin-right`, `fo:text-indent`, `fo:margin-top`, `fo:margin-bottom`, `fo:line-height` (a percent → multiple), `fo:break-before="page"` (a page break block before), `style:default-outline-level` (heading level for `text:p` styles that declare one).
- Lengths: `cm`, `mm`, `in`, `pt`, `pc`, `px` converted as `00-architecture.md` says.
- Marks: the font family is set whenever the style resolves one (the renderers' default has no family name), and the font size unless it is 11 pt, the renderers' default; bold, italic and the rest only when on. Sizes are rounded to 2 decimals and millimetres to 3, to hide unit conversion noise. A paragraph's alignment is left out when it is left.
- A style attribute that is present but empty (`style:default-outline-level=""`, `style:list-style-name=""`, `style:master-page-name=""`) resets what an ancestor set. Styles of different families (paragraph, text, table…) with the same name are different styles. A parent cycle ends the chain.

## Body

| Element | Model |
|---|---|
| `text:p` | paragraph |
| `text:h` | paragraph with `headingLevel` from `text:outline-level` (default 1, above 6 → 6) |
| `text:span` | its children with merged marks |
| `text:s` | `text:c` spaces (default 1) |
| `text:tab` | `tab` |
| `text:line-break` | `lineBreak` |
| `text:soft-page-break` | ignored |
| `text:a` | `link` with `xlink:href` |
| `text:bookmark`, `text:bookmark-start` | `anchor` with `text:name` |
| `text:note` | `noteRef` with `text:note-citation` as label; `text:note-body` becomes a `Note` (`text:note-class` footnote or endnote) |
| `text:list` | see Lists |
| `table:table` | see Tables |
| `draw:frame` with `draw:image` | `image` (see Images); a frame holding `draw:text-box` is skipped |
| `text:section`, `text:index-body` (inside a table of contents) | their children, in place |
| `text:sequence`, `text:date`, `text:page-number` and other fields | their text content |
| `text:tracked-changes`, `office:annotation`, `office:annotation-end`, `text:index-title-template`, `text:table-of-content-source` | skipped |

Deleted text is held only inside `text:tracked-changes`, so skipping that element gives the final text.

- White space follows ODF: runs of spaces, tabs and line feeds in the XML collapse to one space, and white space at the start of a paragraph or right after a `text:tab` or `text:line-break` is dropped; `text:s` spaces are never collapsed. A page break is not put at the very start of the document, a cell or a note.
- Any other element in the `text:` namespace is treated by where it sits: inside a paragraph its text content is shown (fields, `text:meta`), among blocks its children are shown in place (`text:section`, `text:table-of-content`, `text:index-body`). Elements of other namespaces are skipped (annotations, shapes).
- A note's id is its position in reference order; a note without a citation is labelled with that number.

## Lists

- `text:list` nesting gives the level (the outermost is 0). The list style comes from the outermost list's `text:style-name`, or else from the paragraph style's `style:list-style-name`.
- In the list style, `text:list-level-style-number` gives `style:num-format` (`1`, `a`, `A`, `i`, `I`, or empty for no number), `style:num-prefix`, `style:num-suffix`, `text:display-levels` (how many levels' numbers the marker shows, as in "1.2.") and `text:start-value`. `text:list-level-style-bullet` gives `text:bullet-char` (its `style:num-suffix` repeats the character in files from LibreOffice and is ignored). A list paragraph's indents come from its level's `style:list-level-label-alignment` (`fo:margin-left`, `fo:text-indent`) unless the paragraph's own style sets them. A bullet that is a private-use character (the symbol fonts' bullets) is shown as "•". A level the style doesn't define uses its deepest defined level; a missing list style gives "•".
- Counters are kept per list (by `xml:id` and `text:continue-list`, or `text:continue-numbering="true"` continuing the previous list with the same style). A `text:list-item`'s `text:start-value` resets its counter. A `text:list-header` has no marker. Only the first paragraph of a list item takes the marker and counts; the item's other paragraphs and the paragraphs of a list header have an empty marker and still get the level's indents. An item that holds only a nested list doesn't count. A list inside a table cell or a note starts at level 0 with its own counters. Letters (`a`) run a to z, aa, ab…, or a to z, aa, bb… with `style:num-letter-sync`; roman numbers stop at 3999 and then show decimals; a format that is not one of these shows decimals. The list style of an outermost list that names none comes from its first paragraph's style.

## Tables

- `table:table-column` elements (expanding `table:number-columns-repeated`) give the column widths from their styles' `style:column-width`, or, when only `style:rel-column-width` ("21845*") is given, as shares of the table width: the page's text width times the table's `style:rel-width` percent (100% when absent).
- `table:table-header-rows` wraps header rows. `table:table-row` (with `table:number-rows-repeated`, capped at 1000 to stop a malformed file from blowing up) holds `table:table-cell` with `table:number-columns-spanned`, `table:number-rows-spanned` and a style whose `fo:background-color` becomes the cell background. `table:covered-table-cell` is omitted. `table:number-columns-repeated` on columns and cells is capped at 1000 like rows. Absolute and relative column widths can mix: the relative ones share what the absolute ones leave of the table width. When a column has neither, the table has no column widths.

## Images

- `draw:image`'s `xlink:href` names a file inside the zip (`Pictures/…`); external hrefs become a placeholder. The MIME type comes from the file's first bytes (PNG, JPEG, GIF, BMP); anything else (SVG, WMF, EMF) is a placeholder.
- Size: the frame's `svg:width` and `svg:height`. A frame without a usable size is 96 × 96 px. The alt text is the frame's `svg:desc`, else its `svg:title`. An href is internal when it is a relative path without `..`; a URL scheme, a leading `/` or `\`, and `#` are external.

## Page

The page layout of the master page named by the first paragraph style that sets `style:master-page-name`, else the master page `Standard`, else the first one (`style:master-page`'s `style:page-layout-name`, looked up in `styles.xml`'s automatic styles): `style:page-layout-properties` `fo:page-width`, `fo:page-height`, `fo:margin-*`. Missing values use A4 portrait with 2.54 cm margins.
