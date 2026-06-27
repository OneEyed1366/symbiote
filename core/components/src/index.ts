// @symbiote/components — the framework-agnostic component layer. Pure state machines
// (`state/`) and render functions (`view/`) that paint `Descriptor` trees; every adapter
// wires state→render with ITS lifecycle (React hooks / Vue reactivity) and maps the
// Descriptor onto its own element. See CLAUDE.md <components_split_logic_view_lifecycle>.

export { el, txt } from './descriptor'
export type { IDescriptor, IDescriptorType, IDescriptorProps, IDescriptorChild } from './descriptor'

// Accessibility folding — the web-alias (aria-*/role) → canonical accessibility* transform
// and its types. Framework-agnostic (ADR 0024), so React, Vue, and the next adapter all fold
// identically; moved here from @symbiote/react. RefreshControl/SafeAreaView/ScrollView consume it.
export { resolveAccessibilityProps } from './accessibility-props'
export type {
  IAccessibilityProps,
  IAriaProps,
  IAccessibilityRole,
  IRole,
  IAccessibilityStateValue,
  IAccessibilityValue,
  IAccessibilityActionInfo,
} from './accessibility-props'

// Intrinsic (`symbiote-*`) → Fabric view-name resolution. Shared by every adapter so the
// names CANNOT drift between them (one engine, one Fabric). The name tables are
// Metro-split (.ios/.android, filename selects, no Platform.OS read — ADR 0020); the base
// re-exports iOS for headless. descriptorFor is the per-platform-bound resolver.
export { descriptorFor, COMPONENT_DESCRIPTORS } from './component-names'
export { buildDescriptors, makeDescriptorFor } from './component-names-shared'
export type { ISymbioteIntrinsic, IComponentDescriptor } from './component-names-shared'

export { renderActivityIndicator } from './view/render-activity-indicator'
export type {
  IActivityIndicatorViewProps,
  IActivityIndicatorPlatform,
  IActivityIndicatorSize,
} from './view/render-activity-indicator'

export { renderSwitch } from './view/render-switch'
export type { ISwitchViewProps, ISwitchPlatform, ISwitchTrackColor } from './view/render-switch'

// Switch is the first STATE machine off this layer (ActivityIndicator was render-only):
// the reducer + the two pure predicates are the logic half, the adapter supplies the hook.
export { switchReducer, createInitialSwitchState, shouldSnapBack, valueFromChange } from './state/switch'
export type { ISwitchState, ISwitchAction } from './state/switch'

// ScrollView — pure render/command helpers (no state machine, no 3-layer split). The adapter
// owns the refs/effects/element assembly and the sticky-header component; these supply the
// platform-invariant math and plumbing every adapter shares (ADR 0024).
export {
  resolveDecelerationRate,
  selectScrollIntrinsics,
  readLayoutDimension,
  didContentSizeChange,
  SCROLL_VIEW_BASE_HORIZONTAL,
  SCROLL_VIEW_BASE_VERTICAL,
} from './view/render-scroll-view'
export type { IScrollIntrinsics, IContentSize } from './view/render-scroll-view'

export {
  buildScrollViewHandle,
  splitLayoutProps,
  attachStickyScroll,
  isSymbioteEvent,
  forwardScrollEvent,
} from './scroll-view-commands'
export type { IScrollViewHandle } from './scroll-view-commands'

export {
  computeStickyInterpolation,
  nextStickyHeaderY,
  stickyDebounceMs,
  readLayoutNumber,
  STICKY_HEADER_Z_INDEX,
} from './view/render-scroll-sticky'
export type { IStickyHeaderProps, IStickyInterpolationParams } from './view/render-scroll-sticky'

export type {
  IImageSource,
  IImageStatics,
  IImageSourceProp,
  IResizeMode,
  IImageSize,
  IImageCacheStatus,
  IImageProps,
  IImageViewProps
} from './view/render-image'
export {
  renderImage,
  imageStatics,
  setImageSourceResolver
} from './view/render-image'
