// ScrollView on iOS: the RefreshControl is a CHILD of the scroll view, rendered as a
// sibling BEFORE the content container (RN ScrollView.js: {refreshControl}{contentContainer}).
// Also the base (scroll-view.ts re-exports it) for headless / web. See ADR 0020.

import { createElement, type FC } from 'react'
import { prepareScrollView, type ScrollViewProps } from './scroll-view-shared'
export type { ScrollViewProps } from './scroll-view-shared'

export const ScrollView: FC<ScrollViewProps> = (props) => {
  const { scrollViewIntrinsic, scrollViewBaseStyle, outerProps, style, content, refreshControl } =
    prepareScrollView(props)
  // Base style under user style so an explicit user value wins; undefined base (vertical)
  // passes the user style through unchanged.
  const scrollStyle = scrollViewBaseStyle ? { ...scrollViewBaseStyle, ...style } : style
  const scrollProps = { ...outerProps, style: scrollStyle }

  if (refreshControl === undefined) {
    return createElement(scrollViewIntrinsic, scrollProps, content)
  }
  return createElement(scrollViewIntrinsic, scrollProps, refreshControl, content)
}
