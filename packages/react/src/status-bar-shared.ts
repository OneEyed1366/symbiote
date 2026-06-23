// StatusBar — shared contract. The component renders NO Fabric view; it imperatively
// drives a status-bar native module. What DIVERGES by platform is the native module's
// method shape: iOS's StatusBarManager takes `setStyle(style, animated)` /
// `setHidden(hidden, withAnimation)`, while Android's takes single-arg `setStyle(style)` /
// `setHidden(hidden)` plus `setColor` / `setTranslucent`, and driving those Android window
// flags from our bridgeless surface blanks it (a window-insets relayout detaches the Fabric
// surface). So the .ios/.android files own the native calls; the types + the static-method
// surface live here. Filename selects, no Platform.OS read (see ADR 0012 +
// native_module_name_is_platform_specific).

import type { FC } from 'react'

// The bar styles RN documents (statusBarStyles), as a closed union so a typo can't
// reach the native call.
export type StatusBarStyle = 'default' | 'light-content' | 'dark-content'

// The native `withAnimation` argument of iOS setHidden — 'none' | 'fade' | 'slide'.
export type StatusBarAnimation = 'none' | 'fade' | 'slide'

export const STATUS_BAR_MANAGER = 'StatusBarManager'

// RN's default hide/show transition when `animated` is true (showHideTransition
// defaults to 'fade'); 'none' otherwise.
export const ANIMATED_HIDE_TRANSITION: StatusBarAnimation = 'fade'
export const STATIC_HIDE_TRANSITION: StatusBarAnimation = 'none'

export function hideTransition(animated: boolean): StatusBarAnimation {
  return animated ? ANIMATED_HIDE_TRANSITION : STATIC_HIDE_TRANSITION
}

export interface StatusBarProps {
  barStyle?: StatusBarStyle
  hidden?: boolean
  animated?: boolean
  networkActivityIndicatorVisible?: boolean
}

// The static imperative API RN exposes — used widely without rendering a component.
// Attached to the function object, mirroring RN.
export interface StatusBarComponent extends FC<StatusBarProps> {
  setBarStyle(style: StatusBarStyle, animated?: boolean): void
  setHidden(hidden: boolean, animation?: StatusBarAnimation): void
  setNetworkActivityIndicatorVisible(visible: boolean): void
}
