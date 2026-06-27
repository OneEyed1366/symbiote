/** @jsxRuntime automatic */
// Headless proof for two VirtualizedList parity fixes that a simulator would
// otherwise be the only witness to:
//
//   1. `inverted` must flip exactly TWO tree levels — the outer scroll node and
//      each cell — and NEVER the content container. RN composes inversionStyle
//      onto the ScrollView `style` and each cell, but the content view gets only
//      contentContainerStyle (VirtualizedList.js ~L918 cell, ~L1108 ScrollView
//      style; the content view is unflipped). The old code flipped all three, so
//      the content/container flips cancelled and the list read upright while each
//      cell still flipped — cells upside-down. We mount an inverted FlatList,
//      walk the committed tree, and assert the scale(-1) transform is on the
//      RCTScrollView node AND a cell wrapper, but ABSENT from RCTScrollContentView.
//
//   2. `waitForInteraction: true` must suppress all viewable items until the
//      first scroll (RN's ViewabilityHelper `waitForInteraction && !_hasInteracted`
//      gate, ungated by recordInteraction on scroll). We mount with that config and
//      assert onViewableItemsChanged reports nothing before any scroll, then the
//      visible rows after the first scroll.
//
// No simulator; a failure here is in JS.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
import { FlatList } from '../../adapters/react/src/flat-list'
import type { IViewableItemsChangedInfo } from '../../adapters/react/src/virtualized-list'

// ---- fake Fabric slot ---------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

type IEventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let committed: IFakeNode[] = []
let eventHandler: IEventHandler | undefined
const allCreated: IFakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    const node: IFakeNode = { tag, viewName, props, children: [], instanceHandle }
    allCreated.push(node)
    return node
  },
  cloneNodeWithNewProps: (node: IFakeNode, newProps: Record<string, unknown>): IFakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: IFakeNode): IFakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: IFakeNode,
    newProps: Record<string, unknown>,
  ): IFakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): IFakeNode[] => [],
  appendChild(parent: IFakeNode, child: IFakeNode): IFakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: IFakeNode[], child: IFakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: IFakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: IEventHandler): void {
    eventHandler = handler
  },
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- data ---------------------------------------------------------------

const ITEM_COUNT = 50
const ITEM_HEIGHT = 40
const VIEWPORT_HEIGHT = 400
const SCROLL_OFFSET = 80

interface IRow {
  id: number
  label: string
}

const DATA: IRow[] = Array.from({ length: ITEM_COUNT }, (_unused, index) => ({
  id: index,
  label: `row-${index}`,
}))

// ---- helpers ------------------------------------------------------------

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node)
    walk(node.children, visit)
  }
}

function findCommitted(viewName: string): IFakeNode | undefined {
  let found: IFakeNode | undefined
  walk(committed, (node) => {
    if (found === undefined && node.viewName === viewName) found = node
  })
  return found
}

// True when a scale(-1) flip (the inversion transform) appears anywhere in a
// node's props — robust to whether style lands as `props.style.transform` or a
// hoisted `props.transform`. We only care that the flip IS or ISN'T present.
function hasInversionTransform(props: Record<string, unknown>): boolean {
  let found = false
  const seen = new Set<unknown>()
  const visit = (value: unknown): void => {
    if (found || value === null || typeof value !== 'object') return
    if (seen.has(value)) return
    seen.add(value)
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry)
      return
    }
    const record: Record<string, unknown> = { ...value }
    const scaleY = record.scaleY
    const scaleX = record.scaleX
    if (scaleY === -1 || scaleX === -1) {
      found = true
      return
    }
    for (const key of Object.keys(record)) visit(record[key])
  }
  visit(props)
  return found
}

// The cell wrapper is the measuring RCTView whose direct child is the RCTText
// for a single "row-N". Matching on a direct RCTText child skips the outer
// root/scroll/content RCTViews (whose only child is another container view), which
// also have a row far below them.
function findCellWithRowText(): IFakeNode | undefined {
  let found: IFakeNode | undefined
  walk(committed, (node) => {
    if (found !== undefined || node.viewName !== 'RCTView') return
    const textChild = node.children.find((child) => child.viewName === 'RCTText')
    if (textChild === undefined) return
    let carriesRow = false
    walk([textChild], (descendant) => {
      const text = descendant.props.text
      if (typeof text === 'string' && text.startsWith('row-')) carriesRow = true
    })
    if (carriesRow) found = node
  })
  return found
}

