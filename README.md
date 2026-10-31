# DocX Reader

An open-source, offline document reader for Android and iOS. It opens Word and OpenDocument text files (`.docx`, `.doc`, `.rtf`, `.odt` and their template variants) received from WhatsApp, Gmail or any file manager, and shows them in two modes: Raw (the document as Word shows it) and Rendered (reflowed to fit the phone). Everything happens on the device: the app has no internet permission, and documents never leave the phone. Product behaviour is described in `docs/spec/`, and how it is built in `docs/design/`.

## Setup

Prerequisites: Node 24 (pinned in `.nvmrc`), JDK 17 (`brew install --cask zulu@17`), the Android SDK (`brew install --cask android-commandlinetools`, `ANDROID_HOME` set to its folder, then `sdkmanager --licenses` and `sdkmanager "platform-tools"`; Android Studio also works) and an Android phone with USB debugging on.

Run `./setup.sh`. It checks the prerequisites (and, with nub, downloads the pinned Node first), installs the engine and app dependencies, builds the engine and copies it into the app. It is safe to run again.

## Run

- Development: `cd app && npm run android` builds the app and installs it on the connected phone (`app/README.md`). Android commands pick a JDK 17 themselves (`android-env.sh`), so your own `JAVA_HOME` can stay on another version.
- Production: build the engine, then build a signed release APK or Play Store bundle (`app/README.md`).

## Fixtures

The test documents in `fixtures/` are committed. To change them, edit `fixtures/make-fixtures.mjs` and run `cd fixtures && npm install && npm run make` (needs LibreOffice's `soffice` on PATH, which converts the generated .docx to .doc, .rtf and .odt).

## Licence

MIT
