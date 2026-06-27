/** @jsxRuntime automatic */
// Headless proof that VirtualizedSectionList flattens sections into one windowed
// stream. A fake nativeFabricUIManager records every committed node, so we can
// mount two sections, give the list a viewport via a topLayout event, and ASSERT
// the flattened order: section-0 header -> its items -> footer, then section-1
// header -> items -> footer. The whole stream goes through VirtualizedList's
// windowing, so a failure here is in JS, not the simulator.

import { createElement, type ReactElement } from 'react'
import { mount } from '@symbiote/react'
// Not on the barrel yet (the integrator wires exports), so reach the source.
import { VirtualizedSectionList } from '../../adapters/react/src/virtualized-section-list'

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

// ---- the app ------------------------------------------------------------

const VIEWPORT_HEIGHT = 400

interface IRow {
  id: number
  label: string
}

interface ISectionShape {
  title: string
  data: readonly IRow[]
}

const SECTIONS: ISectionShape[] = [
  {
    title: 'Section A',
    data: [
      { id: 0, label: 'row-a0' },
      { id: 1, label: 'row-a1' },
    ],
  },
  {
    title: 'Section B',
    data: [
      { id: 2, label: 'row-b0' },
      { id: 3, label: 'row-b1' },
    ],
  },
]

function App(): ReactElement {
  return createElement(VirtualizedSectionList<IRow>, {
    sections: SECTIONS,
    keyExtractor: (item: IRow) => `k-${item.id}`,
    renderSectionHeader: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `header:${section.title}`),
    renderSectionFooter: ({ section }: { section: ISectionShape }) =>
      createElement('symbiote-text', {}, `footer:${section.title}`),
    renderItem: ({ item }: { item: IRow }) =>
      createElement('symbiote-text', {}, item.label),
  })
}

// ---- helpers ------------------------------------------------------------

// The committed text stream, in document order. We walk the committed tree and
// collect every text payload, which is exactly the flattened entry sequence.
function collectTexts(): string[] {
  const texts: string[] = []
  walk(committed, (node) => {
    const text = node.props.text
    if (typeof text === 'string') texts.push(text)
  })
  return texts
}

function walk(nodes: IFakeNode[], visit: (node: IFakeNode) => void): void {
  for (const node of nodes) {
    visit(node)
    walk(node.children, visit)
  }
}

function findScrollView(): IFakeNode {
  const node = allCreated.find((n) => n.viewName === 'RCTScrollView')
  if (!node) throw new Error('no RCTScrollView was created')
  return node
}

function fire(handle: unknown, type: string, nativeEvent: Record<string, unknown>): void {
  if (!eventHandler) throw new Error('no event handler was registered')
  eventHandler(handle, type, nativeEvent)
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 21
mount(ROOT_TAG, <App />)

// Establish the viewport by firing onLayout on the ScrollView. This re-renders
// and re-commits synchronously, narrowing the window from the initial bounded
// prefix to the real visible region. With only 8 entries the whole stream fits.
const scrollView = findScrollView()
fire(scrollView.instanceHandle, 'topLayout', {
  layout: { x: 0, y: 0, width: 320, height: VIEWPORT_HEIGHT },
})

// ---- assertion: header -> items -> footer per section, in order ---------

const texts = collectTexts()

const EXPECTED = [
  'header:Section A',
  'row-a0',
  'row-a1',
  'footer:Section A',
  'header:Section B',
  'row-b0',
  'row-b1',
  'footer:Section B',
]

for (const want of EXPECTED) {
  if (!texts.includes(want)) {
    throw new Error(`flattened stream is missing "${want}"; committed: ${JSON.stringify(texts)}`)
  }
}

// Order matters: the flattened sequence must be exactly header, items, footer per
// section. Filter to the entries we care about and compare positionally so an
// out-of-order footer or a misrouted item is caught.
const relevant = texts.filter((text) => EXPECTED.includes(text))
for (let index = 0; index < EXPECTED.length; index += 1) {
  if (relevant[index] !== EXPECTED[index]) {
    throw new Error(
      `flattened order wrong at index ${index}: expected "${EXPECTED[index]}", got "${relevant[index]}"; ` +
        `full order: ${JSON.stringify(relevant)}`,
    )
  }
}

console.log('virtualized-section-list.smoke OK')
