// Pressable — the userland interaction primitive. It composes a single View and
// the press/pressIn/pressOut listeners that shared synthesizes on the responder
// node; there is no new native view and no core change. `pressed` is JS state:
// pressIn sets it true, pressOut sets it false, so style/children can react to it.
// onLongPress has no native event — it is synthesized with a timer armed on
// pressIn and disarmed on pressOut/press, matching RN's Pressability behavior.
//
// Three RN interaction props that change real app feel are layered on top of the
// shared press synthesis, entirely in JS here (shared still fires the raw
// pressIn/press/pressOut):
//   - android_ripple / android_disableSound — Android native-feedback props that
//     ride a dedicated child View (mirroring touchable-native-feedback.ts), inert
//     on iOS.
//   - unstable_pressDelay — a timer that defers pressIn/pressed activation, like
//     the long-press timer (RN Pressable.js:156).
//   - pressRetentionOffset — keeps the press ACTIVE while the finger drifts within
//     this offset (plus hitSlop) of the press-start point; only a drift past it
//     fires pressOut / cancels the tap (RN Pressable.js:78). Wired into the
//     responder-move stream of the same View.

import { createElement, useMemo, useRef, useState, type FC, type ReactNode } from 'react'
import { dlog, Platform, type SymbioteEvent } from '@symbiote/shared'
import { View } from './components'
import type { AccessibilityProps, AccessibilityStateValue, AriaProps } from './accessibility-props'
import type { ViewStyle } from './styles'

const DEFAULT_DELAY_LONG_PRESS_MS = 500
// RN's default extra slop kept around a press once it is active, before a drift
// fires pressOut (Pressability.DEFAULT_PRESS_RECT_OFFSETS = 20 on every edge).
const DEFAULT_PRESS_RETENTION_OFFSET = 20

export interface PressState {
  pressed: boolean
}

type PressHandler = (event: SymbioteEvent) => void
type StyleProp = ViewStyle | ((state: PressState) => ViewStyle)
type ChildrenProp = ReactNode | ((state: PressState) => ReactNode)

// Native ripple config Android's ReactViewManager reads off the inner View
// (nativeBackgroundAndroid). `foreground` routes it to the foreground slot. Inert
// on iOS, where the inner View is a plain box. Mirrors RN's
// PressableAndroidRippleConfig (Pressable.js:146 / useAndroidRippleForView.js).
export interface PressableAndroidRippleConfig {
  color?: string
  borderless?: boolean
  radius?: number
  foreground?: boolean
}

// The RippleAndroid background dict shape Android resolves. Same shape the
// TouchableNativeFeedback.Ripple factory produces; replicated minimally here so
// Pressable owns no cross-import to the touchable family.
interface RippleBackground {
  type: 'RippleAndroid'
  color: string | null
  borderless: boolean
  rippleRadius?: number
}

type RectOffset = number | { top?: number; left?: number; bottom?: number; right?: number }

export interface PressableProps extends AccessibilityProps, AriaProps {
  onPress?: PressHandler
  onPressIn?: PressHandler
  onPressOut?: PressHandler
  onLongPress?: PressHandler
  delayLongPress?: number
  disabled?: boolean
  hitSlop?: RectOffset
  // Extra distance outside the visual bounds in which a drifting press stays active
  // before pressOut fires (RN Pressable.js:78). A scalar applies to every edge.
  pressRetentionOffset?: RectOffset
  // Delay (ms) between touch-down and pressIn / pressed activation; 0 = immediate
  // (RN Pressable.js:156).
  unstable_pressDelay?: number
  // Android-only ripple feedback; inert on iOS (RN Pressable.js:146).
  android_ripple?: PressableAndroidRippleConfig
  // Suppress the Android system tap sound (RN Pressable.js:141). Forwarded to native.
  android_disableSound?: boolean
  testID?: string
  style?: StyleProp
  children?: ChildrenProp
}

function resolveStyle(style: StyleProp | undefined, state: PressState): ViewStyle | undefined {
  if (typeof style === 'function') return style(state)
  return style
}

function resolveChildren(children: ChildrenProp | undefined, state: PressState): ReactNode {
  if (typeof children === 'function') return children(state)
  return children
}

