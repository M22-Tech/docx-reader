# Look and settings

## Brand

- The look comes from `app/config/brand.json` (copied from `app/config/brand.example.json`): app name, Android package name, app icon and adaptive icon background, the two colours for light and dark mode, and the two font families with the default style.
- Defaults: name "Docx Reader"; package `tech.m22.docxreader`; icon a page with a folded corner, paper on ink; light mode ink `#1F1E1D` on paper `#F4F3EE`, dark mode the same two colours swapped; sans font Inter, serif font Source Serif 4, default style sans.
- Brand fonts are used for the app's own screens. Reading mode uses the device's serif or sans-serif font instead, so documents in any script display.
- An invalid brand file stops the build with a message naming the field. The same goes for an icon file that doesn't exist and a font whose package is not installed.

## Design

- Two colours only; other shades are ink at an opacity. Nothing relies on colour alone.
- Text at least 16 px, no thin lines, no shadows or gradients, large touch targets.
- Buttons are icons, not text, each with a label for screen readers (shown on long press).
- Buttons look pressed when tapped; anything that loads shows a spinner. With "Remove animations" on in Android settings, spinners are replaced by the text "Loading…".

## Screens

- **Home**: the header shows the brand and buttons for the theme toggle and settings. Below it, the "Open file" card (pressable: icon, title "Open file", line "Pick a document from your phone", chevron), then a card titled "Recent files" with the list (`01-opening-files.md`). With no recent files, the card says "Documents you open will appear here." Any error from opening a file shows as a card above "Open file".
- **Viewer**: `03-viewer.md`.
- **Settings**: a back button and the cards below.
- With only these three screens there is no side menu; the home screen is the dashboard.

## Settings

Saved on the device and applied at once:

- **Theme**: light or dark. Until one is chosen the app follows the device setting; there is no "system" option. The home header toggle switches between light and dark (its icon shows the mode it switches to). The settings card has the same toggle with the current mode written next to it.
- **Default mode**: Layout or Reading (default from `defaultMode` in app config, "layout"). Used when a document opens.
- **Reading text**: font style serif or sans (default from the brand) with each option previewed in its own font, and the text size (`03-viewer.md`), with a sample line.
- **Recent files**: "Keep recent files" on or off (default on; off clears them, after a confirmation) and "Clear recent files".
- **About**: app name, version, "Your documents never leave this phone." and a link-card "Open-source licences" that opens a screen listing each library with its licence text, bundled with the app.

## App config

`app/config/app.json` (copied from `app/config/app.example.json`) holds the limits and defaults: `largeFileWarningMb` (default 30), `recentLimit` (default 20), `defaultMode` (`layout` or `reading`), `readingTextSize` (default 18; must be one of the sizes in `03-viewer.md`), `renderTimeoutSeconds` (default 20).
