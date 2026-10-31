# DocX Reader: conventions for contributors and Claude Code

DocX Reader is an offline document reader: an Expo app (`app/`) that shows documents through a web view running the document engine (`engine/`). Product behaviour lives in `docs/spec/`; how the app and each parser are built lives in `docs/design/`. Read the spec and design files your task names before writing code. This file lists the conventions every change follows.

## Stack

- Node 24 (pinned in `.nvmrc`), TypeScript 6.0 in strict mode in both packages. Every `package.json` (root, `engine/`, `app/`) declares `"engines": { "node": ">=24" }` and `"devEngines": { "packageManager": { "name": "npm", "version": ">=11.0.0", "onFail": "warn" } }` (a range, not an exact pin, so nub and corepack users get a recent npm without a warning). Two independent npm packages (`engine/`, `app/`), each with its own `package.json` and lockfile; no workspaces. The root `package.json` only declares the Node and npm versions and the `setup` script; it has no dependencies.
- Engine: Vite 8 with `vite-plugin-singlefile` (one self-contained `viewer.html`), Vitest 5 with jsdom for unit tests, Playwright for rendering tests of the built viewer in Chromium. Libraries: `docx-preview` (docx Raw), `mammoth` (docx Rendered), `jszip` (zip containers), `cfb` (the .doc container), `dompurify` (every HTML that reaches the page). The .doc, .rtf and .odt parsers are our own code.
- App: Expo SDK 58 (React Native 0.88, React 19.3), Expo Router, `react-native-webview`, `expo-file-system`, `expo-document-picker`, `expo-share-intent`, `expo-crypto`, `@react-native-async-storage/async-storage`, `lucide-react-native` with `react-native-svg`, `expo-font` with `@expo-google-fonts/arimo` (the app font), zod for stored data. jest-expo for unit tests.
- One `.gitignore`, `.prettierrc.json` and `.prettierignore` at the repo root for both packages (the format scripts pass `--ignore-path ../.prettierignore`, since Prettier reads ignore files only from the folder it runs in). `eslint.config.js` and `tsconfig.json` stay per package: the engine uses ESLint 10 with typescript-eslint for the browser, the app Expo's ESLint 9 setup for React Native.
- Exact versions in `package.json` (no `^` or `~`). Native app dependencies are added with `npx expo install` so they match SDK 58, then pinned. Don't add a dependency the task doesn't name. If one is really needed, stop and explain why.

## Layout

```
engine/
  src/
    detect/              format detection from the file's bytes
    model/               the document model (types) and its renderers: model -> HTML for Raw and Rendered
    formats/<format>/    one folder per format (docx, doc, rtf, odt, html): <format>-adapter.ts plus parser files
    sanitize/            DOMPurify setup for Raw and Rendered, link rewriting
    viewer/              the page: bridge, mode switching, theme, error view, link handling
    bridge/              message types shared with the app (bridge-messages.ts)
  dev/                   dev harness page (open a local file in a desktop browser)
  e2e/                   Playwright tests of dist/viewer.html
  tests are next to the code (<name>.test.ts)
app/
  src/app/               Expo Router screens (thin)
  src/modules/<name>/    one folder per concern (recent, setting, document): logic, storage, tests
  src/components/ui/     primitives (icon-button, card, ...)
  src/components/<feature>/
  src/viewer/            the web view wrapper and bridge client; generated/viewer-html.ts (gitignored, written by `npm run engine:sync`)
  src/config/            fixed values (constants.ts)
  src/theme/             colours, font and spacing from docs/spec/04-look-and-settings.md
  assets/brand/          icon.png (splash), adaptive-icon.png (launcher foreground) and the two wordmarks, transparent (from the brand slides; don't regenerate)
  plugins/               Expo config plugins
fixtures/                public test documents (committed) and make-fixtures.mjs
samples/                 private documents for manual checks (gitignored)
docs/spec/               product behaviour
docs/design/             architecture and parser design
setup.sh                 prepares a fresh clone for local development
android-env.sh           runs a command with JAVA_HOME (a JDK 17) and ANDROID_HOME set for Android builds
```

## Engine architecture

- Modes are Raw and Rendered everywhere: in the UI, the bridge (`raw`, `rendered`), settings, code names, CSS classes and docs (`docs/spec/03-viewer.md`). Raw is the page as Word shows it for documents and the source text for source formats (html; Markdown later); Rendered is the reflowed content. Don't use Layout or Reading for the modes.
- Every format has an adapter implementing `FormatAdapter` from `engine/src/formats/format-adapter.ts`: `renderRaw(bytes, container, ctx)` and `renderRendered(bytes, ctx)`. The viewer picks the adapter from `detect()`, never from the file extension.
- docx uses `docx-preview` for Raw and `mammoth` for Rendered. doc, rtf and odt parse into the document model (`engine/src/model/document-model.ts`), and the shared model renderers produce both modes, so those three formats look consistent.
- Parsers are pure functions from bytes to model, following their `docs/design/` file: no DOM except `DOMParser` for XML, no globals, no network, no timers. They read with bounds checks and throw `DocumentError` (`engine/src/document-error.ts`) with a code from the spec (`corrupt`, `encrypted`, `unsupported_version`, ...) instead of crashing on bad input. An element a parser does not understand is skipped, not fatal.
- All HTML goes through `sanitize/` before it is inserted: no scripts, event handlers, iframes, forms or remote URLs. Images are only `data:` or `blob:` URLs. Links become in-app link elements that ask the app to open them (the page never navigates).
- The page has a Content-Security-Policy that blocks all network access (`default-src 'none'`), set in `viewer.html`.
- The engine never sends document content, file names or text to the app except what the bridge messages define.

