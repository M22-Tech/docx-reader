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

`npm run android` goes through `../android-env.sh`, which picks a JDK 17 and the Android SDK whatever your shell's `JAVA_HOME` is.

## Licences

`npm run licences` collects the licences of the code that ships in the app, each with its licence text, deduplicated by name and version:

- The JavaScript in the app bundle: it runs `npx expo export --platform android --source-maps` into a temporary folder (deleted afterwards) and takes each package named in the bundle's source map (`scripts/source-map-packages.js`, tested in `plugins/source-map-packages.test.js`). Build tools such as Metro, Babel and the type checker are not in the bundle and so are not listed.
- The native modules autolinked on Android (`npx expo-modules-autolinking resolve` for Expo modules and `npx expo-modules-autolinking react-native-config` for React Native community modules, Expo's stand-in for `react-native config`, which needs the community CLI) and `react-native` itself.
- The engine's production dependencies, whose libraries are bundled into the viewer page.
- The Arimo font and DocX Reader itself.

Android libraries that Gradle pulls in (androidx and the like) are not covered. The script writes `src/licences/generated/licences.json` (generated and gitignored, like the viewer files) for the Open-source licences screens in Settings, prints how many entries it wrote and the packages that ship no licence text (those show the licence name only). It takes about ten seconds because of the export. `setup.sh` and the release builds run it; run it again after changing a dependency. Jest uses a small stub instead of the generated file.

## Production

Release builds have no internet permission and exclude the recent files folder from backups (`plugins/with-release-privacy.js`, `docs/spec/05-privacy.md`). Debug builds keep the permission for the development server.

### Upload key

Create the upload key once, with JDK 17's `keytool` (through `android-env.sh`) and outside the repo:

```
mkdir -p ~/.android-keys
../android-env.sh sh -c 'keytool -genkeypair -v -storetype PKCS12 -keystore ~/.android-keys/docx-reader-upload.p12 -alias upload -keyalg RSA -keysize 2048 -validity 10000'
```

Then put its details in `~/.gradle/gradle.properties` (never in the repo):

```
DOCX_READER_UPLOAD_STORE_FILE=/Users/you/.android-keys/docx-reader-upload.p12
DOCX_READER_UPLOAD_STORE_PASSWORD=...
DOCX_READER_UPLOAD_KEY_ALIAS=upload
DOCX_READER_UPLOAD_KEY_PASSWORD=...
```

Back the key file and its passwords up somewhere safe: if you lose the key, you can't publish updates under the same Play listing, unless Play App Signing is on (then Google holds the app signing key and can reset a lost upload key).

### Building

- `npm run build:apk` builds `android/app/build/outputs/apk/release/app-release.apk`, to install on a phone (`adb install -r`).
- `npm run build:aab` builds `android/app/build/outputs/bundle/release/app-release.aab`, to upload to the Play Console.

Both run `engine:sync` and `licences`, regenerate `android/` (`expo prebuild --clean`) and run Gradle through `../android-env.sh`. Without the four Gradle properties above the release is signed with the debug key and the script warns that it can't go to the Play Store. `android.versionCode` in `app.json` is 1; raise it for every upload.

### On your own phone, before publishing

A release APK runs on its own, without the Mac or the development server, and the debug key is fine for personal use.

1. `npm run build:apk`.
2. Install it with the cable: `$ANDROID_HOME/platform-tools/adb install -r android/app/build/outputs/apk/release/app-release.apk`. It installs over the development build, and settings and recent files stay. Without the cable: send the APK to the phone (WhatsApp, Drive or a USB copy), tap it, and allow that app to install apps when Android asks.
3. To update, repeat both steps.

Before installing from the Play Store later, uninstall this copy: Play installs are signed with Google's key, so Android won't update one into the other (only settings and recent files are lost).

## Engine sync

The viewer runs the engine's page in a web view. `npm run engine:sync` builds the engine (`npm run build` in `engine/`) and writes `src/viewer/generated/viewer-html.ts` (the page as a string) and `src/viewer/generated/bridge-messages.ts` (a copy of the engine's bridge types). The folder is generated and gitignored. Run it after every change in `engine/`, and before `npm run check` in a fresh clone if `setup.sh` wasn't run (the typecheck needs the generated files). Jest replaces the page with a stub, so tests don't need it.

## Checks

`npm run check` runs lint, typecheck and the unit tests (Jest with `jest-expo`). `npm run format` formats the code with Prettier. `npx expo export --platform android` builds the bundle without a phone.

## Config

There are no config files: the brand, limits and defaults are constants in `src/theme/` and `src/config/constants.ts`.