// The largest single edge of a rect-or-scalar offset; used as the isotropic
// drift threshold (RN tracks per-edge, but the press-start-relative distance check
// here is symmetric, so the widest edge is the conservative bound).
function maxEdge(offset: RectOffset | undefined, fallback: number): number {
  if (offset === undefined) return fallback
  if (typeof offset === 'number') return offset
  const { top = 0, left = 0, bottom = 0, right = 0 } = offset
  return Math.max(top, left, bottom, right)
}

// Page coordinate of a single-touch native event, or undefined when it carried no
// numeric coords (then the retention drift check is skipped, never guessed).
function readPoint(event: SymbioteEvent): { x: number; y: number } | undefined {
  const { pageX, pageY } = event.nativeEvent
  if (typeof pageX === 'number' && typeof pageY === 'number') return { x: pageX, y: pageY }
  return undefined
}

// Build the Android native-feedback prop the inner View carries from the ripple
// config. RN runs the color through processColor → a native int; we have no native
// bridge in JS, so we keep the string and let Android resolve it (a null color is
// the documented "no tint"). Returns the prop dict the inner View spreads.
function rippleProps(
  config: PressableAndroidRippleConfig,
): Record<string, RippleBackground> | undefined {
  if (Platform.OS !== 'android') return undefined
  const background: RippleBackground = {
    type: 'RippleAndroid',
    color: config.color ?? null,
    borderless: config.borderless === true,
    rippleRadius: config.radius,
  }
  return config.foreground === true
    ? { nativeForegroundAndroid: background }
    : { nativeBackgroundAndroid: background }
}

