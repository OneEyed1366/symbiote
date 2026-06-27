// Headless proof of the SafeAreaView primitive. A fake nativeFabricUIManager
// records the committed tree so we can assert the SafeAreaView Fabric view name,
// the style passthrough, that children nest under it, that the standard ViewProps
// (testID/accessibilityLabel/accessible) reach the safe-area node, and that
// onLayout routes as a real `topLayout` event — no simulator needed.

import { type ReactElement } from 'react'
import { View, mount } from '@symbiote/react'
// SafeAreaView isn't on the barrel yet (the parent wires exports), so reach the
// source directly — the headless harness has no built dist.
import { SafeAreaView } from '../../adapters/react/src/safe-area-view'

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

let layoutFired = false

const TEST_ID = 'safe-area'
const ACCESSIBILITY_LABEL = 'screen'

function App(): ReactElement {
  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: '#fff' }}
      testID={TEST_ID}
      accessibilityLabel={ACCESSIBILITY_LABEL}
      accessible={true}
      onLayout={() => {
        layoutFired = true
      }}
    >
      <View />
    </SafeAreaView>
  )
}

// ---- helpers ------------------------------------------------------------

function serialize(nodes: IFakeNode[]): string {
  return nodes.map(serializeNode).join('')
}
function serializeNode(node: IFakeNode): string {
  const kids = node.children.length ? `(${node.children.map(serializeNode).join('')})` : ''
  return `${node.viewName}${kids}`
}

// ---- run ----------------------------------------------------------------

const ROOT_TAG = 31
mount(ROOT_TAG, <App />)

// Every commit is now wrapped in RN's AppContainer equivalent: one synthetic RCTView
// root (flex:1 + pointerEvents box-none). Unwrap it before asserting the app's shape.
const [appRoot] = committed
if (committed.length !== 1 || appRoot.props.pointerEvents !== 'box-none') {
  throw new Error(`expected one synthetic box-none root, got ${serialize(committed)}`)
}
const shape = serialize(appRoot.children)
if (shape !== 'SafeAreaView(RCTView)') {
  throw new Error(`committed tree wrong: ${shape}`)
}

const safe = allCreated.find((node) => node.viewName === 'SafeAreaView')
if (!safe) throw new Error('no SafeAreaView was created')
// shared flattens `style` onto the top-level props payload.
if (safe.props.flex !== 1 || safe.props.backgroundColor !== '#fff') {
  throw new Error(`style did not pass through: ${JSON.stringify(safe.props)}`)
}
if (safe.children.length !== 1 || safe.children[0].viewName !== 'RCTView') {
  throw new Error(`children did not nest: ${serializeNode(safe)}`)
}

// Standard ViewProps reach the safe-area node.
if (safe.props.testID !== TEST_ID) {
  throw new Error(`testID did not pass through: ${JSON.stringify(safe.props)}`)
}
if (safe.props.accessibilityLabel !== ACCESSIBILITY_LABEL) {
  throw new Error(`accessibilityLabel did not pass through: ${JSON.stringify(safe.props)}`)
}
if (safe.props.accessible !== true) {
  throw new Error(`accessible did not pass through: ${JSON.stringify(safe.props)}`)
}

// onLayout is a BASE event in shared's ViewConfig — firing topLayout on the
// safe-area node must call the handler.
if (!eventHandler) throw new Error('no event handler was registered')
eventHandler(safe.instanceHandle, 'topLayout', {})
if (!layoutFired) throw new Error('onLayout did not fire on topLayout')

console.log('safe-area-view.smoke OK')
