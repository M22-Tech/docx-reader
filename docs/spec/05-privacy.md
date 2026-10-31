# Privacy

## Promises

- Documents never leave the device. The app makes no network requests of any kind: no analytics, crash reporting, ads, fonts, update checks or remote images.
- No account and no sign-in.
- The only things stored are the settings and, when "Keep recent files" is on, private copies of recently opened documents with their names, sizes and dates (`01-opening-files.md`).

## How this is enforced

- **No internet permission.** Release builds remove `android.permission.INTERNET` from the merged Android manifest (also any a library adds), so Android itself blocks network access. Development builds keep it, because the development server needs it. The Play Store listing shows the app has no internet access.
- **No other permissions.** Permissions that Expo and libraries add by default but the app doesn't use (draw over other apps, vibrate, read and write storage) are removed in every build. Files arrive through the picker, Open with and Share as `content://` addresses, which need no storage permission.
- **The viewer page blocks the network too.** Its Content-Security-Policy is `default-src 'none'` with only inline scripts and styles and `data:`/`blob:` images and fonts allowed, so even a document that links remote images or stylesheets can't trigger a request.
- **No navigation.** The web view never navigates away from the viewer page; links go to the app, which asks before handing them to the browser (`03-viewer.md`).
- **No backups of documents.** Android auto-backup and device-to-device transfer exclude the private copies folder, which also holds the recent list; only settings are backed up.
- **No logs of content.** Logs are off in release builds, and never contain document text in development (`CLAUDE.md`).
- **Nothing runs from documents.** Macros, scripts, embedded objects and form fields are never executed.

## Play Store data safety

The answers that follow from the above: no data collected, no data shared, data is not encrypted in transit because none is transmitted, and users can delete their data (remove recent files, or uninstall).
