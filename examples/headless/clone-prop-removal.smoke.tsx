// Regression for a clone-on-write bug that only a Fabric-faithful slot reveals:
// `cloneNodeWithNewProps` MERGES the raw payload onto the node's existing props, so
// a prop that simply disappears between commits keeps its stale value. (A naive
// fake slot that REPLACES props hides the bug — which is why it shipped.) Here the
// slot merges and treats null as reset, exactly like Fabric, so a Pressable whose
// pressed style sets opacity:0.2 must fully drop opacity on release — not stay dim.

import { createElement, useState, type ReactElement } from 'react'
import { mount, Pressable, View, Text } from '@symbiote/react'

interface FakeNode {
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

let committed: FakeNode[] = []
let eventHandler: ((handle: unknown, type: string, event: Record<string, unknown>) => void) | undefined

// Fabric-faithful merge: raw props layer onto the node's current props; a null
// value resets that prop to its default (modelled here as removal).
function mergeProps(
  base: Record<string, unknown>,
  raw: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(raw)) {
    if (value === null) delete out[key]
    else out[key] = value
  }
  return out
}

const slot = {
  createNode: (
    _t: number,
    viewName: string,
    _r: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode => ({ viewName, props: { ...props }, children: [], instanceHandle }),
  cloneNodeWithNewProps: (node: FakeNode, raw: Record<string, unknown>): FakeNode => ({
    ...node,
    props: mergeProps(node.props, raw),
    children: [...node.children],
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (node: FakeNode, raw: Record<string, unknown>): FakeNode => ({
    ...node,
    props: mergeProps(node.props, raw),
    children: [],
  }),
  createChildSet: (): FakeNode[] => [],
  appendChild: (parent: FakeNode, child: FakeNode): FakeNode => {
    parent.children.push(child)
    return parent
  },
  appendChildToSet: (childSet: FakeNode[], child: FakeNode): void => {
    childSet.push(child)
  },
  completeRoot: (_r: number, childSet: FakeNode[]): void => {
    committed = childSet
  },
  registerEventHandler: (
    handler: (handle: unknown, type: string, event: Record<string, unknown>) => void,
  ): void => {
    eventHandler = handler
  },
  dispatchCommand: (): void => {},
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

const TEST_ID = 'btn'
const ACTIVE_OPACITY = 0.2

function App(): ReactElement {
  // onPress mounts a sibling subtree, mirroring "open a Modal on press" — the case
  // where the bug showed up on device (the button stayed dim after the modal opened).
  const [open, setOpen] = useState(false)
  return createElement(
    View,
    null,
    createElement(
      Pressable,
      {
        testID: TEST_ID,
        onPress: () => setOpen(true),
        // pressed -> dim; released -> NO opacity key at all (TouchableOpacity's shape)
        style: ({ pressed }: { pressed: boolean }) => (pressed ? { opacity: ACTIVE_OPACITY } : {}),
      },
      createElement(Text, null, 'tap'),
    ),
    open ? createElement(View, null, createElement(Text, null, 'opened')) : null,
  )
}

function findByTestId(nodes: FakeNode[], id: string): FakeNode | undefined {
  for (const node of nodes) {
    if (node.props.testID === id) return node
    const found = findByTestId(node.children, id)
    if (found) return found
  }
  return undefined
}

mount(7, createElement(App))

if (!eventHandler) throw new Error('no event handler registered')
const button = findByTestId(committed, TEST_ID)
if (!button) throw new Error('button not found in committed tree')
const handle = button.instanceHandle

eventHandler(handle, 'topTouchStart', {})
const pressedNode = findByTestId(committed, TEST_ID)
if (pressedNode?.props.opacity !== ACTIVE_OPACITY) {
  throw new Error(`pressed should set opacity ${ACTIVE_OPACITY}, got ${JSON.stringify(pressedNode?.props.opacity)}`)
}

eventHandler(handle, 'topTouchEnd', {})
const releasedNode = findByTestId(committed, TEST_ID)
// The whole point: opacity must be GONE (reset), not stuck at 0.2 after the merge.
if (releasedNode?.props.opacity !== undefined) {
  throw new Error(
    `opacity must reset on release, but Fabric-merge left it at ${JSON.stringify(releasedNode?.props.opacity)}`,
  )
}

console.log('clone-prop-removal.smoke OK')
