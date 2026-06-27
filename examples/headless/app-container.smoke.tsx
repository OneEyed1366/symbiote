// Regression proof of the synthetic root container — symbiote's equivalent of RN's
// AppContainer (renderApplication wraps the app in `<View style={{flex:1}}
// pointerEvents="box-none">`). Every commit must put a single RCTView root with flex:1
// + box-none at the top of the child set, wrapping the app's own top-level nodes, so a
// flex:1 root fills the screen and touches outside the app's children have an escape.

import { type ReactElement } from 'react'
import { View, Text, mount } from '@symbiote/react'

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let committed: IFakeNode[] = []
let nextTag = 100

const slot = {
  createNode(
    _tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    return { tag: nextTag++, viewName, props, children: [], instanceHandle }
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
  registerEventHandler(): void {},
}

Object.assign(globalThis, { nativeFabricUIManager: slot })

function App(): ReactElement {
  return (
    <View>
      <Text>hello</Text>
    </View>
  )
}

mount(31, <App />)

// ---- the root child set is exactly one synthetic RCTView ------------------

if (committed.length !== 1) {
  throw new Error(`expected one root child (the synthetic container), got ${committed.length}`)
}
const root = committed[0]
if (root.viewName !== 'RCTView') {
  throw new Error(`synthetic root must be an RCTView, got ${root.viewName}`)
}
if (root.props.flex !== 1) {
  throw new Error(`synthetic root must carry flex:1, got ${JSON.stringify(root.props)}`)
}
if (root.props.pointerEvents !== 'box-none') {
  throw new Error(`synthetic root must be pointerEvents box-none, got ${JSON.stringify(root.props)}`)
}

// ---- the app's own View is the wrapper's single child --------------------

if (root.children.length !== 1 || root.children[0].viewName !== 'RCTView') {
  throw new Error(
    `app View must sit under the synthetic root, got ${JSON.stringify(root.children.map((c) => c.viewName))}`,
  )
}

console.log(
  'after mount: root =',
  JSON.stringify({ flex: root.props.flex, pointerEvents: root.props.pointerEvents }),
)
console.log('app-container.smoke OK')