function fire(handle: unknown, type: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, nativeEvent)
}

// =========================================================================
// PART 1 — inverted flips exactly the scroll node and each cell, NOT content
// =========================================================================

function InvertedApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    inverted: true,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  })
}

mount(40, <InvertedApp />)

// Establish the viewport so cells actually commit.
const invertedScroll = allCreated.find((n) => n.viewName === 'RCTScrollView')
if (!invertedScroll) throw new Error('inverted: no RCTScrollView was created')
fire(invertedScroll.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

const scrollNode = findCommitted('RCTScrollView')
if (!scrollNode) throw new Error('inverted: RCTScrollView not in committed tree')
const contentNode = findCommitted('RCTScrollContentView')
if (!contentNode) throw new Error('inverted: RCTScrollContentView not in committed tree')
const cellNode = findCellWithRowText()
if (!cellNode) throw new Error('inverted: no cell wrapper carrying a row label was committed')

// The outer scroll node IS flipped.
if (!hasInversionTransform(scrollNode.props)) {
  throw new Error('inverted: RCTScrollView is missing the scale(-1) inversion transform')
}
// Each cell IS flipped (counter-flip so its content reads upright).
if (!hasInversionTransform(cellNode.props)) {
  throw new Error('inverted: the cell wrapper is missing the scale(-1) counter-flip transform')
}
// The content container is NOT flipped — the bug was a third, cancelling flip here.
if (hasInversionTransform(contentNode.props)) {
  throw new Error(
    'inverted: RCTScrollContentView must NOT carry the inversion transform — ' +
      'flipping it cancels the scroll-node flip and renders cells upside-down',
  )
}

// =========================================================================
// PART 2 — waitForInteraction suppresses viewable items until first scroll
// =========================================================================

const viewableReports: IViewableItemsChangedInfo<IRow>[] = []

function GatedApp(): ReactElement {
  return createElement(FlatList<IRow>, {
    data: DATA,
    keyExtractor: (item: IRow) => `g-${item.id}`,
    getItemLayout: (_data: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    viewabilityConfig: { itemVisiblePercentThreshold: 50, waitForInteraction: true },
    onViewableItemsChanged: (info: IViewableItemsChangedInfo<IRow>) => {
      viewableReports.push(info)
    },
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', { key: item.id }, item.label),
  })
}

committed = []
allCreated.length = 0
viewableReports.length = 0

mount(60, <GatedApp />)

const gatedScroll = allCreated.find((n) => n.viewName === 'RCTScrollView')
if (!gatedScroll) throw new Error('gated: no RCTScrollView was created')

// Establish the viewport (a layout, not a scroll — must NOT count as interaction).
fire(gatedScroll.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

// Before any scroll: waitForInteraction must suppress every viewable item.
const viewableBefore = viewableReports.flatMap((r) => r.viewableItems)
if (viewableBefore.length !== 0) {
  throw new Error(
    `waitForInteraction: ${viewableBefore.length} item(s) reported viewable before any scroll ` +
      '(expected none until the first interaction)',
  )
}

// First scroll = the interaction that ungates the config.
const CONTENT_HEIGHT = ITEM_COUNT * ITEM_HEIGHT
fire(gatedScroll.instanceHandle, 'topScroll', {
  contentOffset: { x: 0, y: SCROLL_OFFSET },
  contentSize: { width: 320, height: CONTENT_HEIGHT },
  layoutMeasurement: { width: 320, height: VIEWPORT_HEIGHT },
})

const viewableAfter = viewableReports.flatMap((r) => r.viewableItems)
if (viewableAfter.length === 0) {
  throw new Error('waitForInteraction: no items reported viewable after the first scroll')
}
// The window at offset 80, 400px viewport, 40px rows => rows ~2..11 fully visible.
const labelsAfter = new Set(viewableAfter.map((token) => token.item.label))
if (!labelsAfter.has('row-3')) {
  throw new Error(
    `waitForInteraction: expected row-3 viewable after scroll, got ${[...labelsAfter].join(', ')}`,
  )
}

console.log('flat-list-inverted.smoke OK')
