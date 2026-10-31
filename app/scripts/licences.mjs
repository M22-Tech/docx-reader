// Collects the open-source licences of everything that ends up in the app and writes
// src/licences/generated/licences.json for the licences screens (docs/spec/04-look-and-settings.md, Settings, About).
// Only code that ships is listed, deduplicated by name and version:
// 1. the JavaScript in the app bundle: the packages named in the source map of `expo export`;
// 2. the native modules autolinked on Android, and react-native itself;
// 3. the engine's production dependency tree (`npm ls --omit=dev`), whose libraries are bundled into viewer.html;
// 4. the Arimo font and DocX Reader itself.
// Android libraries that Gradle pulls in (androidx and the like) are not covered.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const { packagesOfSources } = createRequire(import.meta.url)('./source-map-packages.js');

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(appRoot, '..');
const outFile = join(appRoot, 'src', 'licences', 'generated', 'licences.json');

const APP_NAME = 'DocX Reader';
const FONT_NAME = 'Arimo';
const FONT_LICENCE = 'SIL Open Font License 1.1';

/** The JSON a command prints on stdout; its progress and notices on stderr are dropped. */
function runJson(command, args, cwd) {
  const output = execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return JSON.parse(output.slice(output.indexOf('{')));
}

function readManifest(folder) {
  return JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
}

/** Every `.map` file under a folder. */
function findMaps(folder) {
  return readdirSync(folder, { recursive: true })
    .filter((file) => file.endsWith('.map'))
    .map((file) => join(folder, file));
}

/** The packages whose code is in the Android JavaScript bundle, found through its source map. */
function bundledPackages() {
  const out = mkdtempSync(join(tmpdir(), 'docx-reader-export-'));
  try {
    execFileSync('npx', ['expo', 'export', '--platform', 'android', '--source-maps', '--output-dir', out], {
      cwd: appRoot,
      stdio: 'ignore',
    });
    const maps = findMaps(out);
    if (maps.length === 0) throw new Error('expo export wrote no source map');
    const sources = maps.flatMap((file) => JSON.parse(readFileSync(file, 'utf8')).sources ?? []);
    // Source paths are relative to the app folder ("/node_modules/...").
    return packagesOfSources(sources).map(({ root }) =>
      join(appRoot, isAbsolute(root) && existsSync(root) ? root : `.${root}`),
    );
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

/** The packages autolinked on Android: Expo modules and React Native community modules (Expo's equivalent of `react-native config`, which needs the community CLI). */
function nativePackages() {
  const expoModules = runJson(
    'npx',
    ['expo-modules-autolinking', 'resolve', '--platform', 'android', '--json'],
    appRoot,
  );
  const community = runJson(
    'npx',
    ['expo-modules-autolinking', 'react-native-config', '--platform', 'android', '--json'],
    appRoot,
  );
  const folders = new Set();
  for (const module of expoModules.modules ?? []) {
    for (const project of module.projects ?? []) folders.add(dirname(project.sourceDir));
  }
  for (const dependency of Object.values(community.dependencies ?? {})) {
    if (dependency.platforms?.android && dependency.root) folders.add(dependency.root);
  }
  folders.add(join(appRoot, 'node_modules', 'react-native'));
  return [...folders];
}

/** `npm ls` exits non-zero for problems such as extraneous packages but still prints the tree. */
function listTree(folder) {
  let output;
  try {
    output = execFileSync('npm', ['ls', '--omit=dev', '--all', '--json', '--long'], {
      cwd: folder,
      encoding: 'utf8',
      maxBuffer: 256 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (error) {
    if (typeof error.stdout !== 'string' || error.stdout.length === 0) throw error;
    output = error.stdout;
  }
  return JSON.parse(output);
}

/** Every package in a tree as { name, version, path }, the root excluded. */
function collect(node, into) {
  for (const [name, child] of Object.entries(node.dependencies ?? {})) {
    if (child.version && child.path) into.push({ name, version: child.version, path: child.path });
    collect(child, into);
  }
  return into;
}

function licenceName(manifest) {
  const { license, licenses } = manifest;
  if (typeof license === 'string' && license) return license;
  if (license && typeof license.type === 'string') return license.type;
  if (Array.isArray(licenses) && licenses.length > 0) {
    return licenses
      .map((item) => (typeof item === 'string' ? item : item.type))
      .filter(Boolean)
      .join(' OR ');
  }
  return 'Unknown';
}

const BASE_NAMES = ['license', 'licence', 'copying'];

/** The licence file of a package folder: LICENSE, LICENCE or COPYING (any case, with .md/.txt), then LICENSE-MIT and the like. */
function findLicenceFile(folder, exactOnly = false) {
  let names;
  try {
    names = readdirSync(folder);
  } catch {
    return null;
  }
  const lower = (name) => name.toLowerCase();
  const exact = names.find((name) =>
    BASE_NAMES.some((base) => [base, `${base}.md`, `${base}.txt`].includes(lower(name))),
  );
  if (exact || exactOnly) return exact ? join(folder, exact) : null;
  const loose = names.find((name) => BASE_NAMES.some((base) => lower(name).startsWith(base)));
  return loose ? join(folder, loose) : null;
}

function readText(file) {
  return file ? readFileSync(file, 'utf8').trim() || null : null;
}

const found = new Map();
function add(item) {
  // Type definitions are only read by the compiler; nothing of them ships.
  if (item.name.startsWith('@types/')) return;
  const key = `${item.name}@${item.version}`;
  if (!found.has(key)) found.set(key, item);
}

for (const path of [...bundledPackages(), ...nativePackages()]) {
  const manifest = readManifest(path);
  add({ name: manifest.name, version: manifest.version, path });
}
for (const item of collect(listTree(join(repoRoot, 'engine')), [])) add(item);

const entries = [];
for (const item of found.values()) {
  const manifest = readManifest(item.path);
  entries.push({
    name: item.name,
    version: item.version,
    license: licenceName(manifest),
    text: readText(findLicenceFile(item.path)),
  });
}

const appManifest = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8'));
entries.push({
  name: APP_NAME,
  version: appManifest.version,
  license: 'MIT',
  text: readText(join(repoRoot, 'LICENSE')),
});

const arimoFolder = join(appRoot, 'node_modules', '@expo-google-fonts', 'arimo');
const fontFile = existsSync(arimoFolder) ? join(arimoFolder, 'LICENSE_FONT') : null;
const arimoManifest = JSON.parse(readFileSync(join(arimoFolder, 'package.json'), 'utf8'));
entries.push({
  name: FONT_NAME,
  version: arimoManifest.version,
  license: FONT_LICENCE,
  text: fontFile && existsSync(fontFile) ? readText(fontFile) : null,
});

entries.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, `${JSON.stringify(entries)}\n`);

const without = entries.filter((entry) => entry.text === null);
console.log(
  `licences: wrote ${entries.length} entries (${(JSON.stringify(entries).length / 1024).toFixed(0)} KB) to ${outFile}`,
);
if (without.length > 0) {
  console.log(`licences: ${without.length} without licence text (the licence name only is shown):`);
  for (const entry of without) console.log(`  ${entry.name}@${entry.version}  ${entry.license}`);
}
