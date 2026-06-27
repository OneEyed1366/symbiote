// Regression for the device bug "press any button → the native pulse stops and
// never restarts". An unrelated re-render rebuilds the Animated.View's AnimatedProps
// leaf; if the swap detaches the old leaf BEFORE attaching the new one, the shared
// Value node momentarily reaches zero children, self-detaches, and drops its native
// animation node — killing the running native-driven loop for good. We mount a
// native-driven view, start a native animation on a Value, then force a re-render
// (the same thing a sibling button's setState does) and assert the Value's native
// node is NEVER dropped and its animation is never restarted. No simulator: a
// failure here is the JS leaf-swap ordering, exactly what crashed on device.

import { type ReactElement } from 'react'
import {
  createSurface,
  setEventDispatcher,
  type IRootTag,
} from '@symbiote/engine'
import reconciler, { withDiscretePriority } from '../../adapters/react/src/host-config'
import { LegacyRoot } from '../../adapters/react/src/reconciler-constants'
import { Animated } from '../../adapters/react/src/animated'

// ---- fake NativeAnimatedTurboModule (records calls) ----------------------

interface INativeCall {
  method: string
  args: unknown[]
}
const nativeCalls: INativeCall[] = []

function record(method: string): (...args: unknown[]) => void {
  return (...args: unknown[]) => {
    nativeCalls.push({ method, args })
  }
}

const fakeNativeAnimated = {
  createAnimatedNode(tag: number, config: unknown): void {
    nativeCalls.push({ method: 'createAnimatedNode', args: [tag, config] })
  },
  connectAnimatedNodes: record('connectAnimatedNodes'),
  disconnectAnimatedNodes: record('disconnectAnimatedNodes'),
  connectAnimatedNodeToView: record('connectAnimatedNodeToView'),
  disconnectAnimatedNodeFromView: record('disconnectAnimatedNodeFromView'),
  restoreDefaultValues: record('restoreDefaultValues'),
  dropAnimatedNode: record('dropAnimatedNode'),
  startAnimatingNode: record('startAnimatingNode'),
  stopAnimation: record('stopAnimation'),
  setAnimatedNodeValue: record('setAnimatedNodeValue'),
  setAnimatedNodeOffset: record('setAnimatedNodeOffset'),
  flattenAnimatedNodeOffset: record('flattenAnimatedNodeOffset'),
  extractAnimatedNodeOffset: record('extractAnimatedNodeOffset'),
  startListeningToAnimatedNodeValue: record('startListeningToAnimatedNodeValue'),
  stopListeningToAnimatedNodeValue: record('stopListeningToAnimatedNodeValue'),
  getValue: record('getValue'),
  addAnimatedEventToView: record('addAnimatedEventToView'),
  removeAnimatedEventFromView: record('removeAnimatedEventFromView'),
}
Object.assign(globalThis, {
  nativeModuleProxy: { NativeAnimatedTurboModule: fakeNativeAnimated },
})

// ---- fake Fabric slot ----------------------------------------------------

interface IFakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: IFakeNode[]
  instanceHandle: unknown
}

let committed: IFakeNode[] = []

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): IFakeNode {
    return { tag, viewName, props, children: [], instanceHandle }
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

setEventDispatcher((run) => {
  withDiscretePriority(run)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()
})

// ---- mount with a held container so we can force re-renders ---------------

const ROOT_TAG: IRootTag = 73
const surface = createSurface(ROOT_TAG)
const noop = (): void => {}
const container = reconciler.createContainer(
  surface,
  LegacyRoot,
  null,
  false,
  null,
  'symbiote',
  noop,
  noop,
  noop,
  noop,
  null,
)

function render(element: ReactElement): void {
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()
}

function appView(): IFakeNode {
  if (committed.length !== 1) {
    throw new Error(`expected one synthetic root, got ${JSON.stringify(committed)}`)
  }
  return committed[0].children[0]
}

function callsOf(method: string): INativeCall[] {
  return nativeCalls.filter((call) => call.method === method)
}

// The Value is owned outside render (a useRef in real code), so it is stable across
// re-renders — only the Animated.View's props object is fresh each render. `tick` is
// the unrelated state a sibling button would bump; it changes nothing animated.
const opacity = new Animated.Value(0)

function App(props: { tick: number }): ReactElement {
  return <Animated.View style={{ opacity, marginTop: props.tick }} />
}

// ---- mount, go native, then re-render the way a button press would --------

render(<App tick={0} />)
appView()

Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start()

const valueCreate = callsOf('createAnimatedNode').find((call) => {
  const config = call.args[1]
  return typeof config === 'object' && config !== null && 'type' in config && config.type === 'value'
})
const valueTag = valueCreate?.args[0]
if (typeof valueTag !== 'number') {
  throw new Error(`native value node was not created, got ${String(valueTag)}`)
}
const startsBefore = callsOf('startAnimatingNode').length
if (startsBefore !== 1) throw new Error(`expected one startAnimatingNode, got ${startsBefore}`)

// A sibling button's setState: unrelated re-render, nothing animated changed.
render(<App tick={8} />)

// The running native animation must survive: its Value node was never dropped...
const droppedValue = callsOf('dropAnimatedNode').some((call) => call.args[0] === valueTag)
if (droppedValue) {
  throw new Error(
    `the running Value node ${valueTag} was dropped on an unrelated re-render — ` +
      `the native animation is dead (leaf swap detached before attaching)`,
  )
}

// ...and it was never restarted (a drop would force a fresh tag + re-start).
const startsAfter = callsOf('startAnimatingNode').length
if (startsAfter !== startsBefore) {
  throw new Error(`native animation was disturbed by a re-render: ${startsBefore} -> ${startsAfter} starts`)
}

console.log('value node survived re-render: tag', valueTag, '| starts', startsAfter)
console.log('animated-native-rerender.smoke OK')
