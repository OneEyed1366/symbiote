// StatusBar on Android — first cut: a no-op. Android's status-bar native module is a
// DIFFERENT shape from iOS (single-arg `setStyle`/`setHidden` plus `setColor`/
// `setTranslucent`), and — the load-bearing reason this is a no-op — driving the Android
// status-bar window flags from our bridgeless Fabric surface BLANKS it: the
// setHidden/setStyle calls mutate the Activity window (insets / appearance), whose relayout
// detaches the mounted surface with no JS commit to restore it (observed: full UI paints,
// then the surface goes white ~1s after mount when StatusBar's effect fires). Until Android
// StatusBar is routed to the correct native module AND made to survive a window relayout,
// it renders null and touches no native module — strictly better than blanking the app.
// Tracked under native_module_name_is_platform_specific (.docs/native-module-platform-routing).
// Metro picks this on an Android host; iOS keeps the working StatusBarManager path.

import { dlog } from '@symbiote/shared'
import type { StatusBarComponent } from './status-bar-shared'
export type { StatusBarProps, StatusBarStyle } from './status-bar-shared'

const StatusBarAndroid: StatusBarComponent = () => null

StatusBarAndroid.setBarStyle = () => {
  dlog('StatusBar.setBarStyle (android no-op)')
}
StatusBarAndroid.setHidden = () => {
  dlog('StatusBar.setHidden (android no-op)')
}
StatusBarAndroid.setNetworkActivityIndicatorVisible = () => {
  dlog('StatusBar.setNetworkActivityIndicatorVisible (android no-op)')
}

export const StatusBar = StatusBarAndroid
