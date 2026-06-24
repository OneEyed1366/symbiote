// Event normalization. Fabric delivers raw touch primitives to a single global
// handler, with the instanceHandle (our SymbioteNode) as the target. There is no
// raw `press` event — a tap is synthesized from a touch sequence: the start and
// end targets are correlated so a press fires only when the touch ends on the
// node it started on (or a descendant). Bubbling events walk target -> root,
// invoking each ancestor's listener until one calls stopPropagation. Layout is a
// direct event in RN and is delivered only to its own target.

import { dlog } from './debug'
import { runWrapped } from './dispatch'
import { getSlot } from './fabric'
import { isSymbioteNode, type SymbioteEvent, type SymbioteNode } from './node'
import { registeredNativeEvent } from './registry'

// Raw Fabric event name -> listener name. Generic bubbling events live here; press
// is synthesized from a touch sequence and layout is direct, so both are handled
// outside this table.
// Raw Fabric event -> listener name, split by dispatch phase. Press is synthesized
// from a touch sequence (handled separately below); everything else is table-driven.
// Bubbling events walk target -> root; direct events fire only on the target.
const BUBBLING_EVENTS: Readonly<Record<string, string>> = {
  topFocus: 'focus',
  topBlur: 'blur',
  topChange: 'change',
  topEndEditing: 'endEditing',
  topSubmitEditing: 'submitEditing',
  topKeyPress: 'keyPress',
}
const DIRECT_EVENTS: Readonly<Record<string, string>> = {
  topLayout: 'layout',
  topScroll: 'scroll',
  topScrollBeginDrag: 'scrollBeginDrag',
  topScrollEndDrag: 'scrollEndDrag',
  topMomentumScrollBegin: 'momentumScrollBegin',
  topMomentumScrollEnd: 'momentumScrollEnd',
  topSelectionChange: 'selectionChange',
  topContentSizeChange: 'contentSizeChange',
  topLoadStart: 'loadStart',
  topLoad: 'load',
  topLoadEnd: 'loadEnd',
  topError: 'error',
  topProgress: 'progress',
  topPartialLoad: 'partialLoad',
  topRefresh: 'refresh',
  topShow: 'show',
  topRequestClose: 'requestClose',
  topDismiss: 'dismiss',
  topOrientationChange: 'orientationChange',
  // Text glyph layout (onTextLayout) and the iOS status-bar-tap scroll-to-top.
  topTextLayout: 'textLayout',
  topScrollToTop: 'scrollToTop',
  // Accessibility events from RN's base ViewConfig — any view can emit them.
  // accessibilityAction fires on iOS + Android; the iOS-only three (accessibilityTap,
  // magicTap, accessibilityEscape) have no Android producer, so they are inert there.
  topAccessibilityAction: 'accessibilityAction',
  topAccessibilityTap: 'accessibilityTap',
  topMagicTap: 'magicTap',
  topAccessibilityEscape: 'accessibilityEscape',
}

const TOUCH_START = 'topTouchStart'
const TOUCH_MOVE = 'topTouchMove'
const TOUCH_END = 'topTouchEnd'
const TOUCH_CANCEL = 'topTouchCancel'
const PRESS = 'press'

// Responder protocol (PanResponder / Touchable). RN's two-phase negotiation:
// every should-set is asked CAPTURE (root -> target) then BUBBLE (target -> root),
// and the first node returning true wins — on a touch START *and* on every MOVE,
// so a node can claim the responder mid-gesture. If someone already holds it, the
// incumbent is asked onResponderTerminationRequest; a true answer (or no listener)
// hands it over (terminate + grant), a false answer rejects the taker. Lifecycle
// events are direct (grant/start/move/end/release/terminate/reject). Listener names
// are post-`on` (onResponderMove -> 'responderMove').
const START_SHOULD_SET = 'startShouldSetResponder'
const START_SHOULD_SET_CAPTURE = 'startShouldSetResponderCapture'
const MOVE_SHOULD_SET = 'moveShouldSetResponder'
const MOVE_SHOULD_SET_CAPTURE = 'moveShouldSetResponderCapture'
const RESPONDER_GRANT = 'responderGrant'
const RESPONDER_REJECT = 'responderReject'
const RESPONDER_START = 'responderStart'
const RESPONDER_MOVE = 'responderMove'
const RESPONDER_END = 'responderEnd'
const RESPONDER_RELEASE = 'responderRelease'
const RESPONDER_TERMINATE = 'responderTerminate'
const RESPONDER_TERMINATION_REQUEST = 'responderTerminationRequest'
// Synthesized alongside press so Pressable can show pressed-state feedback: both
// fire on the node the touch STARTED on (the responder), pressOut on end/cancel.
const PRESS_IN = 'pressIn'
const PRESS_OUT = 'pressOut'

let installed = false

