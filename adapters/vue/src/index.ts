// @symbiote/vue — a thin Vue 3 reconciler over @symbiote/engine. createRenderer maps
// each RendererOptions call onto the engine's mutation API; all Fabric clone-on-write
// lives in the engine, shared with every other adapter. App code names only @symbiote/vue.

export { mount, stopSurface } from './render'
export { View, Text } from './components'
// Image — full parity with React: source/src/srcSet resolution, the width/height → style fold,
// alt → accessibility, and the Image statics (getSize / prefetch / queryCache / …) are shared
// verbatim from @symbiote/components via renderImage; Vue supplies only the functional bridge.
export { Image, setImageSourceResolver } from './image'
export type {
  IImageProps,
  IImageSource,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
} from './image'
// First component off the shared @symbiote/components layer: render-only, drives the
// agnostic renderActivityIndicator through descriptorToVue. Proof the layer is reusable —
// the render fn is shared verbatim with React; Vue supplies only the bridge.
export { ActivityIndicator } from './activity-indicator'
// First component to bring the state half into Vue (the lastNativeReport reducer + the
// snap-back watch) — render shared verbatim with React, Vue supplies the reactive lifecycle.
export { Switch } from './switch'
// ScrollView — full parity (ADR 0024): vertical + horizontal, every pass-through prop, the
// synthesized onContentSizeChange, the imperative handle via expose() + shallowRef, RefreshControl
// (iOS sibling / Android wrap, Phase 2), and sticky headers (Phase 3 — the scroll AnimatedValue,
// the headerLayoutYs cross-talk, and the per-header Animated.View wrap). The pure math (intrinsics,
// decelerationRate, content-size dedupe, the handle, the sticky interpolation) is shared verbatim
// with React from @symbiote/components.
export { ScrollView } from './scroll-view'
export type { IScrollViewProps, IScrollViewHandle } from './scroll-view'
// Phase 2 (ADR 0024): SafeAreaView + RefreshControl, wired into ScrollView with the iOS-sibling /
// Android-wrap platform split. RefreshControl hosts the wrapped scroll view via its default slot.
export { SafeAreaView } from './safe-area-view'
export type { ISafeAreaViewProps } from './safe-area-view'
export { RefreshControl } from './refresh-control'
export type { IRefreshControlProps } from './refresh-control'
export { descriptorToVue } from './descriptor-to-vue'
export { createSymbioteRenderer } from './renderer'
// Animated (ADR 0024 Phase 3a): Animated.View/Text/Image + the lazy Animated.ScrollView over the
// Vue primitives, with the value graph / easing / drivers spread from @symbiote/engine. The wrap
// mechanism (createAnimatedComponent) is the Vue twin of React's; the pure leaves live in the
// engine. FlatList/SectionList are omitted until those base components exist.
export { Animated, createAnimatedComponent } from './animated'

// Re-export the framework-agnostic engine surface (pure utilities + diagnostics).
export {
  Platform,
  StyleSheet,
  processColor,
  setColorProcessor,
  dlog,
  isDebug,
} from '@symbiote/engine'
export type { ISymbioteEvent, ISymbioteNode, IRootTag } from '@symbiote/engine'
