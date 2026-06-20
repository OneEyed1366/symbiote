// Teach JSX about the host primitives. This is a non-DOM renderer, so we declare
// our own intrinsic elements. They are namespaced (`symbiote-*`) to avoid
// colliding with react-dom's `view` / `text` (SVG) intrinsics.
import type { ViewProps, TextProps } from './components'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'symbiote-view': ViewProps
      'symbiote-text': TextProps
    }
  }
}
