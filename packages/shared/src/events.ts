// Event normalization. Fabric delivers raw touch primitives to a single global
// handler, with the instanceHandle (our SymbioteNode) as the target. There is no
// raw `press` event — a tap is synthesized from a touch sequence; for the canary
// we treat topTouchEnd as a press. Events bubble up the retained tree via parent
// pointers until a listener is found.

import { getSlot } from './fabric'
import { isSymbioteNode, type SymbioteNode } from './node'

const RAW_TO_LISTENER: Readonly<Record<string, string>> = {
  topTouchEnd: 'press',
}

let installed = false

// An event arrives outside the framework's own update loop. Adapters wrap the
// dispatch so the listener's state change runs at the right priority and is
// flushed synchronously — both framework-specific (e.g. React's discrete lane +
// flushSyncWork), so the wrapper lives in the adapter, not here. The default is
// a plain pass-through for adapters that need no wrapping.
let wrapDispatch: (run: () => void) => void = (run) => {
  run()
}

export function setEventDispatcher(wrap: (run: () => void) => void): void {
  wrapDispatch = wrap
}

export function installEventHandler(): void {
  if (installed) return
  installed = true

  getSlot().registerEventHandler((instanceHandle, topLevelType, nativeEvent) => {
    const listenerName = RAW_TO_LISTENER[topLevelType]
    if (listenerName === undefined) return
    if (!isSymbioteNode(instanceHandle)) return
    wrapDispatch(() => dispatch(instanceHandle, listenerName, nativeEvent))
  })
}

function dispatch(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let node: SymbioteNode | undefined = target
  while (node) {
    const listener = node.listeners?.get(listenerName)
    if (listener) {
      listener({ type: listenerName, target, nativeEvent })
      return
    }
    node = node.parent
  }
}
