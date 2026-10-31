# Opening files

## Ways to open a document

- **Open with**: in WhatsApp, Gmail, a file manager or any app that offers "Open with", choosing DocX Reader opens the document straight in the viewer. The app registers for the MIME types of every supported format (`02-formats.md`) and also for `application/octet-stream` files whose name ends in a supported extension, because some apps send documents with a generic type.
- **Share**: choosing DocX Reader in a share sheet does the same. Sharing several files opens the first and adds the others to recent files.
- **Open file**: on the home screen, the "Open file" card opens the system file picker, limited to supported types. Picking a file opens it in the viewer.
- Opening a document while another is open replaces it; the back button returns to the home screen, not to the previous document.

## What happens on open

1. The app reads the file once and keeps a private copy (see Recent files). If the source app's permission has already expired, the copy is what makes reopening possible.
2. The format is worked out from the file's contents (`02-formats.md`). The file name only decides the title shown in the viewer.
3. The viewer opens in the user's default mode (`04-look-and-settings.md`), unless that mode is not available for the format, in which case it opens in the other one.

## Large files

- There is no size limit. Files larger than 30 MB open as usual, with a line under the spinner: "This is a large file (42.5 MB), so it may take a while to open."
- If the viewer runs out of memory while opening a document, the error card shows `too_large` (below) instead of the app closing.
- An empty file (0 bytes) shows "This file is empty."

## Recent files

- The home screen lists recent files, newest first: file name, format, size and when it was last opened (for example "Today, 14:05" or "12 Oct"). Pressing one reopens it from the private copy.
- Each recent file has a remove button; removing deletes the private copy at once. "Clear recent files" in settings removes them all, after a confirmation.
- The list keeps at most 20 files; opening one more removes the oldest, with its copy.
- Opening the same file again (same name and same contents) moves it to the top instead of adding a second entry.
- Setting "Keep recent files" off (`04-look-and-settings.md`) clears the list and its copies, and from then on documents are kept only while they are open: the copy is deleted when the viewer closes, and anything such a copy left behind (the app was killed with a document open) is deleted when the app starts.
- Private copies live in the app's own storage, which other apps cannot read. Uninstalling the app deletes them.

## Errors when opening

Shown in a card on the home screen (or in the viewer if the error comes from rendering, `03-viewer.md`), with the file name, one plain sentence and, where it helps, what to do:

| Code | When | Message |
|---|---|---|
| `too_large` | the viewer ran out of memory opening the document | "This document is too large to open on this phone." |
| `empty` | 0 bytes | "This file is empty." |
| `read_failed` | the file could not be read (permission revoked, file gone) | "DocX Reader couldn't read this file. Try sharing or opening it again from the app it came from." |
| `unsupported_format` | the contents are not a supported format | "This isn't a document DocX Reader can open. It reads .docx, .doc, .rtf and .odt files." |
| `encrypted` | password-protected document | "This document is protected with a password. DocX Reader can't open protected documents yet." |
| `unsupported_version` | Word 6 or Word 95 `.doc`, or an older format variant | "This document was saved in a very old Word format that DocX Reader can't read." |
| `corrupt` | the file claims to be a supported format but is damaged | "This document looks damaged and couldn't be opened." |
