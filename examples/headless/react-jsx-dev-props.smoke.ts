// Regression: RN's babel preset, in dev (dev=true), runs transform-react-jsx-self /
// transform-react-jsx-source, which annotate every JSX element with __self (the component
// instance) and __source ({ fileName, lineNumber, columnNumber }). A JSX-based adapter
// (Vue JSX, Solid JSX) carries them onto the vnode as ordinary props; routeProp must drop
// them so they never reach Fabric. Before the fix, __self reached Android's folly::dynamic
// as a function-bearing prop → "JS Functions are not convertible to dynamic" → black screen
// (iOS dropped it silently; SFC/template authoring never produces them). This asserts both
// are stripped while real props and event handlers still route normally.

import { createElement, routeProp } from '../../core/engine/src/index'

let failures = 0
function check(label: string, ok: boolean): void {
  if (!ok) failures += 1
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`)
}

const node = createElement('RCTView')

// The exact shape the dev react-jsx-self / -source plugins inject.
routeProp(node, '__source', { fileName: 'App.tsx', lineNumber: 66, columnNumber: 7 })
routeProp(node, '__self', { someInstanceMethod: () => undefined }) // __self carries functions

check('__source never reaches props', !('__source' in node.props))
check('__self never reaches props (would crash Android Fabric)', !('__self' in node.props))

// Real props and events must still route exactly as before.
const onRelease = (): void => {}
routeProp(node, 'style', { flex: 1 })
routeProp(node, 'onResponderRelease', onRelease)

check('a real prop still reaches props', node.props.style !== undefined)
check('a responder handler still becomes a listener, not a prop', !('onResponderRelease' in node.props))
check('the responder listener is registered under its event name', node.listeners?.has('responderRelease') === true)

console.log(failures === 0 ? '\nreact-jsx-dev-props.smoke OK' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
