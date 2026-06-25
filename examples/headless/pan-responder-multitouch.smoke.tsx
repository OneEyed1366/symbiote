/** @jsxRuntime automatic */
// Headless proof that PanResponder's dx/dy/vx/vy track the touch-history bank, not a
// grant-relative centroid of ALL live touches. Drives a real View+PanResponder through
// the same event layer the device uses (topTouchStart/Move/End on the instanceHandle),
// so shared's ResponderTouchHistoryStore is exercised end-to-end: each touch's own
// previous->current delta drives the gesture. The scenario is two fingers moving, then
// one lifting; the single-finger case (still correct) is covered by pan-responder.smoke.
//
// Why this differs from the old all-touch-centroid math: when one of two fingers moves,
// dx must advance by the centroid change of the MOVED touches only (RN's
// _updateGestureStateOnMove accumulator), and once a finger lifts only the remaining
// finger contributes. A naive `centroidNow - x0` would report different totals (noted
// inline below). Expected values cross-checked against a faithful RN port.

import { type ReactElement } from 'react'
import { mount, View, PanResponder } from '@symbiote/react'

interface FakeNode {
  tag: number
  viewName: string
  props: Record<string, unknown>
  children: FakeNode[]
  instanceHandle: unknown
}

type EventHandler = (
  instanceHandle: unknown,
  topLevelType: string,
  nativeEvent: Record<string, unknown>,
) => void

let committed: FakeNode[] = []
let eventHandler: EventHandler | undefined

const slot = {
  createNode(
    tag: number,
    viewName: string,
    _rootTag: number,
    props: Record<string, unknown>,
    instanceHandle: unknown,
  ): FakeNode {
    return { tag, viewName, props, children: [], instanceHandle }
  },
  cloneNodeWithNewProps: (node: FakeNode, newProps: Record<string, unknown>): FakeNode => ({
    ...node,
    props: newProps,
  }),
  cloneNodeWithNewChildren: (node: FakeNode): FakeNode => ({ ...node, children: [] }),
  cloneNodeWithNewChildrenAndProps: (
    node: FakeNode,
    newProps: Record<string, unknown>,
  ): FakeNode => ({ ...node, props: newProps, children: [] }),
  createChildSet: (): FakeNode[] => [],
  appendChild(parent: FakeNode, child: FakeNode): FakeNode {
    parent.children.push(child)
    return parent
  },
  appendChildToSet(childSet: FakeNode[], child: FakeNode): void {
    childSet.push(child)
  },
  completeRoot(_rootTag: number, childSet: FakeNode[]): void {
    committed = childSet
  },
  registerEventHandler(handler: EventHandler): void {
    eventHandler = handler
  },
}
Object.assign(globalThis, { nativeFabricUIManager: slot })

// ---- a View wired with PanResponder, capturing every move gestureState ----

interface Snapshot {
  dx: number
  dy: number
  vx: number
  vy: number
  numberActiveTouches: number
}

const moves: Snapshot[] = []
const responder = PanResponder.create({
  onStartShouldSetPanResponder: () => true,
  onPanResponderMove: (_event, gesture) => {
    moves.push({
      dx: gesture.dx,
      dy: gesture.dy,
      vx: gesture.vx,
      vy: gesture.vy,
      numberActiveTouches: gesture.numberActiveTouches,
    })
  },
})

function App(): ReactElement {
  return <View {...responder.panHandlers} style={{ width: 200, height: 200 }} />
}

mount(9, <App />)

if (committed.length !== 1) throw new Error(`expected one root, got ${JSON.stringify(committed)}`)
const viewNode = committed[0].children[0]
const handle = viewNode.instanceHandle
if (eventHandler === undefined) throw new Error('event handler was never registered')
const dispatch = eventHandler

interface Pt {
  pageX: number
  pageY: number
  identifier: number
  timestamp: number
  // The per-touch target is the instanceHandle node (as Fabric delivers it), so
  // hasRemainingResponderTouch in events.ts keeps the responder while a finger is down.
  target: unknown
}
function pt(identifier: number, pageX: number, pageY: number, timestamp: number): Pt {
  return { pageX, pageY, identifier, timestamp, target: handle }
}
// A native touch frame: `touches` are all fingers down, `changedTouches` the ones that
// changed this frame — exactly the shape Fabric delivers and shared records.
function frame(
  type: string,
  touches: Pt[],
  changedTouches: Pt[],
  timestamp: number,
): void {
  dispatch(handle, type, { touches, changedTouches, target: viewNode.tag, timestamp })
}

