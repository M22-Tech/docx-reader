// Makes the privacy promises true in Android release builds (docs/spec/05-privacy.md, How this is enforced):
// no INTERNET permission in the merged release manifest, and no backup of the recent folder.
const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

// The recent folder is Paths.document/recent; Paths.document is the app's filesDir, the backup domain "file".
const RECENT_PATH = 'recent';

const RELEASE_MANIFEST = `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android" xmlns:tools="http://schemas.android.com/tools">
  <uses-permission android:name="android.permission.INTERNET" tools:node="remove" />
</manifest>
`;

const DATA_EXTRACTION_RULES = `<?xml version="1.0" encoding="utf-8"?>
<data-extraction-rules>
  <cloud-backup>
    <exclude domain="file" path="${RECENT_PATH}" />
  </cloud-backup>
  <device-transfer>
    <exclude domain="file" path="${RECENT_PATH}" />
  </device-transfer>
</data-extraction-rules>
`;

const BACKUP_RULES = `<?xml version="1.0" encoding="utf-8"?>
<full-backup-content>
  <exclude domain="file" path="${RECENT_PATH}" />
</full-backup-content>
`;

function writeFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

/** Writes the release manifest and the two backup rule files into an Android project folder. */
function writePrivacyFiles(androidRoot) {
  const src = path.join(androidRoot, 'app', 'src');
  writeFile(path.join(src, 'release', 'AndroidManifest.xml'), RELEASE_MANIFEST);
  writeFile(path.join(src, 'main', 'res', 'xml', 'data_extraction_rules.xml'), DATA_EXTRACTION_RULES);
  writeFile(path.join(src, 'main', 'res', 'xml', 'backup_rules.xml'), BACKUP_RULES);
}

/** Points <application> at the two rule files. */
function setBackupAttributes(manifest) {
  const application = manifest.manifest.application?.[0];
  if (!application) throw new Error('with-release-privacy: the manifest has no <application>');
  application.$['android:dataExtractionRules'] = '@xml/data_extraction_rules';
  application.$['android:fullBackupContent'] = '@xml/backup_rules';
  return manifest;
}

function withReleasePrivacy(config) {
  config = withDangerousMod(config, [
    'android',
    (modConfig) => {
      writePrivacyFiles(modConfig.modRequest.platformProjectRoot);
      return modConfig;
    },
  ]);
  return withAndroidManifest(config, (modConfig) => {
    modConfig.modResults = setBackupAttributes(modConfig.modResults);
    return modConfig;
  });
}

module.exports = withReleasePrivacy;
module.exports.writePrivacyFiles = writePrivacyFiles;
module.exports.setBackupAttributes = setBackupAttributes;
module.exports.RELEASE_MANIFEST = RELEASE_MANIFEST;
