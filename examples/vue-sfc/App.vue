<!--
  The Vue canary, as a real SFC. Metro compiles this .vue through metro-vue-transformer.js
  (parse → compileScript+inlineTemplate → 'vue'→@vue/runtime-core), so authoring is ordinary
  Vue — <template> + <script setup> — while every vnode still recommits through
  @symbiote/engine into Fabric, React Native's renderer never in the path (M3 / R4).

  Mirrors the TOP slice of examples/react/App.tsx (the ориентир): a SafeAreaView → ScrollView
  (with a pull-to-refresh RefreshControl) wrapping the content — View · Text · Switch ·
  ActivityIndicator. Beyond static paint it exercises the same control flow React's canary does:
  CONDITIONAL render (v-if/v-else — spinner vs a muted label) and ITERATION (keyed v-for over a
  tap log + the empty-state branch). Same palette; the ONLY visual difference between the three
  examples is the badge line naming which one is rendering. RefreshControl is passed as an element
  prop (Vue's parity-equivalent of React's refreshControl={<RefreshControl/>}) via a computed h().
-->
<script setup lang="ts">
import { ref, computed, h, onMounted } from 'vue'
import { View, Text, Image, ActivityIndicator, Switch, ScrollView, RefreshControl, SafeAreaView, StyleSheet } from '@symbiote/vue'

type ILogEntry = { id: number; label: string }

const REFRESH_MS = 2000
const LOGO_URI = 'https://vuejs.org/images/logo.png'

const taps = ref(0)
const spinning = ref(true)
const log = ref<ILogEntry[]>([])
const refreshing = ref(false)
const refreshes = ref(0)
let nextId = 0

function onTap() {
  taps.value += 1
  // newest on top → unshift inserts BEFORE existing rows (keyed-insert path); cap at 5 pops
  // the oldest, so each tap exercises keyed insert + remove in the engine's reconciler.
  log.value.unshift({ id: nextId++, label: `tap #${taps.value}` })
  if (log.value.length > 5) log.value.pop()
}

function onRefresh() {
  refreshing.value = true
  setTimeout(() => {
    refreshing.value = false
    refreshes.value += 1
  }, REFRESH_MS)
}

// The RefreshControl as an element-valued prop — Vue templates can't inline an element into a
// prop, so build the VNode in script and bind it; recomputes when `refreshing` flips.
const refreshControl = computed(() => h(RefreshControl, { refreshing: refreshing.value, onRefresh, tintColor: '#7fb5ff' }))

// Image statics parity (examples/react/App.tsx): getSize resolves the rendered logo's real pixel
// dimensions through the ImageLoader native module — the same asset the <Image> below paints.
const imageSize = ref('measuring…')
onMounted(() => {
  Image.getSize(LOGO_URI)
    .then(({ width, height }) => { imageSize.value = `${width}×${height}px` })
    .catch(() => { imageSize.value = 'unavailable' })
})

// Static styles, grouped in one StyleSheet.create — same convention and palette as
// examples/react/App.tsx (logic above, styles last in <script setup>, template below).
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#0b1622' },
  scrollContent: { paddingVertical: 64, paddingHorizontal: 24, gap: 28, alignItems: 'stretch' },
  badge: { color: '#34d399', fontSize: 14, letterSpacing: 2, textAlign: 'center' },
  title: { color: '#7fb5ff', fontSize: 16, textAlign: 'center' },
  refreshNote: { color: '#41506a', fontSize: 13, textAlign: 'center' },
  counterCard: { paddingVertical: 18, borderRadius: 16, backgroundColor: '#2b6cb0', alignItems: 'center' },
  counterText: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  switchLabel: { color: '#cbd5e1', fontSize: 16 },
  paused: { color: '#41506a', fontSize: 14, textAlign: 'center' },
  logSection: { gap: 6 },
  sectionLabel: { color: '#41506a', fontSize: 13 },
  emptyHint: { color: '#41506a', fontSize: 13 },
  logRow: { color: '#cbd5e1', fontSize: 15 },
  imageSection: { gap: 6 },
  rowAlignCenter: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoThumb: { width: 48, height: 48, borderRadius: 8 },
  imageCaption: { color: '#cbd5e1', fontSize: 15 },
  webImage: { width: 48, height: 48, borderRadius: 8, alignSelf: 'center' },
})
</script>

<template>
  <SafeAreaView :style="styles.screen">
    <ScrollView :style="styles.screen" :content-container-style="styles.scrollContent" :refresh-control="refreshControl">
      <Text :style="styles.badge">▲ RENDERED FROM .VUE SFC</Text>
      <Text :style="styles.title">symbiote · all primitives</Text>
      <Text :style="styles.refreshNote">pull to refresh · refreshed {{ refreshes }}×</Text>

      <!-- View + press-to-increment (raw responder protocol) -->
      <View
        :style="styles.counterCard"
        @start-should-set-responder="() => true"
        @responder-release="onTap"
      >
        <Text :style="styles.counterText">tapped {{ taps }}×</Text>
      </View>

      <!-- Switch drives the ActivityIndicator (examples/react/App.tsx ориентир) -->
      <View :style="styles.switchRow">
        <Text :style="styles.switchLabel">spinner</Text>
        <Switch :value="spinning" @value-change="spinning = $event" :track-color="{ false: '#334155', true: '#2b6cb0' }" />
      </View>

      <!-- conditional render: spinner while on, a muted label while off -->
      <ActivityIndicator v-if="spinning" :animating="spinning" size="large" color="#7fb5ff" />
      <Text v-else :style="styles.paused">paused</Text>

      <!-- iteration + empty-state: keyed v-for over the tap log, newest first -->
      <View :style="styles.logSection">
        <Text :style="styles.sectionLabel">tap log · newest first</Text>
        <Text v-if="log.length === 0" :style="styles.emptyHint">tap the card to log</Text>
        <Text v-for="entry in log" :key="entry.id" :style="styles.logRow">{{ entry.label }}</Text>
      </View>

      <!-- Image: native source array (require/uri) + getSize statics; the web-alias src/alt fold -->
      <View :style="styles.imageSection">
        <Text :style="styles.sectionLabel">image · source + statics</Text>
        <View :style="styles.rowAlignCenter">
          <Image :source="{ uri: LOGO_URI }" :style="styles.logoThumb" />
          <Text :style="styles.imageCaption">logo size: {{ imageSize }}</Text>
        </View>
        <Image src="https://vuejs.org/images/logo.png" alt="Vue logo" :width="48" :height="48" :style="styles.webImage" />
      </View>
    </ScrollView>
  </SafeAreaView>
</template>
