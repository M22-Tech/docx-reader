# Overview

DocX Reader opens the text documents people receive on their phone (an agreement from a client, a job description from a recruiter, a CV template) and shows them well on a small screen. It only reads: it does not edit, convert or send documents anywhere.

Two promises shape everything else: it opens the common Word and OpenDocument text formats without needing another app, and nothing leaves the device. There is no account, no server, no analytics and no internet permission.

## Glossary

- **Document**: a file the app can open: `.docx`, `.doc`, `.rtf` or `.odt`, or a template variant of one of them (`02-formats.md`).
- **Format**: what the file really is, worked out from its contents, not its name. A `.doc` file that is really RTF is read as RTF.
- **Layout mode**: the document as its author laid it out: page width, fonts, sizes, colours and, for `.docx`, real pages with headers and footers. Zoom with two fingers.
- **Reading mode**: the same content reflowed to the screen width in the app's theme and reading font, with an adjustable text size. Bold, italics, headings, lists, tables, images and links stay; fonts, colours and page layout go.
- **Recent file**: a document opened before, kept as a private copy inside the app so it can be reopened later (`01-opening-files.md`).
- **Brand**: the app's name, icon, wordmark, colours and font, fixed in the app (`04-look-and-settings.md`).

## Spec files

- `01-opening-files.md`: the ways to open a document, recent files, size limit, errors when opening.
- `02-formats.md`: what each format shows in each mode, and what is not supported.
- `03-viewer.md`: the viewer screen: modes, zoom, text size, links, errors while rendering.
- `04-look-and-settings.md`: brand, theme, screens, settings.
- `05-privacy.md`: what the app stores, what it never does, and how that is enforced.

## Not in this version

Editing, PDF, spreadsheets and presentations, search inside a document, printing, sending a document to another app, remembering the scroll position, iOS, languages other than English for the app's own text (documents in any language display).
