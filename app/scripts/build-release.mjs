// Builds a signed (or debug-signed) release APK or AAB: npm run build:apk / npm run build:aab
// Syncs the viewer, collects the licences, regenerates android/ and runs Gradle through ../android-env.sh.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const androidEnv = join(appRoot, '..', 'android-env.sh');
const KINDS = {
  apk: { task: 'assembleRelease', output: join('app', 'build', 'outputs', 'apk', 'release', 'app-release.apk') },
  aab: { task: 'bundleRelease', output: join('app', 'build', 'outputs', 'bundle', 'release', 'app-release.aab') },
};
const PROPERTIES = [
  'DOCX_READER_UPLOAD_STORE_FILE',
  'DOCX_READER_UPLOAD_STORE_PASSWORD',
  'DOCX_READER_UPLOAD_KEY_ALIAS',
  'DOCX_READER_UPLOAD_KEY_PASSWORD',
];

const kind = KINDS[process.argv[2] ?? ''];
if (!kind) {
  console.error('usage: node scripts/build-release.mjs apk|aab');
  process.exit(2);
}

function run(command, args, cwd = appRoot) {
  execFileSync(command, args, { cwd, stdio: 'inherit' });
}

/** The names set in ~/.gradle/gradle.properties or as ORG_GRADLE_PROJECT_<name> environment variables. */
function configuredProperties() {
  const names = new Set(PROPERTIES.filter((name) => process.env[`ORG_GRADLE_PROJECT_${name}`]));
  const file = join(process.env.GRADLE_USER_HOME ?? join(homedir(), '.gradle'), 'gradle.properties');
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const match = /^\s*([A-Z_]+)\s*[=:]\s*\S/.exec(line);
      if (match?.[1]) names.add(match[1]);
    }
  }
  return names;
}

const signed = PROPERTIES.every((name) => configuredProperties().has(name));
if (!signed) {
  console.warn(
    `\nbuild-release: WARNING: the upload key is not set (${PROPERTIES.join(', ')} in ~/.gradle/gradle.properties).\n` +
      'The release is signed with the debug key and cannot go to the Play Store.\n',
  );
}

run('npm', ['run', 'engine:sync']);
run('npm', ['run', 'licences']);
run('npx', ['expo', 'prebuild', '--platform', 'android', '--clean']);
run(androidEnv, ['./gradlew', kind.task], join(appRoot, 'android'));

const output = join(appRoot, 'android', kind.output);
console.log(`\nbuild-release: ${existsSync(output) ? 'built' : 'expected but not found'}: ${output}`);
console.log(signed ? 'Signed with the upload key.' : 'Signed with the debug key: not for the Play Store.');
