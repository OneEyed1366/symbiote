// Headless proof of the AccessibilityInfo module — no simulator. A fake
// __turboModuleProxy returns an AccessibilityInfo native module (state getters that
// invoke their success callback with known values, plus observe-counters); a fake
// RN$registerCallableModule captures the device hub so the test can play "native"
// and emit `screenReaderChanged`. We assert the initial isScreenReaderEnabled(),
// then drive a native change through the hub and assert the listener tracks it, then
// that remove() stops it and pings the module's removeListeners counter. A failure
// here is in JS.

import { AccessibilityInfo } from '../../packages/react/src/accessibility-info'

// ---- fake native-module + device-hub globals ----------------------------

let a11yAdded = 0
let a11yRemoved = 0
const screenReaderState = true
const reduceMotionState = false
const fakeAccessibilityInfo = {
  getCurrentVoiceOverState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(screenReaderState)
  },
  getCurrentReduceMotionState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(reduceMotionState)
  },
  getCurrentBoldTextState: (onSuccess: (enabled: boolean) => void): void => {
    onSuccess(false)
  },
  announceForAccessibility: (): void => {},
  setAccessibilityFocus: (): void => {},
  addListener: (): void => {
    a11yAdded += 1
  },
  removeListeners: (count: number): void => {
    a11yRemoved += count
  },
}
const registeredModules: Record<string, unknown> = {
  AccessibilityManager: fakeAccessibilityInfo,
}

// The device hub our code registers, captured so the test can act as "native".
let deviceHub: { emit: (eventType: string, ...args: unknown[]) => void } | undefined

Object.assign(globalThis, {
  // Trailing comma on the type param: in a .tsx file a bare <T> reads as JSX.
  __turboModuleProxy: <T,>(name: string): T | null => {
    const module = registeredModules[name]
    if (module === undefined || module === null) return null
    if (!isType<T>(module)) return null
    return module
  },
  RN$registerCallableModule: (
    name: string,
    factory: () => { emit: (eventType: string, ...args: unknown[]) => void },
  ): void => {
    if (name === 'RCTDeviceEventEmitter') deviceHub = factory()
  },
})

function isType<T>(value: unknown): value is T {
  return value !== null && value !== undefined
}

// ---- case 1: isScreenReaderEnabled resolves to the module's value --------

{
  const enabled = await AccessibilityInfo.isScreenReaderEnabled()
  if (enabled !== screenReaderState) {
    throw new Error(`expected isScreenReaderEnabled ${screenReaderState}, got ${String(enabled)}`)
  }
}

// ---- case 2: a 'screenReaderChanged' listener tracks a native change ------

{
  let received: unknown
  const sub = AccessibilityInfo.addEventListener('screenReaderChanged', (state) => {
    received = state
  })
  if (deviceHub === undefined) {
    throw new Error('AccessibilityInfo must install the device hub')
  }
  if (a11yAdded < 1) {
    throw new Error('AccessibilityInfo must ping the module addListener counter')
  }

  deviceHub.emit('screenReaderChanged', false)
  if (received !== false) {
    throw new Error(`screenReaderChanged listener should receive false, got ${String(received)}`)
  }

  const removedBefore = a11yRemoved
  received = undefined
  sub.remove()
  if (a11yRemoved !== removedBefore + 1) {
    throw new Error('remove() must ping the module removeListeners(1)')
  }
  deviceHub.emit('screenReaderChanged', true)
  if (received !== undefined) throw new Error('a removed listener must not fire')
}

console.log('accessibility-info.smoke OK')
