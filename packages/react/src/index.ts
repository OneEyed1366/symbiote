// @symbiote/react — a react-reconciler host config (mutation mode) over
// @symbiote/shared. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components'
export type { ViewProps, TextProps } from './components'
export { Image, setImageSourceResolver } from './image'
export type { ImageProps, ImageSource, ImageSourceProp, ResizeMode } from './image'
export { ImageBackground } from './image-background'
export type { ImageBackgroundProps } from './image-background'
export { ScrollView } from './scroll-view'
export type { ScrollViewProps } from './scroll-view'
export { TextInput } from './text-input'
export type { TextInputProps } from './text-input'
export { InputAccessoryView } from './input-accessory-view'
export type { InputAccessoryViewProps } from './input-accessory-view'
export { Keyboard, KEYBOARD_EVENT } from './keyboard'
export type { KeyboardEventName } from './keyboard'
export { KeyboardAvoidingView } from './keyboard-avoiding-view'
export type { KeyboardAvoidingViewProps, KeyboardAvoidingBehavior } from './keyboard-avoiding-view'
export { StatusBar } from './status-bar'
export type { StatusBarProps, StatusBarStyle } from './status-bar'

export { Switch } from './switch'
export type { SwitchProps, SwitchTrackColor } from './switch'
export { ActivityIndicator } from './activity-indicator'
export type { ActivityIndicatorProps } from './activity-indicator'
export { SafeAreaView } from './safe-area-view'
export type { SafeAreaViewProps } from './safe-area-view'
export { RefreshControl } from './refresh-control'
export type { RefreshControlProps } from './refresh-control'
export { Modal } from './modal'
export type {
  ModalProps,
  ModalAnimationType,
  ModalPresentationStyle,
  ModalOrientation,
} from './modal'

export { Pressable } from './pressable'
export type { PressableProps, PressState } from './pressable'
export { TouchableOpacity, TouchableHighlight, TouchableWithoutFeedback } from './touchable'
export type {
  TouchableOpacityProps,
  TouchableHighlightProps,
  TouchableWithoutFeedbackProps,
} from './touchable'
export { Button } from './button'
export type { ButtonProps } from './button'

export { FlatList } from './flat-list'
export type { FlatListProps } from './flat-list'
export { SectionList } from './section-list'
export type { SectionListProps, Section } from './section-list'
export { VirtualizedSectionList } from './virtualized-section-list'
export type { VirtualizedSectionListProps } from './virtualized-section-list'
export { VirtualizedList } from './virtualized-list'
export type { VirtualizedListProps } from './virtualized-list'

export type { ViewStyle, TextStyle, FlexAlign, FlexJustify } from './styles'
export { mount } from './render'

export type { SymbioteEvent } from '@symbiote/shared'
