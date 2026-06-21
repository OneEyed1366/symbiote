// @symbiote/shared — the retained shadow-tree + clone-on-write commit engine.
// Every framework adapter drives this tiny mutation API; all Fabric-specific
// logic (tag allocation, view-name resolution, clone-on-write, event
// normalization) lives behind it, in one place.

export {
  createElement,
  createRawText,
  appendChild,
  insertBefore,
  removeChild,
  setProp,
  setEventListener,
  routeProp,
  setText,
  isSymbioteNode,
} from './node'
export { isEventFor } from './view-config'
export { registerComponent, setNativeViewConfigSource } from './registry'
export type {
  ComponentRegistration,
  NativeEventBinding,
  NativeViewConfig,
  NativeViewConfigSource,
  PropProcessor,
} from './registry'
export type { SymbioteNode, SymbioteEvent, Listener } from './node'

export { SymbioteSurface, createSurface } from './surface'
export { setEventDispatcher } from './dispatch'
export { setColorProcessor, dispatchViewCommand } from './commit'
export { flattenStyle } from './style'
export { StyleSheet, computeHairlineWidth } from './style-sheet'
export { Platform } from './platform'
export type {
  PlatformStatic,
  PlatformOSType,
  PlatformConstantsIOS,
  PlatformSelectSpec,
} from './platform'
export { dlog, isDebug } from './debug'

export { getNativeModule, getEnforcingNativeModule } from './native-modules'
export { installDeviceEventHub, NativeEventEmitter, setDeviceEventSource } from './native-events'
export type {
  EventSubscription,
  EventEmitterModule,
  NativeEventListener,
  DeviceEventSource,
} from './native-events'

export { getSlot } from './fabric'
export type {
  FabricSlot,
  FabricNode,
  FabricChildSet,
  FabricProps,
  FabricEventHandler,
  RootTag,
} from './fabric'
