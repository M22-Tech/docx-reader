# odt

An OpenDocument text file is a zip with `content.xml` (the body and automatic styles), `styles.xml` (named styles, default styles, page layouts), `Pictures/` and `META-INF/manifest.xml`. The reference is the OASIS OpenDocument 1.3 specification. Test material: `features.odt`, `minimal.odt` and the `.odt` samples.

## Reading

- Open with `jszip`; parse `content.xml` and `styles.xml` with `DOMParser` (`application/xml`). A missing `content.xml` or a parse error gives `corrupt`.
- Elements are matched by namespace URI and local name, never by prefix.
- `meta.xml`'s `dc:title`, if present, becomes the model title.

## Styles

- Sources: `office:font-face-decls` (font name → `svg:font-family`), `style:default-style` per family, named styles in `styles.xml` `office:styles`, automatic styles in both files' `office:automatic-styles` (content.xml's apply to the body).
- A style's effective properties: default style for its family → each `style:parent-style-name` ancestor from the root down → the style itself. Resolved values are cached per style name.
- A `text:span`'s text properties apply on top of its paragraph's resolved text properties.
- Text properties: `fo:font-weight` (bold at `bold` or 600 and above), `fo:font-style` (`italic`, `oblique`), `style:text-underline-style` (anything but `none`), `style:text-line-through-style`, `style:text-position` (`super` or a positive percent → superscript, `sub` or negative → subscript), `fo:color`, `fo:background-color` (highlight, unless `transparent`), `style:font-name`, `fo:font-size` (pt, or a percent of the inherited size).
- Paragraph properties: `fo:text-align` (`start` and `left` → left, `end` and `right` → right, `center`, `justify`), `fo:margin-left`, `fo:margin-right`, `fo:text-indent`, `fo:margin-top`, `fo:margin-bottom`, `fo:line-height` (a percent → multiple), `fo:break-before="page"` (a page break block before), `style:default-outline-level` (heading level for `text:p` styles that declare one).
- Lengths: `cm`, `mm`, `in`, `pt`, `pc`, `px` converted as `00-architecture.md` says.

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

## Lists

- `text:list` nesting gives the level (the outermost is 0). The list style comes from the outermost list's `text:style-name`, or else from the paragraph style's `style:list-style-name`.
- In the list style, `text:list-level-style-number` gives `style:num-format` (`1`, `a`, `A`, `i`, `I`, or empty for no number), `style:num-prefix`, `style:num-suffix`, `text:display-levels` (how many levels' numbers the marker shows, as in "1.2.") and `text:start-value`. `text:list-level-style-bullet` gives `text:bullet-char`.
- Counters are kept per list (by `xml:id` and `text:continue-list`, or `text:continue-numbering="true"` continuing the previous list with the same style). A `text:list-item`'s `text:start-value` resets its counter. A `text:list-header` has no marker.

## Tables

- `table:table-column` elements (expanding `table:number-columns-repeated`) give the column widths from their styles' `style:column-width`.
- `table:table-header-rows` wraps header rows. `table:table-row` (with `table:number-rows-repeated`, capped at 1000 to stop a malformed file from blowing up) holds `table:table-cell` with `table:number-columns-spanned`, `table:number-rows-spanned` and a style whose `fo:background-color` becomes the cell background. `table:covered-table-cell` is omitted.

## Images

- `draw:image`'s `xlink:href` names a file inside the zip (`Pictures/…`); external hrefs become a placeholder. The MIME type comes from the file's first bytes (PNG, JPEG, GIF, BMP); anything else (SVG, WMF, EMF) is a placeholder.
- Size: the frame's `svg:width` and `svg:height`.

## Page

The page layout of the first master page used (`style:master-page`'s `style:page-layout-name`, looked up in `styles.xml`'s automatic styles): `style:page-layout-properties` `fo:page-width`, `fo:page-height`, `fo:margin-*`. Missing values use A4 portrait with 2.54 cm margins.
