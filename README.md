# DocX Reader

A document reader for Android phones. It opens Word and OpenDocument text files (`.docx`, `.doc`, `.rtf`, `.odt` and their template variants) received from WhatsApp, Gmail or any file manager, and lets you read them the way you find comfortable: *Raw* shows a document as Word does, and *Rendered* reflows it to fit the phone in the font style and text size you choose, in a light or dark theme. Product behaviour is described in `docs/spec/`, and how it is built in `docs/design/`.

## Setup

Prerequisites: Node 24 (pinned in `.nvmrc`), JDK 17 (`brew install --cask zulu@17`), the Android SDK (`brew install --cask android-commandlinetools`, `ANDROID_HOME` set to its folder, then `sdkmanager --licenses` and `sdkmanager "platform-tools"`; Android Studio also works) and an Android phone with USB debugging on.

Run `./setup.sh`. It checks the prerequisites (and, with nub, downloads the pinned Node first), installs the engine and app dependencies, builds the engine and copies it into the app, and collects the open-source licences. It is safe to run again.

## Run

- Development: `cd app && npm run android` builds the app and installs it on the connected phone (`app/README.md`). Android commands pick a JDK 17 themselves (`android-env.sh`), so your own `JAVA_HOME` can stay on another version.
- Production: `cd app && npm run build:apk` builds a release APK and `npm run build:aab` a Play Store bundle; they build the engine themselves (`app/README.md`).

## Fixtures

The test documents in `fixtures/` are committed. To change them, edit `fixtures/make-fixtures.mjs` and run `cd fixtures && npm install && npm run make` (needs LibreOffice's `soffice` on PATH, which converts the generated .docx to .doc, .rtf and .odt).

## To do

- **Text and source files**: open `.txt`, `.md`, `.html` and `.json` files directly (today HTML opens only when it's saved with a `.doc` name). Raw shows the source text, as it already does for HTML; Rendered shows plain text reflowed, Markdown and HTML as formatted pages, and JSON pretty-printed. These formats can't be recognised from their first bytes like the Office formats, so detection also needs the file name and the type the sending app gives, and the intent filters and picker need their MIME types.
- **PDF reader**: open `.pdf` files. Raw draws the pages as they were laid out, with pinch zoom, using pdf.js inside the viewer page (offline, like the other formats); Rendered reflows the PDF's text to the screen in the chosen font style, size and theme, as far as the file has real text (scanned PDFs are only images and stay Raw-only).
- **iOS**: release the app for iPhone and iPad. The Expo app and the engine already run there; the work is registering the document types so the app shows up in "Open in" and the share sheet, checking the viewer in iOS's web view, App Store builds and signing (an Apple developer account and Xcode), and the App Store privacy details. iOS has no internet permission to remove, so the no-network promise rests on the viewer's Content-Security-Policy and the app making no requests.
- **Create your own theme**: alongside light and dark, let people make their own theme in Settings by picking the background, text and accent colours, with a live preview and a warning when text and background are too close to read. The theme colours the app and Rendered mode, the same way light and dark do now.

## Licence

MIT
