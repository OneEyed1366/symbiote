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
import type { IColorValue } from '@symbiote/engine'

// The bar styles RN documents (statusBarStyles), as a closed union so a typo can't
// reach the native call.
export type IStatusBarStyle = 'default' | 'light-content' | 'dark-content'

// The native `withAnimation` argument of iOS setHidden — 'none' | 'fade' | 'slide'.
export type IStatusBarAnimation = 'none' | 'fade' | 'slide'

export const STATUS_BAR_MANAGER = 'StatusBarManager'

// RN's default hide/show transition when `animated` is true (showHideTransition
// defaults to 'fade'); 'none' otherwise.
export const ANIMATED_HIDE_TRANSITION: IStatusBarAnimation = 'fade'
export const STATIC_HIDE_TRANSITION: IStatusBarAnimation = 'none'

export function hideTransition(animated: boolean): IStatusBarAnimation {
  return animated ? ANIMATED_HIDE_TRANSITION : STATIC_HIDE_TRANSITION
}

export interface IStatusBarProps {
  barStyle?: IStatusBarStyle
  hidden?: boolean
  animated?: boolean
  networkActivityIndicatorVisible?: boolean
  // Android-only — inert on iOS (RN's StatusBar has no iOS background color).
  backgroundColor?: IColorValue
  translucent?: boolean
}

// The static imperative API RN exposes — used widely without rendering a component.
// Attached to the function object, mirroring RN. setBackgroundColor / setTranslucent
// and currentHeight are Android-only; on iOS they are inert/absent per RN, but stay on
// the contract so a typo can't pass and callers don't branch on platform.
export interface IStatusBarComponent extends FC<IStatusBarProps> {
  setBarStyle(style: IStatusBarStyle, animated?: boolean): void
  setHidden(hidden: boolean, animation?: IStatusBarAnimation): void
  setNetworkActivityIndicatorVisible(visible: boolean): void
  setBackgroundColor(color: IColorValue, animated?: boolean): void
  setTranslucent(translucent: boolean): void
  currentHeight?: number
}