// Target of the in-flight touch, remembered at topTouchStart and consumed (or
// cleared) at topTouchEnd / topTouchCancel.
let pressStart: SymbioteNode | undefined

// The node that claimed the responder for the in-flight touch (PanResponder), or
// undefined when nobody claimed it. Receives move and release/terminate.
let currentResponder: SymbioteNode | undefined

// Invoke one node's own listener (no bubbling) and hand back its return value, so
// the responder negotiation can read the boolean from onStartShouldSetResponder.
function callOwnListener(
  node: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): unknown {
  const listener = node.listeners?.get(listenerName)
  if (!listener) return undefined
  return listener({
    type: listenerName,
    target: node,
    currentTarget: node,
    nativeEvent,
    stopPropagation: () => {},
  })
}

// The node chain from the touch target up to the root, target first. The single
// allocation the two-phase walk indexes both ways (capture reads it reversed).
function pathToRoot(target: SymbioteNode): SymbioteNode[] {
  const path: SymbioteNode[] = []
  for (let node: SymbioteNode | undefined = target; node; node = node.parent) path.push(node)
  return path
}

// RN's two-phase should-set walk: CAPTURE root -> target, then BUBBLE target -> root;
// the first node returning true wins. `skip` is excluded from both passes — on a
// MOVE the current responder is skipped so its should-set callback never consumes the
// gesture frame out from under its own onResponderMove (PanResponder folds geometry
// in the should-set-capture handler, so asking the responder again would zero its move).
function findWantsResponder(
  path: SymbioteNode[],
  captureName: string,
  bubbleName: string,
  nativeEvent: Record<string, unknown>,
  skip: SymbioteNode | undefined,
): SymbioteNode | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    if (path[i] !== skip && callOwnListener(path[i], captureName, nativeEvent) === true) {
      return path[i]
    }
  }
  for (const node of path) {
    if (node !== skip && callOwnListener(node, bubbleName, nativeEvent) === true) return node
  }
  return undefined
}

// Negotiate (or re-negotiate) the responder for a touch start/move. If nobody holds
// it, the winner is granted. If someone does, the incumbent is asked to relinquish
// via onResponderTerminationRequest (absent listener = implicit yes); on yes it is
// terminated and the taker granted, on no the taker is rejected.
function negotiateResponder(
  target: SymbioteNode,
  phase: 'start' | 'move',
  nativeEvent: Record<string, unknown>,
): void {
  const path = pathToRoot(target)
  const wants =
    phase === 'start'
      ? findWantsResponder(path, START_SHOULD_SET_CAPTURE, START_SHOULD_SET, nativeEvent, undefined)
      : findWantsResponder(path, MOVE_SHOULD_SET_CAPTURE, MOVE_SHOULD_SET, nativeEvent, currentResponder)
  if (!wants || wants === currentResponder) return

  if (currentResponder === undefined) {
    currentResponder = wants
    dlog(`responder granted to ${wants.component}`)
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent)
    return
  }

  const incumbent = currentResponder
  // A missing termination-request listener means implicit consent (RN default true);
  // only an explicit non-true answer keeps the incumbent and rejects the taker.
  const guarded = incumbent.listeners?.has(RESPONDER_TERMINATION_REQUEST) === true
  const allowed =
    !guarded || callOwnListener(incumbent, RESPONDER_TERMINATION_REQUEST, nativeEvent) === true
  if (allowed) {
    dlog(`responder transferred ${incumbent.component} -> ${wants.component}`)
    callOwnListener(incumbent, RESPONDER_TERMINATE, nativeEvent)
    currentResponder = wants
    callOwnListener(wants, RESPONDER_GRANT, nativeEvent)
  } else {
    dlog(`responder takeover of ${incumbent.component} rejected`)
    callOwnListener(wants, RESPONDER_REJECT, nativeEvent)
  }
}

