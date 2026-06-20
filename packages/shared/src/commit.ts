// The clone-on-write engine. Fabric is persistent: you never mutate a committed
// node, you build a fresh child set and atomically hand it to completeRoot.
//
// Strategy for the canary: every commit rebuilds the whole child set from
// scratch via createNode + appendChild — which is exactly Fabric's initial-mount
// path (the one React itself runs on first render), so it is always correct by
// construction. The retained SymbioteNode tree stays stable across commits
// (preserving instanceHandle / event identity); only its Fabric mirror is
// rebuilt. Incremental cloneNodeWithNewProps is a later optimization, not needed
// to prove the pipe.

import { getSlot, type FabricNode, type FabricProps, type RootTag } from './fabric'
import type { SymbioteNode } from './node'
import { nextTag } from './tags'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

// Color props must reach Fabric as platform ints, not CSS strings — Fabric's C++
// color parser silently drops strings. The actual conversion (processColor) is
// RN-platform-specific, so it is injected here rather than imported, keeping
// shared free of a react-native dependency (and the headless harness working).
const COLOR_PROPS: ReadonlySet<string> = new Set([
  'backgroundColor',
  'color',
  'borderColor',
  'borderTopColor',
  'borderRightColor',
  'borderBottomColor',
  'borderLeftColor',
  'shadowColor',
  'tintColor',
])

let colorProcessor: (value: string) => unknown = (value) => value

export function setColorProcessor(process: (value: string) => unknown): void {
  colorProcessor = process
}

function processValue(key: string, value: unknown): unknown {
  if (typeof value === 'string' && COLOR_PROPS.has(key)) {
    return colorProcessor(value)
  }
  return value
}

function viewNameFor(node: SymbioteNode, hasTextAncestor: boolean): string {
  switch (node.kind) {
    case 'view':
      return 'RCTView'
    case 'rawText':
      return 'RCTRawText'
    case 'text':
      // Nested text becomes a virtual span; top-level text is a paragraph.
      return hasTextAncestor ? 'RCTVirtualText' : 'RCTText'
  }
}

// Translate the retained node's logical props into the flat payload Fabric's C++
// props expect: `style` keys are hoisted to the top level, event handlers and
// undefined values are dropped.
function fabricProps(node: SymbioteNode): FabricProps {
  if (node.kind === 'rawText') {
    return { text: node.props.text }
  }
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.props)) {
    if (key === 'style') continue
    if (typeof value === 'function') continue
    if (value === undefined) continue
    out[key] = processValue(key, value)
  }
  const style = node.props.style
  if (isRecord(style)) {
    for (const [key, value] of Object.entries(style)) {
      if (value !== undefined) out[key] = processValue(key, value)
    }
  }
  return out
}

function build(
  slot: ReturnType<typeof getSlot>,
  node: SymbioteNode,
  rootTag: RootTag,
  hasTextAncestor: boolean,
): FabricNode {
  const fabricNode = slot.createNode(
    nextTag(),
    viewNameFor(node, hasTextAncestor),
    rootTag,
    fabricProps(node),
    node, // instanceHandle — the same object Fabric hands back on events
  )
  const childInText = node.kind === 'text' || hasTextAncestor
  for (const child of node.children) {
    // During creation the node is unsealed, so appendChild attaches in place;
    // its returned clone is irrelevant here, exactly as on React's mount path.
    slot.appendChild(fabricNode, build(slot, child, rootTag, childInText))
  }
  return fabricNode
}

export function commitChildren(rootTag: RootTag, children: readonly SymbioteNode[]): void {
  const slot = getSlot()
  const childSet = slot.createChildSet(rootTag)
  for (const child of children) {
    slot.appendChildToSet(childSet, build(slot, child, rootTag, false))
  }
  slot.completeRoot(rootTag, childSet)
}
