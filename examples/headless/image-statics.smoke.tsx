// Headless proof of Image's static methods. RN's iOS Image statics delegate to
// the `ImageLoader` native module (NativeImageLoaderIOS.js). The spec's getSize
// resolves a `[width, height]` ARRAY, so the fake returns that; the static must
// normalize it to `{width, height}` AND fire the optional success callback with
// (width, height). prefetch resolves a boolean. resolveAssetSource is pure JS:
// it runs the installed source resolver, so a plain source object round-trips.

import { Image, setImageSourceResolver } from '@symbiote/react'

// Fake the native module under the bridgeless key (globalThis.nativeModuleProxy),
// keyed by the iOS module name `ImageLoader` — same shape as other headless smokes.
const fakeImageLoader = {
  getSize: (_uri: string) => Promise.resolve([120, 80]),
  getSizeWithHeaders: (_uri: string, _headers: Record<string, string>) =>
    Promise.resolve({ width: 200, height: 150 }),
  prefetchImage: (_uri: string) => Promise.resolve(true),
  queryCache: (_uris: string[]) => Promise.resolve({ 'x://a.png': 'disk/memory' }),
}
Object.assign(globalThis, {
  nativeModuleProxy: { ImageLoader: fakeImageLoader },
})

async function main(): Promise<void> {
  // ---- getSize: array result -> {width, height}, success callback fires -------
  let callbackArgs: [number, number] | undefined
  const size = await Image.getSize('x://a.png', (width, height) => {
    callbackArgs = [width, height]
  })
  if (size.width !== 120 || size.height !== 80) {
    throw new Error(`getSize should yield {width:120, height:80}, got ${JSON.stringify(size)}`)
  }
  // The success callback fires after the promise settles; give it a microtask.
  await Promise.resolve()
  if (callbackArgs === undefined || callbackArgs[0] !== 120 || callbackArgs[1] !== 80) {
    throw new Error(`success callback should fire with (120, 80), got ${JSON.stringify(callbackArgs)}`)
  }

  // ---- getSizeWithHeaders: object result -> {width, height} ------------------
  const sizeH = await Image.getSizeWithHeaders('x://a.png', { Authorization: 'Bearer t' })
  if (sizeH.width !== 200 || sizeH.height !== 150) {
    throw new Error(`getSizeWithHeaders should yield {200,150}, got ${JSON.stringify(sizeH)}`)
  }

  // ---- prefetch: boolean ------------------------------------------------------
  const prefetched = await Image.prefetch('x://a.png')
  if (prefetched !== true) {
    throw new Error(`prefetch should resolve true, got ${String(prefetched)}`)
  }

  // ---- queryCache: only known statuses survive the guard ----------------------
  const cache = await Image.queryCache(['x://a.png'])
  if (cache['x://a.png'] !== 'disk/memory') {
    throw new Error(`queryCache should map to 'disk/memory', got ${JSON.stringify(cache)}`)
  }

  // ---- resolveAssetSource: runs the installed resolver (pure JS) --------------
  // Default resolver is identity, so a plain source object round-trips. Then swap
  // in a real resolver and prove Image.resolveAssetSource uses the same machinery.
  const plain = { uri: 'x://a.png', scale: 2 }
  if (Image.resolveAssetSource(plain) !== plain) {
    throw new Error('resolveAssetSource (identity) should return the source unchanged')
  }
  setImageSourceResolver(() => ({ uri: 'resolved://b.png', scale: 3 }))
  const resolved = Image.resolveAssetSource(42)
  if (typeof resolved !== 'object' || resolved === null || Reflect.get(resolved, 'uri') !== 'resolved://b.png') {
    throw new Error(`resolveAssetSource should run the installed resolver, got ${JSON.stringify(resolved)}`)
  }

  console.log('image-statics.smoke OK')
}

main().catch((error: unknown) => {
  console.error(error)
  process.exit(1)
})
