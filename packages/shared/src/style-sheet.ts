// StyleSheet, ported from react-native/Libraries/StyleSheet/StyleSheetExports.js.
// RN's StyleSheet is mostly identity + small helpers: `create` returns the object
// untouched (no deep-freeze by default in modern RN), `flatten` collapses a style
// array, `compose` picks/pairs two styles, plus the `hairlineWidth` / `absoluteFill`
// constants. We keep it generic — the typed ViewStyle/TextStyle live in the react
// adapter; here a style is any plain `Record`-shaped object.

import { dlog } from './debug'
import { getNativeModule } from './native-modules'
import { flattenStyle } from './style'

// A single style object. Generic on purpose: shared is framework-agnostic and must
// not depend on the adapter's typed style maps.
type StyleObject = Record<string, unknown>

// RN's hairline factor: a "1 physical pixel" line is ~0.4 logical px, rounded to the
// nearest device pixel. Named so the 0.4 isn't a bare magic number (RN source uses
// the same literal in PixelRatio.roundToNearestPixel(0.4)).
const HAIRLINE_LOGICAL_FACTOR = 0.4

// Fallback when DeviceInfo isn't resolvable (headless, or before native bring-up).
// RN can't run without it; we degrade to a sane 1px line rather than crash.
const HAIRLINE_FALLBACK = 1

// The shape we read off DeviceInfo's constants — RN's source of truth for screen
// scale (NativeDeviceInfo.getConstants().Dimensions.window.scale). Only the one
// field we need, narrowed at the native trust boundary by getNativeModule<T>.
interface DeviceInfoModule {
  getConstants(): { Dimensions: { window: { scale: number } } }
}

// Resolve the screen pixel scale lazily from native, or null when unavailable.
// Lazy (not at import) so this module is importable headless before a fake
// __turboModuleProxy exists — same precedent as StatusBar's in-effect resolve.
function resolveScreenScale(): number | null {
  const deviceInfo = getNativeModule<DeviceInfoModule>('DeviceInfo')
  if (deviceInfo === null) {
    dlog('StyleSheet: DeviceInfo not resolvable — hairlineWidth falls back')
    return null
  }
  const scale = deviceInfo.getConstants().Dimensions.window.scale
  // A non-positive scale would make the round/divide nonsensical; treat as missing.
  if (typeof scale !== 'number' || scale <= 0) {
    dlog(`StyleSheet: DeviceInfo scale invalid (${String(scale)}) — hairlineWidth falls back`)
    return null
  }
  return scale
}

// Compute the hairline width for a given scale, mirroring RN exactly: round the
// logical factor to the nearest device pixel, and if that rounds to 0 (scale < ~1.25)
// fall back to the thinnest representable line, one physical pixel = 1 / scale.
// Exported as a pure helper so the smoke can check the formula without faking native.
export function computeHairlineWidth(scale: number): number {
  const rounded = Math.round(HAIRLINE_LOGICAL_FACTOR * scale) / scale
  return rounded === 0 ? 1 / scale : rounded
}

// RN freezes absoluteFill in __DEV__; we always freeze so `absoluteFill` and
// `absoluteFillObject` can safely be the same shared object.
const absoluteFill: Readonly<StyleObject> = Object.freeze({
  position: 'absolute',
  left: 0,
  right: 0,
  top: 0,
  bottom: 0,
})

// RN's composeStyles: falsy left → right, falsy right → left, else the pair [a, b]
// (which flatten later collapses, later keys winning).
function compose<A, B>(style1: A, style2: B): A | B | [A, B] {
  if (style1 === null || style1 === undefined) return style2
  if (style2 === null || style2 === undefined) return style1
  return [style1, style2]
}

export const StyleSheet = {
  // Identity, like RN: returns the same object, each key keeping its inferred type.
  create<S extends Record<string, StyleObject>>(styles: S): S {
    return styles
  },

  // Reuse the single flatten implementation; do not reimplement the clone-on-write
  // collapse here.
  flatten: flattenStyle,

  compose,

  absoluteFill,
  absoluteFillObject: absoluteFill,

  // Lazy compute, recomputed each read (cheap, and avoids caching a fallback taken
  // before native was ready). RN memoizes; we keep it simple until that's a cost.
  get hairlineWidth(): number {
    const scale = resolveScreenScale()
    if (scale === null) return HAIRLINE_FALLBACK
    return computeHairlineWidth(scale)
  },
}