export function installEventHandler(): void {
  if (installed) return
  installed = true

  getSlot().registerEventHandler((instanceHandle, topLevelType, nativeEvent) => {
    if (!isSymbioteNode(instanceHandle)) return

    if (topLevelType === TOUCH_START) {
      dlog(`event ${TOUCH_START}`)
      pressStart = instanceHandle
      runWrapped(() => {
        bubble(instanceHandle, PRESS_IN, nativeEvent)
        // Responder negotiation runs alongside press synthesis: a View can be both
        // a Pressable (press) and a PanResponder target (responder).
        negotiateResponder(instanceHandle, 'start', nativeEvent)
        // onResponderStart is a direct event to whoever now holds the responder.
        if (currentResponder) callOwnListener(currentResponder, RESPONDER_START, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_MOVE) {
      runWrapped(() => {
        // Re-negotiate first: a node can claim the responder mid-gesture via
        // onMoveShouldSetResponder (the responder itself is skipped, see negotiate).
        negotiateResponder(instanceHandle, 'move', nativeEvent)
        // The only consumer of a move is the responder; without one, RN drops it too.
        if (currentResponder) callOwnListener(currentResponder, RESPONDER_MOVE, nativeEvent)
      })
      return
    }

    if (topLevelType === TOUCH_END) {
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      currentResponder = undefined
      runWrapped(() => {
        if (start) {
          // press fires only on an honest tap (ended within the responder); pressOut
          // always fires on the responder so its pressed-state can release.
          if (endsWithin(instanceHandle, start)) {
            dlog('event press -> dispatch')
            bubble(start, PRESS, nativeEvent)
          }
          bubble(start, PRESS_OUT, nativeEvent)
        } else {
          dlog(`event ${TOUCH_END} ignored (no matching start)`)
        }
        // onResponderEnd precedes the final release (RN fires both on the end touch).
        if (responder) {
          callOwnListener(responder, RESPONDER_END, nativeEvent)
          callOwnListener(responder, RESPONDER_RELEASE, nativeEvent)
        }
      })
      return
    }

    if (topLevelType === TOUCH_CANCEL) {
      const start = pressStart
      pressStart = undefined
      const responder = currentResponder
      currentResponder = undefined
      runWrapped(() => {
        if (start) bubble(start, PRESS_OUT, nativeEvent)
        // A cancelled gesture ends then terminates (the responder was taken away).
        if (responder) {
          callOwnListener(responder, RESPONDER_END, nativeEvent)
          callOwnListener(responder, RESPONDER_TERMINATE, nativeEvent)
        }
      })
      return
    }

    const direct = DIRECT_EVENTS[topLevelType]
    if (direct !== undefined) {
      dlog(`event ${topLevelType} -> ${direct} (direct)`)
      runWrapped(() => deliverDirect(instanceHandle, direct, nativeEvent))
      return
    }

    const bubbling = BUBBLING_EVENTS[topLevelType]
    if (bubbling !== undefined) {
      dlog(`event ${topLevelType} -> ${bubbling} (bubble)`)
      runWrapped(() => bubble(instanceHandle, bubbling, nativeEvent))
      return
    }

    // Third-party Fabric views (registerComponent) declare their own events; the
    // built-in tables above don't know them, so fall back to the registry, keyed by
    // the node's own component. `direct` events fire only on their target, the rest
    // bubble — same split as the built-ins.
    const registered = registeredNativeEvent(instanceHandle.component, topLevelType)
    if (registered !== undefined) {
      const phase = registered.direct ? 'direct' : 'bubble'
      dlog(`event ${topLevelType} -> ${registered.listener} (${phase}, registered)`)
      runWrapped(() =>
        registered.direct
          ? deliverDirect(instanceHandle, registered.listener, nativeEvent)
          : bubble(instanceHandle, registered.listener, nativeEvent),
      )
      return
    }

    // Nothing claimed this event — neither a built-in table nor the view's derived
    // config. A permanent diagnostic seam: if a native view fires something we drop
    // on the floor (an event the ViewConfig didn't surface, or a name mismatch),
    // this is where it shows up. Keeps "the handler silently did nothing" debuggable.
    dlog(`event ${topLevelType} UNMATCHED on ${instanceHandle.component} (dropped)`)
  })
}

// A press is honest only if the touch ends on the node it started on, or a
// descendant of it: walk parent pointers up from the end target looking for the
// start target. The start node may have been unmounted mid-touch (parent pointer
// cleared) — the walk simply runs out and returns false, no throw.
function endsWithin(endTarget: SymbioteNode, start: SymbioteNode): boolean {
  let node: SymbioteNode | undefined = endTarget
  while (node) {
    if (node === start) return true
    node = node.parent
  }
  return false
}

// True bubbling: walk target -> root, invoking each ancestor's listener for this
// event name in order, until the chain ends or a listener stops propagation.
// `target` stays the original node; `currentTarget` tracks whose listener runs.
function bubble(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  let stopped = false
  let node: SymbioteNode | undefined = target
  while (node) {
    const listener = node.listeners?.get(listenerName)
    if (listener) {
      // engine owner adds currentTarget + stopPropagation to SymbioteEvent
      const event: SymbioteEvent = {
        type: listenerName,
        target,
        currentTarget: node,
        nativeEvent,
        stopPropagation: () => {
          stopped = true
        },
      }
      listener(event)
      if (stopped) return
    }
    node = node.parent
  }
}

// Direct (non-bubbling) delivery: only the target's own listener fires.
function deliverDirect(
  target: SymbioteNode,
  listenerName: string,
  nativeEvent: Record<string, unknown>,
): void {
  const listener = target.listeners?.get(listenerName)
  if (!listener) return
  // engine owner adds currentTarget + stopPropagation to SymbioteEvent
  listener({
    type: listenerName,
    target,
    currentTarget: target,
    nativeEvent,
    stopPropagation: () => {},
  })
}