export const Pressable: FC<PressableProps> = (props) => {
  const {
    onPress,
    onPressIn,
    onPressOut,
    onLongPress,
    delayLongPress = DEFAULT_DELAY_LONG_PRESS_MS,
    disabled,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay = 0,
    android_ripple,
    android_disableSound,
    accessibilityState,
    testID,
    style,
    children,
    // The remaining accessibility / aria props are forwarded to View untouched;
    // View runs resolveAccessibilityProps, so aria/role fold there, once.
    ...accessibilityRest
  } = props

  const [pressed, setPressed] = useState(false)
  // Holds the in-flight long-press timer between pressIn and pressOut/press; a
  // ref (not state) so arming/disarming it never triggers a re-render.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // True once the long-press timer fired, until the next pressIn rearms. RN skips
  // onPress when a long press fired (Pressability.js: isPressCanceledByLongPress);
  // without this flag a completed hold would emit a spurious onPress on release.
  const longPressFired = useRef(false)
  // Holds the in-flight unstable_pressDelay timer; the activation (pressed-state +
  // pressIn + long-press arm) runs inside it, deferred by `unstable_pressDelay` ms.
  const pressDelayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Page coordinate the active press started at, for the retention drift check.
  const pressOrigin = useRef<{ x: number; y: number } | undefined>(undefined)
  // True once a drift past hitSlop+retention deactivated the press; suppresses the
  // tap on release until the finger returns inside the region (RN Pressability).
  const driftedOut = useRef(false)

  const handlers = useMemo(() => {
    // Drift threshold: hitSlop enlarges the touch target, retention extends how far
    // an ALREADY-active press may wander before pressOut. RN sums them per edge; we
    // use the widest edge of each as the symmetric, layout-free bound.
    const retentionThreshold =
      maxEdge(hitSlop, 0) + maxEdge(pressRetentionOffset, DEFAULT_PRESS_RETENTION_OFFSET)

    function clearLongPress(): void {
      if (longPressTimer.current !== undefined) {
        clearTimeout(longPressTimer.current)
        longPressTimer.current = undefined
      }
    }

    function clearPressDelay(): void {
      if (pressDelayTimer.current !== undefined) {
        clearTimeout(pressDelayTimer.current)
        pressDelayTimer.current = undefined
      }
    }

    // The real activation: flip pressed-state on, arm the long-press timer, fire
    // onPressIn. Split out so unstable_pressDelay can defer it behind a timer while
    // an early release can flush it synchronously (RN: a release before the delay
    // still registers the press).
    function activate(event: SymbioteEvent): void {
      dlog('Pressable pressIn')
      setPressed(true)
      longPressFired.current = false
      if (onLongPress) {
        longPressTimer.current = setTimeout(() => {
          longPressTimer.current = undefined
          longPressFired.current = true
          dlog('Pressable longPress timer fired')
          onLongPress(event)
        }, delayLongPress)
      }
      onPressIn?.(event)
    }

    // Flush a still-pending pressDelay timer immediately, so a pressOut/press that
    // arrives before the delay elapsed still sees an activated press.
    function flushPressDelay(event: SymbioteEvent): void {
      if (pressDelayTimer.current !== undefined) {
        clearPressDelay()
        activate(event)
      }
    }

    return {
      handlePressIn(event: SymbioteEvent): void {
        pressOrigin.current = readPoint(event)
        driftedOut.current = false
        if (unstable_pressDelay > 0) {
          dlog(`Pressable pressIn deferred ${unstable_pressDelay}ms`)
          pressDelayTimer.current = setTimeout(() => {
            pressDelayTimer.current = undefined
            activate(event)
          }, unstable_pressDelay)
          return
        }
        activate(event)
      },
      handlePressOut(event: SymbioteEvent): void {
        dlog('Pressable pressOut')
        flushPressDelay(event)
        clearLongPress()
        pressOrigin.current = undefined
        setPressed(false)
        onPressOut?.(event)
      },
      handlePress(event: SymbioteEvent): void {
        dlog('Pressable press')
        flushPressDelay(event)
        clearLongPress()
        // A drift past the retention region cancels the tap (RN); reset and suppress.
        if (driftedOut.current) {
          driftedOut.current = false
          dlog('Pressable press suppressed by drift past retention region')
          return
        }
        // A fired long press cancels the tap — reset the flag and suppress onPress.
        if (longPressFired.current) {
          longPressFired.current = false
          dlog('Pressable press suppressed by prior longPress')
          return
        }
        onPress?.(event)
      },
      // Responder-move stream of the Pressable's own View. While the press is active
      // we measure the drift from where it started: crossing the threshold fires an
      // early pressOut (and marks the tap suppressed); returning inside re-activates.
      handleResponderMove(event: SymbioteEvent): void {
        const origin = pressOrigin.current
        const here = readPoint(event)
        if (!origin || !here) return
        const distance = Math.hypot(here.x - origin.x, here.y - origin.y)
        if (distance > retentionThreshold) {
          if (!driftedOut.current) {
            dlog('Pressable drifted past retention region — deactivating')
            driftedOut.current = true
            clearLongPress()
            setPressed(false)
            onPressOut?.(event)
          }
        } else if (driftedOut.current) {
          dlog('Pressable returned inside retention region — reactivating')
          driftedOut.current = false
          activate(event)
        }
      },
    }
  }, [
    onPress,
    onPressIn,
    onPressOut,
    onLongPress,
    delayLongPress,
    hitSlop,
    pressRetentionOffset,
    unstable_pressDelay,
  ])

  const state: PressState = { pressed }

  // RN merges `disabled` into the resolved accessibilityState so a disabled
  // Pressable reports the disabled state even if the caller passed none
  // (Pressable.js: `disabled != null ? {...state, disabled} : state`).
  const resolvedAccessibilityState: AccessibilityStateValue | undefined =
    disabled !== undefined ? { ...accessibilityState, disabled } : accessibilityState

  const viewProps: Record<string, unknown> = {
    ...accessibilityRest,
    style: resolveStyle(style, state),
    hitSlop,
    accessibilityState: resolvedAccessibilityState,
    testID,
  }
  // Forward the Android tap-sound suppressor under RN's own key so a future native
  // binding reads it directly; inert on iOS (no Android sound to suppress there).
  if (android_disableSound !== undefined) viewProps.android_disableSound = android_disableSound
  // When disabled, leave the listeners off entirely — a press never fires and
  // pressed-state never flips, exactly as RN's disabled Pressable.
  if (disabled !== true) {
    viewProps.onPress = handlers.handlePress
    viewProps.onPressIn = handlers.handlePressIn
    viewProps.onPressOut = handlers.handlePressOut
    // Claim the responder so the move stream reaches this View; retention reads it.
    viewProps.onStartShouldSetResponder = () => true
    viewProps.onResponderMove = handlers.handleResponderMove
  } else {
    dlog('Pressable disabled — listeners suppressed')
  }

  // android_ripple rides a dedicated inner View (the Pressable's own View only
  // forwards a fixed prop set), mirroring touchable-native-feedback.ts. On iOS the
  // ripple prop is undefined, so the child renders unwrapped — no extra node.
  const ripple = android_ripple !== undefined ? rippleProps(android_ripple) : undefined
  const content = resolveChildren(children, state)
  const inner = ripple !== undefined ? createElement(View, ripple, content) : content

  return createElement(View, viewProps, inner)
}
