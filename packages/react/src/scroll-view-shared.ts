// ScrollView — shared core. The Fabric tree is nested: the scroll view wraps a content
// view that holds the children (RN's own ScrollView.js shape). Building that content
// node, resolving decelerationRate, and the prop plumbing are platform-invariant and
// live here. What diverges (ADR 0020) is how a RefreshControl integrates: on iOS it is a
// CHILD of the scroll view (sibling of the content), on Android it WRAPS the scroll view
// (AndroidSwipeRefreshLayout is the parent, ScrollView nested inside). So the .ios/.android
// files assemble the final element; the filename selects, no Platform.OS read.

import { createElement, type ReactElement, type ReactNode } from 'react'
import { dlog, type SymbioteEvent } from '@symbiote/shared'
import type { SymbioteIntrinsic } from './component-names-shared'
import type { ViewStyle } from './styles'

type ScrollHandler = (event: SymbioteEvent) => void

const DECELERATION_RATE: Readonly<Record<string, number>> = {
  normal: 0.998,
  fast: 0.99,
}

export interface ScrollViewProps {
  style?: ViewStyle
  contentContainerStyle?: ViewStyle
  horizontal?: boolean
  scrollEnabled?: boolean
  showsVerticalScrollIndicator?: boolean
  showsHorizontalScrollIndicator?: boolean
  pagingEnabled?: boolean
  bounces?: boolean
  decelerationRate?: 'normal' | 'fast' | number
  scrollEventThrottle?: number
  contentInset?: { top?: number; left?: number; bottom?: number; right?: number }
  contentOffset?: { x: number; y: number }
  refreshControl?: ReactElement<ClonableRefreshControl>
  onScroll?: ScrollHandler
  onScrollBeginDrag?: ScrollHandler
  onScrollEndDrag?: ScrollHandler
  onMomentumScrollBegin?: ScrollHandler
  onMomentumScrollEnd?: ScrollHandler
  children?: ReactNode
}

function resolveDecelerationRate(rate: 'normal' | 'fast' | number): number {
  if (typeof rate === 'number') return rate
  return DECELERATION_RATE[rate]
}

// RN applies a base style to the scroll-view NODE itself, per axis (ScrollView.js
// styles.baseHorizontal/baseVertical). For horizontal, `flexDirection: 'row'` is
// load-bearing: it makes the single content child a MAIN-axis item, so Yoga sizes it to
// its content width (the sum of the row's children) and the view overflows and scrolls.
// Without it the scroll view defaults to `column`, the content child is a CROSS-axis item,
// and its width is stretched/clamped to the viewport — leaving nothing to scroll. Vertical
// gets the equivalent for free (column is the default direction), so only the horizontal
// base is needed here.
const SCROLL_VIEW_BASE_HORIZONTAL: ViewStyle = {
  flexGrow: 1,
  flexShrink: 1,
  flexDirection: 'row',
  overflow: 'scroll',
}

// The shape the Android build clones onto a RefreshControl when wrapping the scroll view:
// a layout style and the scroll view as its single child. Typed so cloneElement accepts
// the added props without a cast; any RefreshControl element (its own props are a
// superset) satisfies it.
export interface ClonableRefreshControl {
  style?: ViewStyle
  children?: ReactNode
}

// The platform-invariant pieces: the outer scroll-view intrinsic (vertical vs horizontal,
// which the name table maps to the right Fabric component per platform), its outer props
// (minus style, placed differently per platform), its style, and the built content node.
// The .ios/.android files take these and assemble the final element with their
// RefreshControl wiring.
export interface PreparedScrollView {
  scrollViewIntrinsic: SymbioteIntrinsic
  // The base style for the scroll-view NODE (flexDirection etc.) — set for horizontal,
  // undefined for vertical. The platform files compose it UNDER the user style so an
  // explicit user flexDirection/height still wins.
  scrollViewBaseStyle: ViewStyle | undefined
  outerProps: Record<string, unknown>
  style: ViewStyle | undefined
  content: ReactElement
  refreshControl: ReactElement<ClonableRefreshControl> | undefined
}

export function prepareScrollView(props: ScrollViewProps): PreparedScrollView {
  const {
    style,
    contentContainerStyle,
    horizontal,
    decelerationRate,
    refreshControl,
    children,
    ...outer
  } = props

  const isHorizontal = horizontal === true

  // Horizontal scroll resolves to a different native component on Android (its own
  // ViewManager, not RCTScrollView+flag); on iOS both intrinsics map back to RCTScrollView.
  // The name table does the per-platform mapping — here we only pick the intrinsic.
  const scrollViewIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-view'
    : 'symbiote-scroll-view'
  const contentIntrinsic: SymbioteIntrinsic = isHorizontal
    ? 'symbiote-horizontal-scroll-content'
    : 'symbiote-scroll-content'
  const scrollViewBaseStyle = isHorizontal ? SCROLL_VIEW_BASE_HORIZONTAL : undefined

  const contentStyle: ViewStyle = { ...contentContainerStyle }
  if (isHorizontal) contentStyle.flexDirection = 'row'

  const outerProps: Record<string, unknown> = { ...outer }
  // iOS needs `horizontal` to flip RCTScrollView's axis; Android's dedicated horizontal
  // manager ignores it. Harmless on Android, load-bearing on iOS — so always forward it.
  if (horizontal !== undefined) outerProps.horizontal = horizontal
  if (decelerationRate !== undefined) {
    outerProps.decelerationRate = resolveDecelerationRate(decelerationRate)
  }

  dlog(`ScrollView -> ${scrollViewIntrinsic} (horizontal=${isHorizontal})`)

  // `collapsable: false` is load-bearing on Android. The content container is a
  // layout-only View, which Android Fabric view-flattens away — hoisting the cells
  // up as DIRECT children of the scroll view, which strictly hosts exactly one
  // child ("ScrollView can host only one direct child" → addViewAt crash). RN pins
  // its own NativeScrollContentView the same way (ScrollView.js, collapsable={false};
  // ReactScrollView.java: "the 'content' View … non-collapsable so it will never be
  // View-flattened away"). iOS doesn't flatten, so this is a no-op there.
  const content = createElement(
    contentIntrinsic,
    { style: contentStyle, collapsable: false },
    children,
  )

  return { scrollViewIntrinsic, scrollViewBaseStyle, outerProps, style, content, refreshControl }
}
