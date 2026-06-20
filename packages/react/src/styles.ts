// A small, typed style surface for the View + Text canary. These map onto Yoga
// layout props and RN's view/text props, which Fabric's C++ reads off the props
// payload. Intentionally a curated subset — not the full RN StyleSheet.

export type FlexAlign = 'flex-start' | 'flex-end' | 'center' | 'stretch' | 'baseline'
export type FlexJustify =
  | 'flex-start'
  | 'flex-end'
  | 'center'
  | 'space-between'
  | 'space-around'
  | 'space-evenly'

export interface ViewStyle {
  width?: number | string
  height?: number | string
  minWidth?: number | string
  minHeight?: number | string
  flex?: number
  flexDirection?: 'row' | 'column' | 'row-reverse' | 'column-reverse'
  flexGrow?: number
  flexShrink?: number
  alignItems?: FlexAlign
  alignSelf?: FlexAlign
  justifyContent?: FlexJustify
  gap?: number
  padding?: number
  paddingHorizontal?: number
  paddingVertical?: number
  margin?: number
  marginHorizontal?: number
  marginVertical?: number
  backgroundColor?: string
  borderRadius?: number
  borderWidth?: number
  borderColor?: string
  opacity?: number
}

export interface TextStyle extends ViewStyle {
  color?: string
  fontSize?: number
  fontWeight?: 'normal' | 'bold' | '400' | '500' | '600' | '700'
  textAlign?: 'auto' | 'left' | 'right' | 'center'
  lineHeight?: number
}
