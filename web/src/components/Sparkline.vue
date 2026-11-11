<script setup lang="ts">
// La piccola linea dei tempi di un segmento, con la riga tratteggiata del PR: ferma, senza
// valori al passaggio del mouse: è troppo piccola per puntarla.
import { computed } from 'vue';
import type { Point } from '../core/segments.ts';
import { sparkline } from '../core/segments-view.ts';

const props = defineProps<{ points: Point[]; best: number }>();
const W = 120;
const H = 40;
const line = computed(() => sparkline(props.points, props.best, W, H));
</script>

<template>
  <svg v-if="line" :viewBox="`0 0 ${W} ${H}`" class="sparkline">
    <line x1="0" :y1="line.bestY" :x2="W" :y2="line.bestY" stroke="#ffd700" stroke-dasharray="2 2" stroke-width="1" opacity=".6" />
    <path :d="line.path" fill="none" stroke="#fc5200" stroke-width="2" stroke-linejoin="round" />
    <circle v-for="(dot, i) in line.dots" :key="i" :cx="dot.x" :cy="dot.y" r="2" fill="#fc5200" />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  width: 120px;
  height: 40px;
  border-radius: 4px;
  background: rgb(var(--v-theme-subtle));
}
</style>