function approx(actual: number, expected: number, label: string): void {
  if (Math.abs(actual - expected) > 1e-9) {
    throw new Error(`pan-responder-multitouch.smoke FAILED: ${label}: expected ${expected}, got ${actual}`)
  }
}

const A = 1
const B = 2

// A down at (0,0) t=1000 -> granted (one finger).
frame('topTouchStart', [pt(A, 0, 0, 1000)], [pt(A, 0, 0, 1000)], 1000)
// B down at (200,0) t=1000 -> two fingers, A keeps the responder (LCA skip).
frame('topTouchStart', [pt(A, 0, 0, 1000), pt(B, 200, 0, 1000)], [pt(B, 200, 0, 1000)], 1000)

// frame 1, t=1010: BOTH fingers move +10 in x. Centroid moves +10 -> dx=10.
frame(
  'topTouchMove',
  [pt(A, 10, 0, 1010), pt(B, 210, 0, 1010)],
  [pt(A, 10, 0, 1010), pt(B, 210, 0, 1010)],
  1010,
)

// frame 2, t=1020: ONLY A moves 10 -> 60 (B stays at 210). The moved-touch accumulator
// advances dx to 40. A naive `centroidNow - x0` would report 135 here.
frame('topTouchMove', [pt(A, 60, 0, 1020), pt(B, 210, 0, 1010)], [pt(A, 60, 0, 1020)], 1020)

// B lifts at t=1030 (TOUCH_END, B in changedTouches, only A remains in touches). This is
// an end -> onResponderEnd, not a move, so dx is unchanged but numberActiveTouches drops.
frame('topTouchEnd', [pt(A, 60, 0, 1020)], [pt(B, 210, 0, 1030)], 1030)

// frame 3, t=1040: A alone moves 60 -> 160. Only the remaining finger contributes:
// dx advances by +100 to 140. A naive single-centroid would report 160.
frame('topTouchMove', [pt(A, 160, 0, 1040)], [pt(A, 160, 0, 1040)], 1040)

// Release A.
frame('topTouchEnd', [], [pt(A, 160, 0, 1050)], 1050)

if (moves.length !== 3) {
  throw new Error(`pan-responder-multitouch.smoke FAILED: expected 3 move callbacks, got ${moves.length}`)
}

// frame 1: both fingers +10 over 10ms -> dx=10, two active touches, vx=10/10=1.
approx(moves[0].dx, 10, 'f1 dx (both fingers +10)')
approx(moves[0].dy, 0, 'f1 dy')
approx(moves[0].vx, 1, 'f1 vx')
if (moves[0].numberActiveTouches !== 2) {
  throw new Error(`pan-responder-multitouch.smoke FAILED: f1 numberActiveTouches: expected 2, got ${moves[0].numberActiveTouches}`)
}

// frame 2: only A moved -> dx tracks the moved-touch centroid delta, NOT 135.
approx(moves[1].dx, 40, 'f2 dx (only A moved; must NOT be the 135 all-centroid value)')
approx(moves[1].dy, 0, 'f2 dy')
if (moves[1].numberActiveTouches !== 2) {
  throw new Error(`pan-responder-multitouch.smoke FAILED: f2 numberActiveTouches: expected 2, got ${moves[1].numberActiveTouches}`)
}

// frame 3: B lifted, only A active and moving -> dx=140 (NOT the 160 single-centroid
// value), one active touch, vx = (140-40)/(1040-1020) = 100/20 = 5.
approx(moves[2].dx, 140, 'f3 dx (after B lifts, only A contributes; must NOT be 160)')
approx(moves[2].dy, 0, 'f3 dy')
approx(moves[2].vx, 5, 'f3 vx')
if (moves[2].numberActiveTouches !== 1) {
  throw new Error(`pan-responder-multitouch.smoke FAILED: f3 numberActiveTouches: expected 1, got ${moves[2].numberActiveTouches}`)
}

console.log('pan-responder-multitouch.smoke OK')
