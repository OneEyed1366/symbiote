// The Platform API — a faithful, iOS-first port of React Native's
// Libraries/Utilities/Platform.ios.js. `OS` is a static 'ios' (symbiote targets
// iOS first); everything else derives from the `PlatformConstants` native module,
// read lazily and cached, exactly as RN's getters do.
//
// The native contract is confirmed from RN's TurboModule spec at
// .vendors/react-native/.../specs_DEPRECATED/modules/NativePlatformConstantsIOS.js:
//   getConstants(): { osVersion, interfaceIdiom, isTesting, forceTouchAvailable,
//                     systemName, reactNativeVersion, isDisableAnimations?,
//                     isMacCatalyst? }
// We resolve it through the same generic native-module bridge as StatusBar
// (getNativeModule), so this module stays importable headless before a fake proxy
// is installed.

import { dlog } from './debug'
import { getNativeModule } from './native-modules'

// The native module name RN registers PlatformConstants under.
const PLATFORM_CONSTANTS = 'PlatformConstants'

// interfaceIdiom values RN compares against for the device-class getters.
const IDIOM_PAD = 'pad'
const IDIOM_TV = 'tv'
const IDIOM_VISION = 'vision'

// Used when the native module is unresolvable (headless, or a binary without it):
// RN's getters would throw, but a Platform read must never crash a render — we fall
// back to neutral defaults instead. '' for Version mirrors "unknown OS version".
const UNKNOWN_VERSION = ''

// 'ios' here is a literal, not a runtime probe: symbiote is iOS-first and OS is the
// value app code branches on. A second OS becomes a new Platform.<os>.ts file, as
// in RN.
const OS_IOS = 'ios'

export type PlatformOSType = 'ios' | 'android' | 'macos' | 'windows' | 'web' | 'native'

// The shape of PlatformConstants.getConstants() on iOS (mirrors the RN spec). All
// optional-on-native fields stay optional so the runtime guard below is the only
// thing that vouches for the object.
export interface PlatformConstantsIOS {
  forceTouchAvailable: boolean
  interfaceIdiom: string
  isTesting: boolean
  isDisableAnimations?: boolean
  osVersion: string
  systemName: string
  reactNativeVersion: {
    major: number
    minor: number
    patch: number
    prerelease?: number | string | null
  }
  isMacCatalyst?: boolean
}

// RN's Platform.select spec: any subset of OS keys, optionally with `default`. The
// iOS resolver reads only `ios`, `native`, `default` — the rest are accepted but
// never consulted on this platform (same as RN).
export type PlatformSelectSpec<T> = {
  ios?: T
  android?: T
  macos?: T
  windows?: T
  web?: T
  native?: T
  default?: T
}

// The native PlatformConstants module — the single method we consume.
interface NativePlatformConstants {
  getConstants(): PlatformConstantsIOS
}

// The trust boundary: the native getConstants() crosses from an untyped HostObject
// into PlatformConstantsIOS here, behind a structural guard (no per-call cast). A
// shape that fails the guard is treated as "module absent".
function isPlatformConstantsIOS(value: unknown): value is PlatformConstantsIOS {
  if (typeof value !== 'object' || value === null) return false
  return 'osVersion' in value && 'interfaceIdiom' in value
}

// Cached result of getConstants(), resolved on first access (RN caches in
// __constants). `undefined` = not yet resolved; we re-attempt on each call until a
// valid object is cached, so a later-installed module still gets picked up.
let cachedConstants: PlatformConstantsIOS | undefined

function resolveConstants(): PlatformConstantsIOS | undefined {
  if (cachedConstants !== undefined) return cachedConstants

  const module = getNativeModule<NativePlatformConstants>(PLATFORM_CONSTANTS)
  if (module === null) {
    dlog('Platform: PlatformConstants not resolvable via native bridge — using defaults')
    return undefined
  }

  const constants: unknown = module.getConstants()
  if (!isPlatformConstantsIOS(constants)) {
    dlog('Platform: PlatformConstants.getConstants() returned an unexpected shape — using defaults')
    return undefined
  }

  dlog(`Platform: resolved PlatformConstants (osVersion=${constants.osVersion})`)
  cachedConstants = constants
  return constants
}

function idiomEquals(idiom: string): boolean {
  return resolveConstants()?.interfaceIdiom === idiom
}

export interface PlatformStatic {
  readonly OS: 'ios'
  readonly Version: string
  readonly constants: PlatformConstantsIOS | undefined
  readonly isPad: boolean
  readonly isTV: boolean
  readonly isVision: boolean
  readonly isTesting: boolean
  readonly isDisableAnimations: boolean
  readonly isMacCatalyst: boolean
  select<T>(spec: PlatformSelectSpec<T>): T | undefined
}

export const Platform: PlatformStatic = {
  OS: OS_IOS,

  get Version(): string {
    return resolveConstants()?.osVersion ?? UNKNOWN_VERSION
  },

  // The whole getConstants() payload (RN exposes it as Platform.constants). May be
  // undefined headless — RN would have thrown; we return undefined so callers can
  // branch instead of crashing.
  get constants(): PlatformConstantsIOS | undefined {
    return resolveConstants()
  },

  get isPad(): boolean {
    return idiomEquals(IDIOM_PAD)
  },

  get isTV(): boolean {
    return idiomEquals(IDIOM_TV)
  },

  get isVision(): boolean {
    return idiomEquals(IDIOM_VISION)
  },

  get isTesting(): boolean {
    return resolveConstants()?.isTesting ?? false
  },

  // RN: isDisableAnimations ?? isTesting. The native flag wins; absent, it tracks
  // isTesting (test runs disable animations by default).
  get isDisableAnimations(): boolean {
    const constants = resolveConstants()
    return constants?.isDisableAnimations ?? constants?.isTesting ?? false
  },

  get isMacCatalyst(): boolean {
    return resolveConstants()?.isMacCatalyst ?? false
  },

  // RN's exact iOS precedence: ios -> native -> default. `in` (not truthiness) so an
  // explicit `undefined`/`false`/`0` under a present key still wins over default.
  select<T>(spec: PlatformSelectSpec<T>): T | undefined {
    if ('ios' in spec) return spec.ios
    if ('native' in spec) return spec.native
    return spec.default
  },
}
