// Headless smoke for the @symbiote/components seam: el()/txt() build a Descriptor,
// descriptorToReact maps it to React elements, and renderActivityIndicator emits the
// expected Descriptor (size enum + color omission). No native, no engine commit — this
// isolates the new render-fn → Descriptor → element bridge that all components ride on.

import { el, txt, renderActivityIndicator } from '../../core/components/src/index'
import { descriptorToReact } from '../../adapters/react/src/descriptor-to-react'

function deepEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg)
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null
}

// React 19 types element.props as `unknown`; narrow a created element to its inspectable
// shape with a guard rather than a cast.
type IReactish = { type: unknown; key: unknown; props: Record<string, unknown> }
function inspect(node: unknown): IReactish {
  if (!isRecord(node) || !isRecord(node.props)) throw new Error('not a react element')
  return { type: node.type, key: node.key, props: node.props }
}

// --- el()/txt() shape ---
const tree = el('symbiote-view', { style: { flex: 1 } }, [txt({}, ['hi']), el('symbiote-image', { source: 'x' })], 'k')
assert(tree.type === 'symbiote-view', `el type: ${tree.type}`)
assert(tree.key === 'k', `el key: ${String(tree.key)}`)
assert(tree.children.length === 2, `el children: ${tree.children.length}`)
const textChild = tree.children[0]
assert(typeof textChild !== 'string' && textChild.type === 'symbiote-text', 'txt() should make a symbiote-text element')

// --- descriptorToReact ---
const reactEl = inspect(descriptorToReact(tree))
assert(reactEl.type === 'symbiote-view', `bridge type: ${String(reactEl.type)}`)
assert(reactEl.key === 'k', `bridge key: ${String(reactEl.key)}`)
assert(deepEqual(reactEl.props.style, { flex: 1 }), `bridge style: ${JSON.stringify(reactEl.props.style)}`)
const kids = reactEl.props.children
assert(Array.isArray(kids) && kids.length === 2, 'bridge should map both children')
const textKid = inspect(kids[0])
const imageKid = inspect(kids[1])
assert(textKid.type === 'symbiote-text' && imageKid.type === 'symbiote-image', 'bridge child types')
// the raw string 'hi' passes through as a child of the text element
assert(textKid.props.children === 'hi', `string child passthrough: ${JSON.stringify(textKid.props.children)}`)

// --- renderActivityIndicator: named size → enum, iOS default color present ---
const ios = renderActivityIndicator(
  { animating: true, hidesWhenStopped: true, size: 'large', passthrough: { testID: 't' } },
  { defaultColor: '#999999', nativeExtras: {} },
)
assert(ios.type === 'symbiote-view', 'AI wrapper is a view')
assert(ios.props.testID === 't', 'AI passthrough lands on wrapper')
const spinner = ios.children[0]
assert(typeof spinner !== 'string' && spinner.type === 'symbiote-activity-indicator', 'AI child is the spinner')
if (typeof spinner !== 'string') {
  assert(spinner.props.size === 'large', `AI size enum: ${String(spinner.props.size)}`)
  assert(spinner.props.color === '#999999', `AI color: ${String(spinner.props.color)}`)
  assert(deepEqual(spinner.props.style, { width: 36, height: 36 }), `AI size style: ${JSON.stringify(spinner.props.style)}`)
}

// --- renderActivityIndicator: null platform color is omitted, not sent as null ---
const android = renderActivityIndicator(
  { animating: true, hidesWhenStopped: true, size: 'small', passthrough: {} },
  { defaultColor: null, nativeExtras: { styleAttr: 'Normal', indeterminate: true } },
)
const androidSpinner = android.children[0]
if (typeof androidSpinner !== 'string') {
  assert(!('color' in androidSpinner.props), 'null platform color must be omitted from native props')
  assert(androidSpinner.props.indeterminate === true, 'android nativeExtras forwarded')
}

console.log('descriptor-bridge.smoke OK')
