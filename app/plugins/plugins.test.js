// Run with `npm run test:plugins` (node --test): each plugin's file-writing function on a temporary folder.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { writePrivacyFiles, setBackupAttributes } = require('./with-release-privacy');
const { addReleaseSigning, PROPERTIES } = require('./with-release-signing');

const GRADLE = `android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
            minifyEnabled true
        }
    }
}
`;

test('writes the release manifest that removes INTERNET', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  writePrivacyFiles(root);
  const manifest = fs.readFileSync(path.join(root, 'app/src/release/AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /xmlns:tools="http:\/\/schemas\.android\.com\/tools"/);
  assert.match(manifest, /<uses-permission android:name="android\.permission\.INTERNET" tools:node="remove" \/>/);
  fs.rmSync(root, { recursive: true });
});

test('writes backup rules that exclude the recent folder of the file domain', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  writePrivacyFiles(root);
  const xml = path.join(root, 'app/src/main/res/xml');
  const extraction = fs.readFileSync(path.join(xml, 'data_extraction_rules.xml'), 'utf8');
  assert.match(extraction, /<cloud-backup>\s*<exclude domain="file" path="recent" \/>\s*<\/cloud-backup>/);
  assert.match(extraction, /<device-transfer>\s*<exclude domain="file" path="recent" \/>\s*<\/device-transfer>/);
  const backup = fs.readFileSync(path.join(xml, 'backup_rules.xml'), 'utf8');
  assert.match(backup, /<full-backup-content>\s*<exclude domain="file" path="recent" \/>\s*<\/full-backup-content>/);
  fs.rmSync(root, { recursive: true });
});

test('writing twice gives the same files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plugin-test-'));
  writePrivacyFiles(root);
  const first = fs.readFileSync(path.join(root, 'app/src/release/AndroidManifest.xml'), 'utf8');
  writePrivacyFiles(root);
  assert.equal(fs.readFileSync(path.join(root, 'app/src/release/AndroidManifest.xml'), 'utf8'), first);
  fs.rmSync(root, { recursive: true });
});

test('sets both backup attributes on <application>', () => {
  const manifest = setBackupAttributes({ manifest: { application: [{ $: { 'android:allowBackup': 'true' } }] } });
  const attributes = manifest.manifest.application[0].$;
  assert.equal(attributes['android:dataExtractionRules'], '@xml/data_extraction_rules');
  assert.equal(attributes['android:fullBackupContent'], '@xml/backup_rules');
  assert.equal(attributes['android:allowBackup'], 'true');
});

test('adds a release signing config that reads the four Gradle properties', () => {
  const gradle = addReleaseSigning(GRADLE);
  for (const name of PROPERTIES) assert.ok(gradle.includes(`findProperty('${name}')`), name);
  assert.match(gradle, /signingConfigs \{[\s\S]*debug \{[\s\S]*\}\n        release \{[\s\S]*storeFile file\(/);
  assert.match(
    gradle,
    /release \{\n\s+signingConfig\(\(.*\) \? signingConfigs\.release : signingConfigs\.debug\)\n\s+minifyEnabled/,
  );
  assert.match(gradle, /debug \{\n\s+signingConfig signingConfigs\.debug\n/);
});

test('the signing patch is applied once', () => {
  const once = addReleaseSigning(GRADLE);
  assert.equal(addReleaseSigning(once), once);
});

test('the signing patch refuses a build.gradle it does not recognise', () => {
  assert.throws(() => addReleaseSigning('android {}'), /signingConfigs/);
});
