// Headless proof that the newly-typed View/Text event + alias props thread through
// the React adapter to the committed Fabric node:
//   1. <View onLayout> raises the `layout` event — a listener flags onLayout:true on
//      the node (Fabric only measures a flagged node; see view-config BASE_EVENTS +
//      events.smoke). The same holds for <Text onLayout>.
//   2. id="foo" is RN's W3C alias for nativeID — it must land as nativeID:'foo' on the
//      node and NEVER reach Fabric as a raw `id` prop (View.js folds id -> nativeID).
// A regression here means the prop was typed but not wired, or `id` leaked to the slot.

import { type ReactElement } from 'react'
import { mount, View, Text } from '@symbiote/react'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
}

let committed: FakeNode[] = []
const slot = {
  createNode: (
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
  ): FakeNode => ({ tag, viewName, props, children: [] }),
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: { ...node.props, ...newProps },
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: { ...node.props, ...newProps }, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (childSet: FakeNode[], child: FakeNode): void => {
    childSet.push(child)
  },
  completeRoot: (_rootTag: number, childSet: FakeNode[]): void => {
    committed = childSet
  },
  registerEventHandler: (): void => {},
  dispatchCommand: (): void => {},
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

function App(): ReactElement {
  return (
    <View id="foo" onLayout={() => {}}>
      <Text onLayout={() => {}}>hi</Text>
    </View>
  )
}
mount(31, <App />)

function find(node: FakeNode, predicate: (n: FakeNode) => boolean): FakeNode | undefined {
  if (predicate(node)) return node
  for (const child of node.children) {
    const hit = find(child, predicate)
    if (hit) return hit
  }
  return undefined
}

const root = committed[0]
if (!root) throw new Error('nothing committed')

// --- 1. View: onLayout listener flags the node, id folds to nativeID ---------
// The app's View is the RCTView carrying nativeID (the synthetic surface root never does).
const view = find(root, (n) => n.viewName === 'RCTView' && n.props.nativeID === 'foo')
if (!view) throw new Error('no View with nativeID="foo" committed — id did not fold to nativeID')

if ('id' in view.props) {
  throw new Error(`raw "id" leaked to Fabric: ${JSON.stringify(view.props.id)} — must be stripped`)
}
if (view.props.onLayout !== true) {
  throw new Error(`View onLayout must flag the node (onLayout:true), got ${JSON.stringify(view.props.onLayout)}`)
}

// --- 2. Text: onLayout listener flags the Text node too ----------------------
const text = find(root, (n) => n.viewName === 'RCTText')
if (!text) throw new Error('no RCTText committed')
if (text.props.onLayout !== true) {
  throw new Error(`Text onLayout must flag the node (onLayout:true), got ${JSON.stringify(text.props.onLayout)}`)
}

console.log('view-layout-id: View nativeID="foo" (no raw id), View+Text onLayout flagged')
console.log('view-layout-id.smoke OK')
