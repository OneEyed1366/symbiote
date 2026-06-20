// StatusBar primitive. Unlike View/Text it renders NO Fabric view — it imperatively
// drives the `StatusBarManager` native module from its props (and from static
// methods). This is the first JS->native consumer of the native-module bridge,
// proving the direction the other way from the view tree.
//
// The native contract is confirmed from RN's TurboModule spec at
// .vendors/react-native/.../src/private/specs_DEPRECATED/modules/NativeStatusBarManagerIOS.js:
//   setStyle(statusBarStyle?: string, animated: boolean)
//   setHidden(hidden: boolean, withAnimation: 'none' | 'fade' | 'slide')
//   setNetworkActivityIndicatorVisible(visible: boolean)
// We mirror only those three setters as our hand-written interface — the typed
// trust boundary the generic getEnforcingNativeModule<T> resolves against.

import { useEffect, type FC } from 'react'
import { dlog, getNativeModule } from '@symbiote/shared'

// The iOS bar styles the spec documents (statusBarStyles), as a closed union so a
// typo can't reach the native call.
export type StatusBarStyle = 'default' | 'light-content' | 'dark-content'

// The native `withAnimation` argument of setHidden — 'none' | 'fade' | 'slide'.
type StatusBarAnimation = 'none' | 'fade' | 'slide'

// RN's default hide/show transition when `animated` is true (showHideTransition
// defaults to 'fade'); 'none' otherwise.
const ANIMATED_HIDE_TRANSITION: StatusBarAnimation = 'fade'
const STATIC_HIDE_TRANSITION: StatusBarAnimation = 'none'

const STATUS_BAR_MANAGER = 'StatusBarManager'

// The native module typed as the interface we vouch for — only the setters we use.
// This is the single point that accepts the native shape (no per-call `as`); the
// generic on getEnforcingNativeModule carries it.
interface NativeStatusBarManager {
  setStyle(statusBarStyle: StatusBarStyle, animated: boolean): void
  setHidden(hidden: boolean, withAnimation: StatusBarAnimation): void
  setNetworkActivityIndicatorVisible(visible: boolean): void
}

export interface StatusBarProps {
  barStyle?: StatusBarStyle
  hidden?: boolean
  animated?: boolean
  networkActivityIndicatorVisible?: boolean
}

function hideTransition(animated: boolean): StatusBarAnimation {
  return animated ? ANIMATED_HIDE_TRANSITION : STATIC_HIDE_TRANSITION
}

// StatusBar renders null and applies its props to the native module in an effect,
// on mount and on every prop change. Simplification vs RN: RN maintains a
// prop-merge stack so nested StatusBars compose (deepest/last wins) — we direct-apply
// a single component's props, which is the correct behavior for one StatusBar and a
// fine first cut. The merge stack is a later concern.
export const StatusBar: StatusBarComponent = (props) => {
  const { barStyle, hidden, animated = false, networkActivityIndicatorVisible } = props

  useEffect(() => {
    // Resolve lazily inside the effect, not at import — keeps this module importable
    // headless before a fake __turboModuleProxy is installed. Non-enforcing: a
    // declarative StatusBar must NOT crash the whole render if the module can't be
    // resolved (a missing optional native module is not a fatal app error).
    const manager = getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)
    if (manager === null) {
      dlog('StatusBar: StatusBarManager not resolvable via __turboModuleProxy — skipping')
      return
    }
    dlog('StatusBar -> applying props to StatusBarManager')

    if (barStyle !== undefined) manager.setStyle(barStyle, animated)
    if (hidden !== undefined) manager.setHidden(hidden, hideTransition(animated))
    if (networkActivityIndicatorVisible !== undefined) {
      manager.setNetworkActivityIndicatorVisible(networkActivityIndicatorVisible)
    }
  }, [barStyle, hidden, animated, networkActivityIndicatorVisible])

  return null
}

// The static imperative API RN exposes — used widely without rendering a component.
// Attached to the function object, mirroring RN.
interface StatusBarComponent extends FC<StatusBarProps> {
  setBarStyle(style: StatusBarStyle, animated?: boolean): void
  setHidden(hidden: boolean, animation?: StatusBarAnimation): void
  setNetworkActivityIndicatorVisible(visible: boolean): void
}

// The static API mirrors the declarative component: non-throwing — a missing
// optional native module is a no-op, never a crash.
StatusBar.setBarStyle = (style, animated = false) => {
  dlog('StatusBar.setBarStyle')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setStyle(style, animated)
}

StatusBar.setHidden = (hidden, animation = STATIC_HIDE_TRANSITION) => {
  dlog('StatusBar.setHidden')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setHidden(hidden, animation)
}

StatusBar.setNetworkActivityIndicatorVisible = (visible) => {
  dlog('StatusBar.setNetworkActivityIndicatorVisible')
  getNativeModule<NativeStatusBarManager>(STATUS_BAR_MANAGER)?.setNetworkActivityIndicatorVisible(
    visible,
  )
}