## Bridge

- Messages are JSON, typed in `engine/src/bridge/bridge-messages.ts`; the app imports the same types (copied by `npm run engine:sync`, not hand-written twice). Every message has a `type`.
- App to page: `open` (file name, bytes as base64, mode, settings), `setMode`, `setSettings` (theme, text size, font style).
- Page to app: `ready`, `rendered` (format, mode, `durationMs`, whether the other mode is available), `error` (code, message), `openLink` (href).
- Both sides validate incoming messages with zod and ignore unknown ones.

## Naming

- File names are kebab-case. A module folder is named after its concern in the singular (`recent`, `setting`).
- Comments never name a vendor where a neutral word works ("web view", "storage"). Module code never imports a vendor library directly when an adapter file exists for it (storage, file system, web view).

## Config

- This project keeps things fixed: there are no config files. The brand (name, icon, colours, font) and the limits and defaults are constants, in `app/src/theme/` and `app/src/config/constants.ts`, with the values in `docs/spec/04-look-and-settings.md`. Every other file imports them from there; never repeat a value.
- There are no secrets and no env files: the app talks to no server.

## Logging

- No logging library. Each package has one `logger` file (`engine/src/logger.ts`, `app/src/logger.ts`) with `debug`, `info`, `warn`, `error`, silent in production builds and in tests.
- Never log document text, image data or full file contents. File names and sizes are fine in development.
- Timed steps (detect, parse, render, sanitize, copy) log at debug with the duration named `durationMs`, rounded to 3 decimals.

## UI

- Colours from `app/src/theme/`: background, text and accent for light and dark (`docs/spec/04-look-and-settings.md`). Other shades are the text colour at an opacity; the accent only for the spinner, focus outlines, a selected option and a pressed button. Nothing relies on colour alone. Rendered mode and the source view get the background and text colours (as `paper` and `ink`); Raw mode for documents shows the document's own colours.
- Font: Arimo (regular and bold) on every app screen, loaded at build time through the `expo-font` config plugin.
- Body text at least 16 px, font weight at least 400, borders at least 1.5 px, no shadows or gradients, touch targets at least 48 dp (Android guideline).
- Feedback: a pressed state on every button, a spinner while anything loads, errors shown inline where they happen. No toasts.
- Buttons show an icon (`lucide-react-native`), not text. Every icon button has an accessibility label; when a task names a button ("Open file"), that name is its label. Text stays only where an icon alone can't say it: confirmation dialogs.
- Theme: light or dark only, no "system" option. Until someone picks one, the app follows the device setting.
- Layout: dashboard style, content in cards (1.5 px ink border, rounded corners, padding, no shadow). There is no side menu while the app has only a home screen, a viewer and settings (`docs/spec/04-look-and-settings.md`).
- No card that holds only a single button or link: the button or link itself becomes the card (whole card pressable, title, one line of description, chevron).
- Accessible: every control labelled, works with TalkBack, respects the system font scale in the app's own screens.

## Tests

- Parsers and pure logic get unit tests with expected values checked by hand against the fixture documents in `fixtures/`. A parser test asserts on the model, not on HTML strings.
- Every format has a Playwright test that opens each of its fixtures in the built viewer in both modes and checks that it renders without an error and that known text is present.
- Tests in `engine/` may also run against `samples/` when files are there; such tests skip when the folder is empty and never print document text.
- Every bug fix comes with a test that fails without it.
- `npm run check` (lint, typecheck, unit tests) must pass in each package you touched before a task is finished.

## Docs

- Markdown and text files: no hard line breaks inside a paragraph; each paragraph is one line.
- A behaviour change updates the matching `docs/spec/` file in the same change, and a design change the matching `docs/design/` file.
- Every app script that runs Gradle (`android`, the release builds) goes through `../android-env.sh`, for example `"android": "../android-env.sh expo run:android"`, so builds use JDK 17 whatever the shell's `JAVA_HOME` is.
- `setup.sh` runs every step needed to run the project locally. A task that adds a setup step (a dependency install, a config file, a build or sync step) updates `setup.sh` and the README in the same change. App config goes in `app/README.md`, engine build and tests in `engine/README.md`; the root README stays short.

## Working rules for agents

- Do what the task asks and nothing more. Note anything out of scope you noticed at the end instead of changing it.
- Never open, copy, print or quote files in `samples/` yourself: they are private. Tests may load them; use `fixtures/` for anything you need to read.
- Don't commit, push or create branches; the maintainer does that.
- Finish with a short report: what changed (files), any deviation from the task and why, what you verified and how, anything left open.
