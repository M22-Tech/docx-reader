# Look and settings

## Brand

The brand is fixed for this app (no brand config file); it comes from the "DocX Reader Icon" slides.

- Name "DocX Reader", Android package `tech.m22.docxreader`.
- Icon: the framed page with "DOC X READER" on a transparent background (`app/assets/brand/icon.png`), used for the splash screen (centred on the theme's background colour). The launcher icon is Android's adaptive icon: the same page, smaller, centred in the safe zone (`adaptive-icon.png`) on a white `#FFFFFF` background (the page's own colour), so the launcher's mask never cuts it.
- Wordmark: "DOC X READER" as an image on a transparent background, `wordmark-light.png` (blue) or `wordmark-dark.png` (white with a blue X) for the current theme, with the accessibility label "DocX Reader".
- Colours:

| | Background | Text | Accent | Wordmark X |
|---|---|---|---|---|
| Light | `#FFFFFF` | `#262626` | `#065591` | `#065591` |
| Dark | `#262626` | `#FFFFFF` | `#1F87D6` | `#1F87D6` |

- Font: Arimo (regular and bold) for every app screen, bundled with the app; the wordmark uses it too. Reading mode uses the device's serif or sans-serif font instead, so documents in any script display.

## Design

- Background and text colours, plus the accent; other shades are the text colour at an opacity. The accent is used only for the spinner, focus outlines, a selected option and a pressed button, never for body text (the dark mode accent is below 4.5:1 contrast on its background). Nothing relies on colour alone.
- Text at least 16 px, no thin lines, no shadows or gradients, large touch targets.
- Buttons are icons, not text, each with a label for screen readers (shown on long press).
- Buttons look pressed when tapped; anything that loads shows a spinner. With "Remove animations" on in Android settings, spinners are replaced by the text "Loading…".

## Screens

- **Home**: the header shows the wordmark and a settings button. Below it, the "Open file" card (pressable: icon, title "Open file", line "Pick a document from your phone", chevron), then a card titled "Recent files" with the list (`01-opening-files.md`). With no recent files, the card says "Documents you open will appear here." Any error from opening a file shows as a card above "Open file".
- **Viewer**: `03-viewer.md`.
- **Settings**: a back button and the cards below.
- With only these three screens there is no side menu; the home screen is the dashboard.

## Settings

Saved on the device and applied at once:

- **Theme**: light or dark. Until one is chosen the app follows the device setting; there is no "system" option. It is switched in the settings card, which shows the current mode next to the toggle; there is no theme button in the home header.
- **Default mode**: Layout or Reading (default Layout). Used when a document opens.
- **Reading text**: font style serif or sans (default sans) with each option previewed in its own font, and the text size (`03-viewer.md`), with a sample line.
- **Recent files**: "Keep recent files" on or off (default on; off clears them, after a confirmation) and "Clear recent files".
- **About**: app name, version, "Your documents never leave this phone." and a link-card "Open-source licences" that opens a screen listing each library with its licence text, bundled with the app.

## Fixed values

Limits and defaults are constants in the app (`app/src/config/constants.ts`), not a config file: large file warning 30 MB, at most 20 recent files, default mode Layout, reading text size 18 px (one of the sizes in `03-viewer.md`), render timeout 20 seconds.
