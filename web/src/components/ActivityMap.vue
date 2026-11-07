<script setup lang="ts">
// Mappa del percorso con le tessere di OpenStreetMap. Se le tessere non arrivano
// resta il riquadro vuoto: il resto del dettaglio non ne dipende.
import 'leaflet/dist/leaflet.css';
import { map as createMap, type Map as LeafletMap, polyline, tileLayer } from 'leaflet';
import { onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import type { LatLng } from '../core/polyline.ts';

const props = defineProps<{ points: LatLng[] }>();
const container = useTemplateRef<HTMLDivElement>('container');
let leaflet: LeafletMap | null = null;

onMounted(() => {
  if (!container.value) return;
  leaflet = createMap(container.value).setView(props.points[0], 13);
  tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(leaflet);
  const route = polyline(props.points, { color: '#fc5200', weight: 4 }).addTo(leaflet);
  leaflet.fitBounds(route.getBounds(), { padding: [20, 20] });
});

onBeforeUnmount(() => leaflet?.remove());
</script>

<template>
  <div ref="container" class="activity-map" />
</template>

<style scoped>
.activity-map {
  height: 360px;
  border-radius: 8px;
  background: #0f1115;
}
</style>
