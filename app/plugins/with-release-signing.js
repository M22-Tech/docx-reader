// Adds a `release` signing config to android/app/build.gradle that reads the upload key from Gradle properties
// (kept in ~/.gradle/gradle.properties, never in the repo). Without them the release build uses the debug key.
const { withAppBuildGradle } = require('expo/config-plugins');

const PROPERTIES = [
  'DOCX_READER_UPLOAD_STORE_FILE',
  'DOCX_READER_UPLOAD_STORE_PASSWORD',
  'DOCX_READER_UPLOAD_KEY_ALIAS',
  'DOCX_READER_UPLOAD_KEY_PASSWORD',
];

const MARKER = '// docx-reader: upload key';

const HAS_KEY = PROPERTIES.map((name) => `findProperty('${name}')`).join(' && ');

const SIGNING_CONFIG = `        release {
            ${MARKER}
            if (${HAS_KEY}) {
                storeFile file(findProperty('DOCX_READER_UPLOAD_STORE_FILE').replaceFirst('^~', System.getProperty('user.home')))
                storePassword findProperty('DOCX_READER_UPLOAD_STORE_PASSWORD')
                keyAlias findProperty('DOCX_READER_UPLOAD_KEY_ALIAS')
                keyPassword findProperty('DOCX_READER_UPLOAD_KEY_PASSWORD')
            }
        }
`;

const RELEASE_SIGNING = `signingConfig((${HAS_KEY}) ? signingConfigs.release : signingConfigs.debug)`;

/** Patches the text of android/app/build.gradle; throws if the generated file doesn't look as expected. */
function addReleaseSigning(gradle) {
  if (gradle.includes(MARKER)) return gradle;
  const signingConfigs = /(signingConfigs \{[\s\S]*?\n    \}\n)/.exec(gradle);
  if (!signingConfigs) throw new Error('with-release-signing: no signingConfigs block in build.gradle');
  const withConfig = gradle.replace(signingConfigs[1], (block) =>
    block.replace(/\n    \}\n$/, `\n${SIGNING_CONFIG}    }\n`),
  );
  const releaseSigning = /(buildTypes \{[\s\S]*?release \{[\s\S]*?)signingConfig signingConfigs\.debug/.exec(
    withConfig,
  );
  if (!releaseSigning) throw new Error('with-release-signing: no release build type in build.gradle');
  return withConfig.replace(releaseSigning[0], `${releaseSigning[1]}${RELEASE_SIGNING}`);
}

function withReleaseSigning(config) {
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = addReleaseSigning(modConfig.modResults.contents);
    return modConfig;
  });
}

module.exports = withReleaseSigning;
module.exports.addReleaseSigning = addReleaseSigning;
module.exports.PROPERTIES = PROPERTIES;
