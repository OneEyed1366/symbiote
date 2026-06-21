// PanResponder — pure JS gesture recognition layered on the View responder event
// props. It reconciles a stream of touch events into one accumulative gesture and
// exposes a `panHandlers` object the caller spreads onto a View. There is no new
// native view and no core change: it only consumes the responder props shared
// already synthesizes (onStartShouldSetResponder / onResponderGrant /
// onResponderMove / onResponderRelease / onResponderTerminate / ...), exactly
// as RN's PanResponder consumes them.
//
// Ported from react-native/Libraries/Interaction/PanResponder.js. RN sources its
// touch geometry from a global ResponderTouchHistoryStore; symbiote's synthetic
// events instead carry the live touches on `event.nativeEvent.touches` (and the
// changed ones on `changedTouches`), so the centroid/velocity math here reads
// those directly while keeping RN's accumulate-deltas-over-time behavior.

import { dlog, type SymbioteEvent } from '@symbiote/shared'

// gestureState fields the caller reads; `stateID` is a stable per-gesture id and
// `_accountsForMovesUpTo` is the timestamp every field has been advanced through.
export interface PanResponderGestureState {
  stateID: number
  moveX: number
  moveY: number
  x0: number
  y0: number
  dx: number
  dy: number
  vx: number
  vy: number
  numberActiveTouches: number
  _accountsForMovesUpTo: number
}

// (event, gestureState) -> boolean — the should-set / termination-request gate.
type ActiveCallback = (event: SymbioteEvent, gestureState: PanResponderGestureState) => boolean
// (event, gestureState) -> void — grant / move / release / terminate side effects.
type PassiveCallback = (event: SymbioteEvent, gestureState: PanResponderGestureState) => void

export interface PanResponderCallbacks {
  onStartShouldSetPanResponder?: ActiveCallback
  onStartShouldSetPanResponderCapture?: ActiveCallback
  onMoveShouldSetPanResponder?: ActiveCallback
  onMoveShouldSetPanResponderCapture?: ActiveCallback
  onPanResponderGrant?: PassiveCallback
  onPanResponderStart?: PassiveCallback
  onPanResponderMove?: PassiveCallback
  onPanResponderEnd?: PassiveCallback
  onPanResponderRelease?: PassiveCallback
  onPanResponderReject?: PassiveCallback
  onPanResponderTerminate?: PassiveCallback
  onPanResponderTerminationRequest?: ActiveCallback
  onShouldBlockNativeResponder?: ActiveCallback
}

// The responder props PanResponder produces; spread onto a View as `panHandlers`.
export interface GestureResponderHandlers {
  onStartShouldSetResponder: (event: SymbioteEvent) => boolean
  onStartShouldSetResponderCapture: (event: SymbioteEvent) => boolean
  onMoveShouldSetResponder: (event: SymbioteEvent) => boolean
  onMoveShouldSetResponderCapture: (event: SymbioteEvent) => boolean
  onResponderGrant: (event: SymbioteEvent) => boolean
  onResponderReject: (event: SymbioteEvent) => void
  onResponderStart: (event: SymbioteEvent) => void
  onResponderMove: (event: SymbioteEvent) => void
  onResponderEnd: (event: SymbioteEvent) => void
  onResponderRelease: (event: SymbioteEvent) => void
  onResponderTerminate: (event: SymbioteEvent) => void
  onResponderTerminationRequest: (event: SymbioteEvent) => boolean
}

export interface PanResponderInstance {
  panHandlers: GestureResponderHandlers
  getInteractionHandle: () => number | null
}

// A single touch as it arrives inside the untyped nativeEvent record.
interface TouchPoint {
  pageX: number
  pageY: number
  timestamp: number
}

const SINGLE_TOUCH_COUNT = 1
// onShouldBlockNativeResponder defaults to true (RN: block native by default).
const DEFAULT_BLOCK_NATIVE_RESPONDER = true

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function toFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

