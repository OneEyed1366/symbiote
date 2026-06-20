// @symbiote/react — a react-reconciler host config (mutation mode) over
// @symbiote/shared. React is a known-good driver: it proves the native pipe
// (R1) and shared's clone-on-write engine (R2) before any non-React adapter.

export { View, Text } from './components'
export type { ViewProps, TextProps } from './components'
export type { ViewStyle, TextStyle, FlexAlign, FlexJustify } from './styles'
export { mount } from './render'

export type { SymbioteEvent } from '@symbiote/shared'
