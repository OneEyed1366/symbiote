const path = require('path');
const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');

const projectRoot = __dirname;
const repoRoot = path.resolve(projectRoot, '../..');
const enginePkg = path.resolve(repoRoot, 'core/engine');
const componentsPkg = path.resolve(repoRoot, 'core/components');
const reactPkg = path.resolve(repoRoot, 'adapters/react');

/**
 * Metro is pointed straight at our packages' TypeScript source — there is no
 * build step. @react-native/babel-preset strips the types. react and
 * react-reconciler are pinned to the app's single copies so our adapter and the
 * app share one React instance.
 *
 * @type {import('@react-native/metro-config').MetroConfig}
 */
const config = {
  watchFolders: [enginePkg, componentsPkg, reactPkg],
  resolver: {
    extraNodeModules: {
      '@symbiote/engine': enginePkg,
      '@symbiote/components': componentsPkg,
      '@symbiote/react': reactPkg,
      react: path.resolve(projectRoot, 'node_modules/react'),
      'react-reconciler': path.resolve(projectRoot, 'node_modules/react-reconciler'),
    },
    nodeModulesPaths: [path.resolve(projectRoot, 'node_modules')],
  },
};

module.exports = mergeConfig(getDefaultConfig(projectRoot), config);
