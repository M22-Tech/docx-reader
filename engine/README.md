# Engine

The document engine is a web page (built to one self-contained `dist/viewer.html`) that the app runs inside a web view. It receives a file's bytes, works out the format from its contents, renders the document in Layout or Reading mode and reports back to the app through typed bridge messages. It has no access to the file system or the network. See `docs/design/00-architecture.md` for how it fits into the app.

## Setup

Run `./setup.sh` from the repo root, or `npm install` in this folder.

## Build

`npm run build` writes `dist/viewer.html`.

## Checks

`npm run check` runs lint, typecheck and the unit tests. `npm run test:coverage` runs the unit tests with a coverage report.
