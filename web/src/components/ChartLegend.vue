<script setup lang="ts">
// La legenda sotto un grafico: per ogni serie un segno del suo colore e il nome.
// Con `line` il segno è un trattino invece di un quadratino.
defineProps<{ items: { color: string; label: string }[]; line?: boolean }>();
</script>

<template>
  <div class="d-flex flex-wrap justify-center ga-4 mt-2 text-caption text-medium-emphasis">
    <span v-for="item in items" :key="item.label" class="d-flex align-center ga-1">
      <i :class="line ? 'legend-line' : 'legend-dot'" :style="{ background: item.color }" /> {{ item.label }}
    </span>
  </div>
</template>

<style scoped>
.legend-dot {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend-line {
  display: inline-block;
  width: 12px;
  height: 3px;
  border-radius: 2px;
}
</style>
