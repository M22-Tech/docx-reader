# App

The DocX Reader Android app (Expo): home, settings and viewer screens. See `docs/spec/` for what it does and `docs/design/00-architecture.md` for how it is built.

## Setup

Run `./setup.sh` from the repo root, or `npm install` in this folder.

## Run on a phone

1. On the phone, turn on Developer options (Settings → About phone → tap "Build number" seven times), then Settings → System → Developer options → USB debugging.
2. Connect it to the Mac with a USB cable and accept "Allow USB debugging?" on the phone.
3. Check the Mac sees it: `$ANDROID_HOME/platform-tools/adb devices` should list one device as `device` (`unauthorized` means the prompt on the phone is still open).
4. `npm run android` builds the app, installs it on the phone and opens it, with the development server running so code changes reload on the phone. The first build takes 10 to 20 minutes.

Without a cable (Android 11 and later): Developer options → Wireless debugging → "Pair device with pairing code", then `$ANDROID_HOME/platform-tools/adb pair <ip>:<port>` and `$ANDROID_HOME/platform-tools/adb connect <ip>:<port>` with the addresses the phone shows, then `npm run android`.

After changing `app.json`, the icons, the splash or a native dependency, regenerate the Android project before running again: `npx expo prebuild --platform android --clean && npm run android` (`android/` is generated and gitignored). If the launcher still shows the old icon, uninstall the app from the phone first; some launchers cache icons.

`npm run android` goes through `../android-env.sh`, which picks a JDK 17 and the Android SDK whatever your shell's `JAVA_HOME` is. Production builds come later.

## Engine sync

The viewer runs the engine's page in a web view. `npm run engine:sync` builds the engine (`npm run build` in `engine/`) and writes `src/viewer/generated/viewer-html.ts` (the page as a string) and `src/viewer/generated/bridge-messages.ts` (a copy of the engine's bridge types). The folder is generated and gitignored. Run it after every change in `engine/`, and before `npm run check` in a fresh clone if `setup.sh` wasn't run (the typecheck needs the generated files). Jest replaces the page with a stub, so tests don't need it.

## Checks

`npm run check` runs lint, typecheck and the unit tests (Jest with `jest-expo`). `npm run format` formats the code with Prettier. `npx expo export --platform android` builds the bundle without a phone.

## Config

There are no config files: the brand, limits and defaults are constants in `src/theme/` and `src/config/constants.ts`.
