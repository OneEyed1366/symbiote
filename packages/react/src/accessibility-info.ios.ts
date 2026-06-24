// AccessibilityInfo on iOS — wraps the `AccessibilityManager` native module: callback-
// based state getters (VoiceOver / reduce-motion / bold-text / grayscale / invert-colors /
// reduce-transparency / darker-system-colors), announce + focus side effects, and the
// observe-counters for the device-event subscription. Subscribes to iOS device events
// (`screenReaderChanged` / `reduceMotionChanged` / `boldTextChanged` / …) via a
// NativeEventEmitter and re-broadcasts to JS listeners. Metro picks this on an iOS host;
// the bare accessibility-info.ts re-exports it as the default for tsc / tsx / headless.
// Mirrors RN's AccessibilityInfo.js iOS branches.

import {
  installDeviceEventHub,
  NativeEventEmitter,
  getNativeModule,
  type EventEmitterModule,
  type EventSubscription,
  dlog,
} from '@symbiote/shared'
import {
  isBoolean,
  type AccessibilityAnnouncementFinishedEvent,
  type AccessibilityChangeEventName,
  type AccessibilityChangeEventHandler,
  type AccessibilityInfoStatic,
  type AnnounceForAccessibilityOptions,
  type AccessibilityEventType,
  type AccessibilityHandle,
} from './accessibility-info-shared'
import { findNodeHandle } from './host-instance'
export type {
  AccessibilityChangeEvent,
  AccessibilityChangeEventName,
  AccessibilityChangeEventHandler,
  AccessibilityAnnouncementFinishedEvent,
  AnnounceForAccessibilityOptions,
  AccessibilityEventType,
} from './accessibility-info-shared'

// The iOS native module name RN registers this under. NOTE: this is the name the iOS JS
// wrapper (NativeAccessibilityManagerIOS) resolves via
// `TurboModuleRegistry.get('AccessibilityManager')` — NOT the spec filename
// `NativeAccessibilityManager`. Per the symbiote invariant, a module name is only provable
// on a real host (a headless fake answers to any name); this iOS name is device-verified
// (the pre-split file shipped it). See .docs/native-module-platform-routing.md.
const ACCESSIBILITY_MODULE = 'AccessibilityManager'

// Public event name -> the iOS device event the native side emits. iOS keeps the names
// 1:1; the indirection exists only so the mapping stays explicit (Android renames them).
const IOS_DEVICE_EVENT: Partial<Record<AccessibilityChangeEventName, string>> = {
  screenReaderChanged: 'screenReaderChanged',
  reduceMotionChanged: 'reduceMotionChanged',
  boldTextChanged: 'boldTextChanged',
  grayscaleChanged: 'grayscaleChanged',
  invertColorsChanged: 'invertColorsChanged',
  reduceTransparencyChanged: 'reduceTransparencyChanged',
  darkerSystemColorsChanged: 'darkerSystemColorsChanged',
  announcementFinished: 'announcementFinished',
}

type StateCallback = (enabled: boolean) => void
type ErrorCallback = (error: unknown) => void

// The iOS AccessibilityManager native module: callback-based state getters, announce /
// focus side effects, plus the observe-counters. announceForAccessibilityWithOptions is
// optional — older hosts only have the plain announce.
interface NativeAccessibilityManagerIOS extends EventEmitterModule {
  getCurrentVoiceOverState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentReduceMotionState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentBoldTextState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentGrayscaleState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentInvertColorsState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentReduceTransparencyState(onSuccess: StateCallback, onError: ErrorCallback): void
  getCurrentDarkerSystemColorsState?(onSuccess: StateCallback, onError: ErrorCallback): void
  announceForAccessibility(announcement: string): void
  announceForAccessibilityWithOptions?(
    announcement: string,
    options: AnnounceForAccessibilityOptions,
  ): void
  setAccessibilityFocus(reactTag: number): void
  addListener(eventType: string): void
  removeListeners(count: number): void
}

// Lazily resolved so importing this module has no native side effect: a headless run
// without a fake __turboModuleProxy still loads it; resolution happens on first use.
// `null` when the module isn't linked.
let accessibilityModule: NativeAccessibilityManagerIOS | null | undefined
let emitter: NativeEventEmitter | undefined

