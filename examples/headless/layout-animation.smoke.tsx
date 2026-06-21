// Headless proof of the LayoutAnimation module — JS surface + that configureNext
// ships its config to the native UIManager. A fake native module (installed via the
// New-Architecture `__turboModuleProxy` global, the same global getNativeModule
// reads) records `configureNextLayoutAnimation` calls. We assert the preset/config
// shapes, that configureNext dispatches the config to native, and that with NO
// module installed configureNext is a safe no-op (no throw).
//
// IMPORTANT: this only proves the JS surface and the dispatch. The actual layout
// animation — and whether the chosen native module NAME is the real one on a given
// platform — is verified ON-DEVICE / on the simulator, never headless: a headless
// fake answers to any name, so a wrong-but-plausible name passes here and only fails
// on a real host (see .docs/native-module-platform-routing.md).

import {
  LayoutAnimation,
  type LayoutAnimationConfig,
} from '../../packages/react/src/layout-animation'

// ---- fake native UIManager ----------------------------------------------

// The module name the impl resolves first. Kept in sync with layout-animation.ts's
// NATIVE_UI_MANAGER_NAME.primary (DEVICE-VERIFY-PENDING on a real host).
const NATIVE_MODULE_NAME = 'UIManager'

interface CapturedCall {
  config: LayoutAnimationConfig
  onSuccess: () => void
  onError: () => void
}

let captured: CapturedCall | null = null

const fakeUIManager = {
  configureNextLayoutAnimation(
    config: LayoutAnimationConfig,
    onSuccess: () => void,
    onError: () => void,
  ): void {
    captured = { config, onSuccess, onError }
  },
}

// `installed` flips so we can re-run the resolution with NO module present.
let installed = true

Object.assign(globalThis, {
  __turboModuleProxy: (name: string): unknown =>
    installed && name === NATIVE_MODULE_NAME ? fakeUIManager : null,
})

// ---- assertions ----------------------------------------------------------

function fail(message: string): never {
  throw new Error(message)
}

// 1. Presets.easeInEaseOut has the expected shape (300ms, easeInEaseOut/opacity).
const preset = LayoutAnimation.Presets.easeInEaseOut
if (preset.duration !== 300) fail(`easeInEaseOut duration should be 300, got ${preset.duration}`)
if (preset.create?.type !== 'easeInEaseOut' || preset.create?.property !== 'opacity') {
  fail(`easeInEaseOut.create wrong: ${JSON.stringify(preset.create)}`)
}
if (preset.update?.type !== 'easeInEaseOut') {
  fail(`easeInEaseOut.update wrong: ${JSON.stringify(preset.update)}`)
}
if (preset.delete?.type !== 'easeInEaseOut' || preset.delete?.property !== 'opacity') {
  fail(`easeInEaseOut.delete wrong: ${JSON.stringify(preset.delete)}`)
}

// 2. create(300) builds a well-formed config: create/delete carry type+property,
//    update carries only type.
const built = LayoutAnimation.create(300, LayoutAnimation.Types.linear, LayoutAnimation.Properties.scaleXY)
if (built.duration !== 300) fail(`create duration should be 300, got ${built.duration}`)
if (built.create?.type !== 'linear' || built.create?.property !== 'scaleXY') {
  fail(`create.create wrong: ${JSON.stringify(built.create)}`)
}
if (built.update?.type !== 'linear' || built.update?.property !== undefined) {
  fail(`create.update should carry only type: ${JSON.stringify(built.update)}`)
}
if (built.delete?.type !== 'linear' || built.delete?.property !== 'scaleXY') {
  fail(`create.delete wrong: ${JSON.stringify(built.delete)}`)
}

// 3. configureNext(preset) dispatches THAT config to native.
let didEnd = false
LayoutAnimation.configureNext(preset, () => {
  didEnd = true
})
if (captured === null) fail('configureNextLayoutAnimation was never called on the native module')
if (captured.config !== preset) {
  fail(`native received a different config than passed: ${JSON.stringify(captured.config)}`)
}
// The success callback native invokes must drive onAnimationDidEnd.
captured.onSuccess()
if (!didEnd) fail('native onSuccess did not drive onAnimationDidEnd')

// 4. With NO module installed, configureNext is a safe no-op (no throw). Flip the
//    fake off and reset the lazily-cached resolution by re-importing a fresh module
//    instance — simplest here is a second module with its own cache.
installed = false
captured = null

// The impl caches its resolved module on first call, so to exercise the
// absent-module path we load a fresh copy whose cache is empty.
const freshModule = await import(
  `../../packages/react/src/layout-animation?nocache=${Date.now()}`
)
const freshLayoutAnimation: { configureNext: (config: LayoutAnimationConfig) => void } =
  freshModule.LayoutAnimation

let threw = false
try {
  freshLayoutAnimation.configureNext(preset)
} catch {
  threw = true
}
if (threw) fail('configureNext must be a safe no-op when no native module is installed')
if (captured !== null) fail('configureNext should NOT call native when the module is absent')

console.log('layout-animation.smoke OK')