// Pull one touch out of an untyped array element, skipping anything that does not
// carry numeric pageX/pageY. `timestamp` falls back to 0 when absent so a touch
// with coordinates but no time still contributes to the centroid.
function toTouchPoint(raw: unknown): TouchPoint | undefined {
  if (!isRecord(raw)) return undefined
  const pageX = toFiniteNumber(raw.pageX)
  const pageY = toFiniteNumber(raw.pageY)
  if (pageX === undefined || pageY === undefined) return undefined
  return { pageX, pageY, timestamp: toFiniteNumber(raw.timestamp) ?? 0 }
}

// All current touches on screen, read off event.nativeEvent.touches.
function readTouches(event: SymbioteEvent): TouchPoint[] {
  const raw = event.nativeEvent.touches
  if (!Array.isArray(raw)) return []
  const points: TouchPoint[] = []
  for (const entry of raw) {
    const point = toTouchPoint(entry)
    if (point !== undefined) points.push(point)
  }
  return points
}

// Mean of a coordinate across the active touches — the gesture centroid. RN's
// TouchHistoryMath does the same averaging over active touches.
function centroidX(touches: TouchPoint[]): number {
  if (touches.length === 0) return 0
  let sum = 0
  for (const touch of touches) sum += touch.pageX
  return sum / touches.length
}

function centroidY(touches: TouchPoint[]): number {
  if (touches.length === 0) return 0
  let sum = 0
  for (const touch of touches) sum += touch.pageY
  return sum / touches.length
}

// The most recent touch timestamp in the current frame — the clock PanResponder
// advances `_accountsForMovesUpTo` to and divides the velocity by.
function mostRecentTimestamp(touches: TouchPoint[]): number {
  let latest = 0
  for (const touch of touches) {
    if (touch.timestamp > latest) latest = touch.timestamp
  }
  return latest
}

function initializeGestureState(gestureState: PanResponderGestureState): void {
  gestureState.moveX = 0
  gestureState.moveY = 0
  gestureState.x0 = 0
  gestureState.y0 = 0
  gestureState.dx = 0
  gestureState.dy = 0
  gestureState.vx = 0
  gestureState.vy = 0
  gestureState.numberActiveTouches = 0
  gestureState._accountsForMovesUpTo = 0
}

// Advance the gesture for a move frame: move{X,Y} become the current centroid,
// d{x,y} accumulate the delta from the grant centroid, and v{x,y} are that
// frame's delta over the time elapsed since the last accounted frame. Guards
// dt === 0 so a frame with no time gap reports zero velocity instead of NaN.
function updateGestureStateOnMove(
  gestureState: PanResponderGestureState,
  touches: TouchPoint[],
): void {
  const currentX = centroidX(touches)
  const currentY = centroidY(touches)
  const frameTimestamp = mostRecentTimestamp(touches)

  gestureState.numberActiveTouches = touches.length
  gestureState.moveX = currentX
  gestureState.moveY = currentY

  const nextDx = currentX - gestureState.x0
  const nextDy = currentY - gestureState.y0
  const dt = frameTimestamp - gestureState._accountsForMovesUpTo

  if (dt > 0) {
    gestureState.vx = (nextDx - gestureState.dx) / dt
    gestureState.vy = (nextDy - gestureState.dy) / dt
  } else {
    gestureState.vx = 0
    gestureState.vy = 0
  }

  gestureState.dx = nextDx
  gestureState.dy = nextDy
  gestureState._accountsForMovesUpTo = frameTimestamp
}

