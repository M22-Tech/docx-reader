// Run with `npm run test:plugins` (node --test).
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { packageOfSource, packagesOfSources } = require('../scripts/source-map-packages');

test('a plain package', () => {
  assert.deepEqual(packageOfSource('/app/node_modules/react/index.js'), {
    name: 'react',
    root: '/app/node_modules/react',
  });
  assert.equal(packageOfSource('../node_modules/zod/v4/core/index.js').name, 'zod');
});

test('a scoped package takes two segments', () => {
  const item = packageOfSource('/app/node_modules/@react-navigation/native/src/index.js');
  assert.equal(item.name, '@react-navigation/native');
  assert.equal(item.root, '/app/node_modules/@react-navigation/native');
});

test('a nested node_modules uses the last one', () => {
  const item = packageOfSource('/app/node_modules/expo-router/node_modules/@scope/inner/lib/a.js');
  assert.equal(item.name, '@scope/inner');
  assert.equal(item.root, '/app/node_modules/expo-router/node_modules/@scope/inner');
  assert.equal(packageOfSource('/app/node_modules/a/node_modules/b/c.js').name, 'b');
});

test('paths outside node_modules are ignored', () => {
  assert.equal(packageOfSource('/app/src/app/index.tsx'), null);
  assert.equal(packageOfSource('/app/my_node_modules/x/index.js'), null);
  assert.equal(packageOfSource('/app/node_modules/'), null);
  assert.equal(packageOfSource('/app/node_modules/react'), null);
  assert.equal(packageOfSource('/app/node_modules/@scope/only.js'), null);
});

test('Windows separators work', () => {
  assert.equal(packageOfSource('C:\\app\\node_modules\\@a\\b\\x.js').name, '@a/b');
});

test('packagesOfSources deduplicates by package folder', () => {
  const list = packagesOfSources([
    '/app/src/x.ts',
    '/app/node_modules/react/index.js',
    '/app/node_modules/react/cjs/react.js',
    '/app/node_modules/@a/b/index.js',
    '/app/node_modules/x/node_modules/react/index.js',
  ]);
  assert.deepEqual(
    list.map((item) => item.root),
    ['/app/node_modules/react', '/app/node_modules/@a/b', '/app/node_modules/x/node_modules/react'],
  );
});
