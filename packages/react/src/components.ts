// Host primitives exposed to user code. They are thin wrappers that produce the
// lowercase host elements the reconciler understands (`view` / `text`); the
// reconciler maps those to shared's mutation API, which resolves them to Fabric
// view names at commit.

import { createElement, type FC, type ReactNode } from 'react'
import type { SymbioteEvent } from '@symbiote/shared'
import type { TextStyle, ViewStyle } from './styles'

export interface ViewProps {
  style?: ViewStyle
  onPress?: (event: SymbioteEvent) => void
  children?: ReactNode
}

export interface TextProps {
  style?: TextStyle
  onPress?: (event: SymbioteEvent) => void
  children?: ReactNode
}

export const View: FC<ViewProps> = (props) => createElement('symbiote-view', props)
export const Text: FC<TextProps> = (props) => createElement('symbiote-text', props)
