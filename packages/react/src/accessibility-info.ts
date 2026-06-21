// AccessibilityInfo module — queries assistive-technology state (screen reader,
// reduce motion, bold text) and notifies on change. Native emits the device events
// `screenReaderChanged` / `reduceMotionChanged` (a bare boolean) through the device
// hub; this subscribes via a NativeEventEmitter bound to the AccessibilityInfo
// native module and re-broadcasts to JS listeners. The state getters are async on
// iOS (the native API is callback-based), so each returns a Promise. Mirrors RN's
// Libraries/Components/AccessibilityInfo/AccessibilityInfo.js, iOS surface only.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/shared'

// The iOS native module name RN registers this under. NOTE: this is the name the
// iOS JS wrapper (NativeAccessibilityManagerIOS) resolves via
// `TurboModuleRegistry.get('AccessibilityManager')` — NOT the spec filename
// `NativeAccessibilityManager`. Per the symbiote invariant, a module name is only
// provable on a real host (a headless fake answers to any name); this iOS name is
// device-verify-pending. See .docs/native-module-platform-routing.md.
const ACCESSIBILITY_MODULE = 'AccessibilityManager'

// The device events native emits (a bare boolean payload). RN's iOS EventNames map.
const NATIVE_EVENT = {
  screenReaderChanged: 'screenReaderChanged',
  reduceMotionChanged: 'reduceMotionChanged',
} as const

// The public event names callers subscribe to. Same strings as the iOS native
// events, but kept distinct so the mapping stays explicit (Android renames them).
const ACCESSIBILITY_EVENT = {
  screenReaderChanged: 'screenReaderChanged',
  reduceMotionChanged: 'reduceMotionChanged',
} as const

export type AccessibilityChangeEvent =
  (typeof ACCESSIBILITY_EVENT)[keyof typeof ACCESSIBILITY_EVENT]

type StateCallback = (enabled: boolean) => void
type ErrorCallback = (error: unknown) => void

// The iOS AccessibilityInfo native module: callback-based state getters,
// announce/focus side effects, plus the observe-counters.
interface NativeAccessibilityInfo extends EventEmitterModule {
  getCurrentVoiceOverState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentReduceMotionState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentBoldTextState(onSuccess: StateCallback, onError: ErrorCallback): void
  announceForAccessibility(announcement: string): void
  setAccessibilityFocus(reactTag: number): void
  addListener(eventType: string): void
  removeListeners(count: number): void
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean'
}

// Lazily resolved so importing this module has no native side effect: a headless
// run without a fake __turboModuleProxy still loads it; resolution happens on the
// first use. `null` when the module isn't linked.
let accessibilityModule: NativeAccessibilityInfo | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeAccessibilityInfo | null {
  if (accessibilityModule === undefined) {
    accessibilityModule = getNativeModule<NativeAccessibilityInfo>(ACCESSIBILITY_MODULE)
    dlog(`AccessibilityInfo: module ${accessibilityModule ? 'resolved' : 'NOT resolved (null)'}`)
  }
  return accessibilityModule
}

function getEmitter(): NativeEventEmitter {
  if (emitter === undefined) {
    // WHY lazy: install on first subscribe so the hub exists before native emits,
    // without a hard bootstrap-order dependency. Idempotent.
    installDeviceEventHub()
    emitter = new NativeEventEmitter(getModule() ?? undefined)
  }
  return emitter
}

class AccessibilityInfoImpl {
  // Query whether a screen reader (VoiceOver) is currently enabled.
  isScreenReaderEnabled(): Promise<boolean> {
    const module = getModule()
    if (module === null) {
      return Promise.reject(new Error('AccessibilityInfo native module is not available'))
    }
    return new Promise((resolve, reject) => {
      module.getCurrentVoiceOverState(resolve, reject)
    })
  }

  // Query whether reduce motion is currently enabled.
  isReduceMotionEnabled(): Promise<boolean> {
    const module = getModule()
    if (module === null) {
      return Promise.reject(new Error('AccessibilityInfo native module is not available'))
    }
    return new Promise((resolve, reject) => {
      module.getCurrentReduceMotionState(resolve, reject)
    })
  }

  // Query whether bold text is currently enabled.
  isBoldTextEnabled(): Promise<boolean> {
    const module = getModule()
    if (module === null) {
      return Promise.reject(new Error('AccessibilityInfo native module is not available'))
    }
    return new Promise((resolve, reject) => {
      module.getCurrentBoldTextState(resolve, reject)
    })
  }

  // Post a string to be announced by the screen reader. No-op without a module.
  announceForAccessibility(announcement: string): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo.announceForAccessibility -> no module (no-op)')
      return
    }
    module.announceForAccessibility(announcement)
  }

  // Move accessibility focus to the view with the given react tag. No-op without a
  // module. RN deprecates this in favor of sendAccessibilityEvent; kept for parity.
  setAccessibilityFocus(reactTag: number): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo.setAccessibilityFocus -> no module (no-op)')
      return
    }
    module.setAccessibilityFocus(reactTag)
  }

  // Subscribe to an accessibility-state change. The listener receives a boolean.
  // Never throws — a missing module yields a live-but-silent subscription (the
  // counters are no-ops without a module).
  addEventListener(
    type: AccessibilityChangeEvent,
    handler: (enabled: boolean) => void,
  ): EventSubscription {
    const eventEmitter = getEmitter()
    dlog(`AccessibilityInfo.addEventListener -> ${type}`)
    const deviceEvent =
      type === ACCESSIBILITY_EVENT.reduceMotionChanged
        ? NATIVE_EVENT.reduceMotionChanged
        : NATIVE_EVENT.screenReaderChanged
    return eventEmitter.addListener(deviceEvent, (payload) => {
      if (!isBoolean(payload)) return
      handler(payload)
    })
  }
}

export const AccessibilityInfo = new AccessibilityInfoImpl()
