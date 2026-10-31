// Maps the `sources` paths of a bundle's source map to the npm packages they come from.
// Pure, so plugins/source-map-packages.test.js can test it; used by licences.mjs.

const MARKER = 'node_modules/';

/**
 * The package a source path belongs to, as { name, root }, or null when the path is not inside node_modules.
 * `root` is the path up to and including the package folder, so a caller can find its package.json.
 * Only the part after the last `node_modules/` counts (nested installs); a scoped name takes two segments.
 */
function packageOfSource(source) {
  const path = source.replaceAll('\\', '/');
  const at = path.lastIndexOf(MARKER);
  if (at === -1 || (at > 0 && path[at - 1] !== '/')) return null;
  const segments = path.slice(at + MARKER.length).split('/');
  const count = segments[0].startsWith('@') ? 2 : 1;
  if (segments.length <= count || segments.slice(0, count).some((segment) => segment === '')) return null;
  const name = segments.slice(0, count).join('/');
  return { name, root: path.slice(0, at + MARKER.length) + name };
}

/** The distinct packages of a list of source paths, in first-seen order. */
function packagesOfSources(sources) {
  const found = new Map();
  for (const source of sources) {
    const item = packageOfSource(source);
    if (item && !found.has(item.root)) found.set(item.root, item);
  }
  return [...found.values()];
}

module.exports = { packageOfSource, packagesOfSources };