const PanResponder = {
  create(config: PanResponderCallbacks): PanResponderInstance {
    const gestureState: PanResponderGestureState = {
      // Random per-gesture id, matching RN — useful only for debugging.
      stateID: Math.random(),
      moveX: 0,
      moveY: 0,
      x0: 0,
      y0: 0,
      dx: 0,
      dy: 0,
      vx: 0,
      vy: 0,
      numberActiveTouches: 0,
      _accountsForMovesUpTo: 0,
    }

    const panHandlers: GestureResponderHandlers = {
      onStartShouldSetResponder(event: SymbioteEvent): boolean {
        return config.onStartShouldSetPanResponder === undefined
          ? false
          : config.onStartShouldSetPanResponder(event, gestureState)
      },

      onMoveShouldSetResponder(event: SymbioteEvent): boolean {
        return config.onMoveShouldSetPanResponder === undefined
          ? false
          : config.onMoveShouldSetPanResponder(event, gestureState)
      },

      onStartShouldSetResponderCapture(event: SymbioteEvent): boolean {
        // A fresh single touch begins a new gesture, so reset the accumulator
        // before any should-set callback inspects it (RN does the same).
        const touches = readTouches(event)
        if (touches.length === SINGLE_TOUCH_COUNT) {
          initializeGestureState(gestureState)
        }
        gestureState.numberActiveTouches = touches.length
        return config.onStartShouldSetPanResponderCapture === undefined
          ? false
          : config.onStartShouldSetPanResponderCapture(event, gestureState)
      },

      onMoveShouldSetResponderCapture(event: SymbioteEvent): boolean {
        const touches = readTouches(event)
        // Skip a duplicate dispatch of the same frame: when two touches change at
        // once the responder system fires twice, but the geometry was already
        // folded in on the first call.
        if (gestureState._accountsForMovesUpTo === mostRecentTimestamp(touches)) {
          return false
        }
        updateGestureStateOnMove(gestureState, touches)
        return config.onMoveShouldSetPanResponderCapture === undefined
          ? false
          : config.onMoveShouldSetPanResponderCapture(event, gestureState)
      },

      onResponderGrant(event: SymbioteEvent): boolean {
        dlog('PanResponder grant')
        const touches = readTouches(event)
        gestureState.x0 = centroidX(touches)
        gestureState.y0 = centroidY(touches)
        gestureState.dx = 0
        gestureState.dy = 0
        // The grant frame is already accounted for, so the first move's velocity
        // is measured from here, not from time 0.
        gestureState._accountsForMovesUpTo = mostRecentTimestamp(touches)
        gestureState.numberActiveTouches = touches.length
        config.onPanResponderGrant?.(event, gestureState)
        return config.onShouldBlockNativeResponder === undefined
          ? DEFAULT_BLOCK_NATIVE_RESPONDER
          : config.onShouldBlockNativeResponder(event, gestureState)
      },

      onResponderReject(event: SymbioteEvent): void {
        config.onPanResponderReject?.(event, gestureState)
      },

      onResponderStart(event: SymbioteEvent): void {
        gestureState.numberActiveTouches = readTouches(event).length
        config.onPanResponderStart?.(event, gestureState)
      },

      onResponderMove(event: SymbioteEvent): void {
        const touches = readTouches(event)
        // Same duplicate-frame guard as the capture path.
        if (gestureState._accountsForMovesUpTo === mostRecentTimestamp(touches)) {
          return
        }
        updateGestureStateOnMove(gestureState, touches)
        config.onPanResponderMove?.(event, gestureState)
      },

      onResponderEnd(event: SymbioteEvent): void {
        gestureState.numberActiveTouches = readTouches(event).length
        config.onPanResponderEnd?.(event, gestureState)
      },

      onResponderRelease(event: SymbioteEvent): void {
        dlog('PanResponder release')
        config.onPanResponderRelease?.(event, gestureState)
        initializeGestureState(gestureState)
      },

      onResponderTerminate(event: SymbioteEvent): void {
        dlog('PanResponder terminate')
        config.onPanResponderTerminate?.(event, gestureState)
        initializeGestureState(gestureState)
      },

      onResponderTerminationRequest(event: SymbioteEvent): boolean {
        return config.onPanResponderTerminationRequest === undefined
          ? true
          : config.onPanResponderTerminationRequest(event, gestureState)
      },
    }

    return {
      panHandlers,
      // Deprecated in RN; kept for shape parity. No InteractionManager handle.
      getInteractionHandle(): number | null {
        return null
      },
    }
  },
}

export default PanResponder
