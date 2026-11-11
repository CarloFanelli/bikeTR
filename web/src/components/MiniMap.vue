<script setup lang="ts">
// La mini mappa di una riga di Attività: solo la linea del percorso, senza tessere della mappa,
// quindi subito visibile e senza rete. Senza GPS, o con un percorso illeggibile, l'icona dello sport.
import { computed } from 'vue';
import type { IconName } from '../core/emoji.ts';
import type { LatLng } from '../core/polyline.ts';
import { routePath } from '../core/route-path.ts';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ points: LatLng[] | null; icon: IconName }>();

const WIDTH = 64;
const HEIGHT = 48;

const path = computed(() => (props.points ? routePath(props.points, WIDTH, HEIGHT, 4) : null));
</script>

<template>
  <svg v-if="path" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" :width="WIDTH" :height="HEIGHT" class="mini-map" aria-hidden="true">
    <path :d="path" />
  </svg>
  <div v-else class="mini-map d-flex align-center justify-center" aria-hidden="true">
    <LineIcon :name="icon" :size="22" />
  </div>
</template>

<style scoped>
.mini-map {
  flex: none;
  width: 64px;
  height: 48px;
  border-radius: var(--radius-control);
  background: rgb(var(--v-theme-subtle));
}

/* Il colore del percorso è quello della mappa del dettaglio: fisso nei due temi. */
path {
  fill: none;
  stroke: #fc5200;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}
</style>
