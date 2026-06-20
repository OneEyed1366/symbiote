// Mount a React element tree onto a Fabric surface. The native host hands us a
// rootTag (via AppRegistry.registerRunnable); we create a surface for it and let
// the reconciler drive shared, which commits into nativeFabricUIManager.

import type { ReactNode } from 'react'
import {
  createSurface,
  setEventDispatcher,
  type RootTag,
  type SymbioteSurface,
} from '@symbiote/shared'
import reconciler, { withDiscretePriority } from './host-config'
import { LegacyRoot } from './reconciler-constants'

const noop = (): void => {}

// A native event runs the listener (which may call setState) outside React's
// loop. Run it at discrete priority so the update takes the sync lane, then
// flush that work synchronously to paint the result.
setEventDispatcher((run) => {
  withDiscretePriority(run)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()
})

export function mount(rootTag: RootTag, element: ReactNode): SymbioteSurface {
  const surface = createSurface(rootTag)

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

  // react-reconciler 0.33 exposes updateContainerSync + flushSyncWork for an
  // immediate render/commit; @types 0.32 still lists the older updateContainer /
  // flushSync names, so these calls are type-suppressed until the types catch up.
  // @ts-expect-error updateContainerSync exists at runtime in react-reconciler 0.33
  reconciler.updateContainerSync(element, container, null, noop)
  // @ts-expect-error flushSyncWork exists at runtime in react-reconciler 0.33
  reconciler.flushSyncWork()

  return surface
}
