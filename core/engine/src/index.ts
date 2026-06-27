// @symbiote/engine — the retained shadow-tree + clone-on-write commit engine.
// Every framework adapter drives this tiny mutation API; all Fabric-specific
// logic (tag allocation, view-name resolution, clone-on-write, event
// normalization) lives behind it, in one place.

export {
  createElement,
  createRawText,
  createAnchor,
  isAnchor,
  appendChild,
  insertBefore,
  removeChild,
  setProp,
  setEventListener,
  routeProp,
  setText,
  isSymbioteNode,
  RAW_TEXT_COMPONENT,
} from './node'
export { isEventFor } from './view-config'
export { registerComponent, setNativeViewConfigSource } from './registry'
// InteractionManager — pure JS (timers + emitter), framework-agnostic, so it lives
// here; every adapter re-exports it.
export { InteractionManager, Events as InteractionManagerEvents } from './interaction-manager'
export type {
  IInteractionEvent,
  ISimpleTask,
  IPromiseTask,
  ITask,
  IHandle,
  ICancellable,
} from './interaction-manager'
export type {
  IComponentRegistration,
  INativeEventBinding,
  INativeViewConfig,
  INativeViewConfigSource,
  IPropProcessor,
} from './registry'
export type { ISymbioteNode, ISymbioteEvent, IListener } from './node'

export { SymbioteSurface, createSurface } from './surface'
export { setEventDispatcher } from './dispatch'
export {
  setColorProcessor,
  processColor,
  dispatchViewCommand,
  sendAccessibilityEvent,
  setNativeProps,
  getNativeTag,
  getNativeNode,
  measure,
  measureInWindow,
  measureLayout,
  disposeRoot,
} from './commit'
export { PlatformColor, DynamicColorIOS, isOpaqueColorValue } from './platform-color'
export type { IColorValue, IOpaqueColorValue, IDynamicColorIOSTuple } from './platform-color'
// CSS-style processors (boxShadow/filter): RN parses these in JS before native because
// enableNativeCSSParsing() defaults to false. Exported so an adapter / test can reuse them.
export { processBoxShadow } from './process-box-shadow'
export type { IParsedBoxShadow } from './process-box-shadow'
export { processFilter } from './process-filter'
export type { IParsedFilter, IParsedDropShadow } from './process-filter'
export { processTransformOrigin } from './process-transform-origin'
export { processTransform } from './process-transform'
export { processAspectRatio } from './process-aspect-ratio'
export { processFontVariant } from './process-font-variant'
export { flattenStyle } from './style'
// The typed style surface — agnostic types, re-exported by every adapter (it used to
// live in @symbiote/react; moved here so @symbiote/components can type render fns).
export type {
  IViewStyle,
  ITextStyle,
  IStyleProp,
  IDimensionValue,
  IFlexAlign,
  IFlexJustify,
  ITransformProp,
  IBoxShadowValue,
  IDropShadowValue,
  IFilterFunction,
  IBlendMode,
} from './styles'
export { StyleSheet, computeHairlineWidth } from './style-sheet'
export { Platform } from './platform'
export type { IPlatformStatic, IPlatformOSType, IPlatformSelectSpec } from './platform'
// The per-platform constants types come from their own files, not the host-selected
// `./platform` — on an Android Metro build `./platform` IS platform.android.ts, which
// has no PlatformConstantsIOS. These are type-only (erased at runtime), so naming the
// explicit file pulls no cross-platform runtime code.
export type { IPlatformConstantsIOS } from './platform.ios'
export type { IPlatformConstantsAndroid } from './platform.android'
export { dlog, isDebug } from './debug'

export { getNativeModule, getEnforcingNativeModule } from './native-modules'
export { installDeviceEventHub, NativeEventEmitter, setDeviceEventSource } from './native-events'
export type {
  IEventSubscription,
  IEventEmitterModule,
  INativeEventListener,
  IDeviceEventSource,
} from './native-events'

export {
  AnimatedNode,
  AnimatedWithChildren,
  AnimatedValue,
  AnimatedValueXY,
  AnimatedColor,
  AnimatedInterpolation,
  AnimatedAddition,
  AnimatedSubtraction,
  AnimatedMultiplication,
  AnimatedDivision,
  AnimatedModulo,
  AnimatedDiffClamp,
  AnimatedEvent,
  add,
  subtract,
  multiply,
  divide,
  modulo,
  diffClamp,
  event,
  forkEvent,
  unforkEvent,
  attachNativeEvent,
  attachNativeEventHandler,
  flushValue,
  Easing,
  createNumericInterpolation,
  checkValidRanges,
  TimingAnimation,
  SpringAnimation,
  DecayAnimation,
  AnimatedTracking,
  timing,
  spring,
  decay,
  parallel,
  sequence,
  stagger,
  loop,
  delay,
  nativeAnimated,
  isNativeAnimatedAvailable,
  AnimatedProps,
  AnimatedStyle,
  AnimatedTransform,
  AnimatedMock,
  reduceProps,
  isAnimatedNode,
  readPassthroughStyle,
  resolveHostNode,
} from './animated'
export type {
  IValueXY,
  IRgbaValue,
  IColorInput,
  IEventConfig,
  IEventListener,
  IAnimatedEventHandler,
  INativeEventAttachment,
  IValueListener,
  IEasingFunction,
  IInterpolationConfig,
  IExtrapolateType,
  IAnimation,
  IEndCallback,
  IEndResult,
  ICompositeAnimation,
  ITimingConfig,
  ISpringConfig,
  IDecayConfig,
  IParallelConfig,
  ILoopAnimationConfig,
  INativeNodeConfig,
  INativeAnimationConfig,
  INativeEventMapping,
  IPlatformConfig,
} from './animated'

export { getSlot } from './fabric'
export type {
  IFabricSlot,
  IFabricNode,
  IFabricChildSet,
  IFabricProps,
  IFabricEventHandler,
  IRootTag,
  IMeasureOnSuccess,
  IMeasureInWindowOnSuccess,
  IMeasureLayoutOnSuccess,
} from './fabric'