function getModule(): NativeAccessibilityManagerIOS | null {
  if (accessibilityModule === undefined) {
    accessibilityModule = getNativeModule<NativeAccessibilityManagerIOS>(ACCESSIBILITY_MODULE)
    dlog(`AccessibilityInfo(ios): module ${accessibilityModule ? 'resolved' : 'NOT resolved (null)'}`)
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

// Run a callback-based native getter as a Promise; resolves false when the module is
// unlinked, mirroring RN's "unavailable query -> false" contract for the cross-platform
// getters. (RN rejects on iOS, but a false fallback keeps the unified surface uniform with
// Android's missing-method getters; the dlog records the miss.)
function queryState(
  pick: (module: NativeAccessibilityManagerIOS) => (s: StateCallback, e: ErrorCallback) => void,
  label: string,
): Promise<boolean> {
  const module = getModule()
  if (module === null) {
    dlog(`AccessibilityInfo(ios).${label} -> no module (false)`)
    return Promise.resolve(false)
  }
  const getter = pick(module)
  return new Promise((resolve, reject) => {
    getter.call(
      module,
      (enabled) => resolve(enabled),
      (error) => reject(error),
    )
  })
}

class AccessibilityInfoIOS implements AccessibilityInfoStatic {
  isScreenReaderEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentVoiceOverState, 'isScreenReaderEnabled')
  }

  isReduceMotionEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentReduceMotionState, 'isReduceMotionEnabled')
  }

  isBoldTextEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentBoldTextState, 'isBoldTextEnabled')
  }

  isGrayscaleEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentGrayscaleState, 'isGrayscaleEnabled')
  }

  isInvertColorsEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentInvertColorsState, 'isInvertColorsEnabled')
  }

  isReduceTransparencyEnabled(): Promise<boolean> {
    return queryState((m) => m.getCurrentReduceTransparencyState, 'isReduceTransparencyEnabled')
  }

  // Android-only query; iOS has no high-text-contrast concept, so resolve false (RN parity).
  isHighTextContrastEnabled(): Promise<boolean> {
    return Promise.resolve(false)
  }

  // Android-only query; on iOS RN rejects. We resolve false to keep the unified surface
  // non-throwing — the dlog records that it's a no-op on this platform.
  isAccessibilityServiceEnabled(): Promise<boolean> {
    dlog('AccessibilityInfo(ios).isAccessibilityServiceEnabled -> Android-only (false)')
    return Promise.resolve(false)
  }

  // Post a string to be announced by the screen reader. No-op without a module.
  announceForAccessibility(announcement: string): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo(ios).announceForAccessibility -> no module (no-op)')
      return
    }
    module.announceForAccessibility(announcement)
  }

  // Announce with queue/priority options. Falls back to the plain announce when the host
  // lacks the options-aware method (older iOS), mirroring RN.
  announceForAccessibilityWithOptions(
    announcement: string,
    options: AnnounceForAccessibilityOptions,
  ): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo(ios).announceForAccessibilityWithOptions -> no module (no-op)')
      return
    }
    if (module.announceForAccessibilityWithOptions) {
      module.announceForAccessibilityWithOptions(announcement, options)
    } else {
      module.announceForAccessibility(announcement)
    }
  }

  // Move accessibility focus to the view with the given react tag. No-op without a module.
  // RN deprecates this in favor of sendAccessibilityEvent; kept for parity.
  setAccessibilityFocus(reactTag: number): void {
    const module = getModule()
    if (module === null) {
      dlog('AccessibilityInfo(ios).setAccessibilityFocus -> no module (no-op)')
      return
    }
    dlog(`AccessibilityInfo(ios).setAccessibilityFocus -> ${reactTag}`)
    module.setAccessibilityFocus(reactTag)
  }

  // iOS has no recommended-timeout query; resolve the original (RN parity).
  getRecommendedTimeoutMillis(originalTimeout: number): Promise<number> {
    return Promise.resolve(originalTimeout)
  }

  // RN's iOS legacySendAccessibilityEvent: resolve the handle to a native tag, and for a
  // 'focus' event move accessibility focus there. findNodeHandle is symbiote's renderer-proxy
  // equivalent (ref/instance -> committed reactTag; a number passes through). Non-'focus'
  // events have no iOS native producer — RN ignores them on iOS too, so they stay a no-op.
  sendAccessibilityEvent(handle: AccessibilityHandle, eventType: AccessibilityEventType): void {
    if (eventType !== 'focus') {
      dlog(`AccessibilityInfo(ios).sendAccessibilityEvent("${eventType}") -> no iOS producer (no-op)`)
      return
    }
    const reactTag = findNodeHandle(handle)
    dlog(`AccessibilityInfo(ios).sendAccessibilityEvent("focus") -> tag ${String(reactTag)}`)
    if (reactTag === null) return
    this.setAccessibilityFocus(reactTag)
  }

  // Subscribe to an accessibility-state change. A handler for a boolean event receives a
  // boolean; the iOS-only `announcementFinished` carries the announcement payload. Never
  // throws — a public event with no iOS device mapping yields an inert subscription, and a
  // missing module yields a live-but-silent one (the counters are no-ops without a module).
  addEventListener(
    eventName: AccessibilityChangeEventName,
    handler: AccessibilityChangeEventHandler,
  ): EventSubscription {
    const deviceEvent = IOS_DEVICE_EVENT[eventName]
    dlog(`AccessibilityInfo(ios).addEventListener -> ${eventName} (device: ${deviceEvent ?? 'none'})`)
    if (deviceEvent === undefined) {
      return { remove(): void {} }
    }
    const eventEmitter = getEmitter()
    return eventEmitter.addListener(deviceEvent, (payload) => {
      // Most events carry a bare boolean; announcementFinished carries an object. Forward
      // each in its own shape, dropping payloads that match neither so we never forward
      // garbage to the handler.
      if (eventName === 'announcementFinished') {
        if (isAnnouncementFinished(payload)) handler(payload)
        return
      }
      if (!isBoolean(payload)) return
      handler(payload)
    })
  }
}

function isAnnouncementFinished(
  payload: unknown,
): payload is AccessibilityAnnouncementFinishedEvent {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'announcement' in payload &&
    typeof payload.announcement === 'string' &&
    'success' in payload &&
    typeof payload.success === 'boolean'
  )
}

export const AccessibilityInfo: AccessibilityInfoStatic = new AccessibilityInfoIOS()
