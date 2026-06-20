// Fabric reactTags are caller-allocated: even numbers (odd-mod-10 is reserved
// for root tags). The canary commit rebuilds the tree each commit and allocates
// fresh tags every time, so this counter only ever moves forward.
let next = 2

export function nextTag(): number {
  const tag = next
  next += 2
  return tag
}
