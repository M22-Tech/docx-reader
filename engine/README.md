# Engine

The document engine is a web page (built to one self-contained `dist/viewer.html`) that the app runs inside a web view. It receives a file's bytes, works out the format from its contents, renders the document in Raw or Rendered mode and reports back to the app through typed bridge messages. It has no access to the file system or the network. See `docs/design/00-architecture.md` for how it fits into the app.

## Setup

Run `./setup.sh` from the repo root, or `npm install` in this folder.

## Build

`npm run build` writes `dist/viewer.html`.

## Development

`npm run dev` starts the Vite dev server and opens the dev harness (`dev/harness.html`). The harness plays the app: it embeds the viewer page in an iframe and has a file picker (the file is read in the browser and sent as an `open` message), a mode toggle, a theme toggle, smaller and larger text buttons (the sizes of `docs/spec/03-viewer.md`) and a log of every message the page sends. Files never leave the browser. The harness is not part of the build.

The dev server serves the viewer with a looser Content-Security-Policy than the build (its own scripts and hot reload); `npm run build` always uses the strict one from `docs/spec/05-privacy.md`.

## Checks

`npm run check` runs lint, typecheck and the unit tests. `npm run test:coverage` runs the unit tests with a coverage report.

## Rendering tests

`npm run test:e2e` builds the viewer and runs the Playwright tests in `e2e/` against `dist/viewer.html` in Chromium, at a phone-sized viewport. They talk to the page the way the app does: through a stand-in for the web view's `postMessage` and `message` events. `./setup.sh` installs Chromium for them; otherwise run `npx playwright install chromium`.
