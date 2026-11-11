<script setup lang="ts">
// Mappa del percorso con le tessere di OpenStreetMap. Se le tessere non arrivano
// resta il riquadro vuoto con la linea del percorso: il resto non ne dipende.
// `still`: la mappa di una card di Attività non si trascina né si ingrandisce, e un clic
// passa alla card, che apre il dettaglio; nel dettaglio la mappa si muove.
import 'leaflet/dist/leaflet.css';
import { map as createMap, type Map as LeafletMap, polyline, tileLayer } from 'leaflet';
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import type { LatLng } from '../core/polyline.ts';

const props = withDefaults(defineProps<{ points: LatLng[]; height?: number; still?: boolean }>(), { height: 360 });
const container = useTemplateRef<HTMLDivElement>('container');
let leaflet: LeafletMap | null = null;

onMounted(() => {
  if (!container.value) return;
  const fixed = props.still
    ? { dragging: false, touchZoom: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, zoomControl: false }
    : {};
  leaflet = createMap(container.value, fixed).setView(props.points[0], 13);
  tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(leaflet);
  const route = polyline(props.points, { color: '#fc5200', weight: 4, interactive: !props.still }).addTo(leaflet);
  leaflet.fitBounds(route.getBounds(), { padding: [20, 20] });
});

onBeforeUnmount(() => leaflet?.remove());
</script>

<template>
  <div ref="container" :class="['activity-map', { still }]" :style="{ height: `${height}px` }" />
</template>

<style scoped>
.activity-map {
  border-radius: var(--radius-panel);
  background: rgb(var(--v-theme-subtle));
}

/* Dentro una card: gli angoli li taglia la card, i clic arrivano al link della card. */
.activity-map.still {
  border-radius: 0;
  pointer-events: none;
}
</style>
