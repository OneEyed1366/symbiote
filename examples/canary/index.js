/**
 * @format
 *
 * Symbiote canary entry. Instead of AppRegistry.registerComponent (which runs
 * React Native's own renderer), we register a low-level runnable. The native
 * Fabric host calls it with the surface's rootTag; our renderer takes it from
 * there and drives nativeFabricUIManager directly via @symbiote/shared.
 */

import { AppRegistry, processColor } from 'react-native';
import { createElement } from 'react';
import { mount } from '@symbiote/react';
import { setColorProcessor } from '@symbiote/shared';
import App from './App';
import { name as appName } from './app.json';

// Colors reach Fabric as platform ints; let shared use RN's own converter.
setColorProcessor(processColor);

AppRegistry.registerRunnable(appName, appParameters => {
  mount(appParameters.rootTag, createElement(App));
});
