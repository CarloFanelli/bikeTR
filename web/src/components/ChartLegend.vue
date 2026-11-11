<script setup lang="ts">
// La legenda sotto un grafico: per ogni serie un segno del suo colore e il nome.
// Con `line` il segno è un trattino invece di un quadratino; `pattern` ripete le righe o i
// puntini delle barre.
defineProps<{ items: { color: string; label: string; pattern?: 'stripes' | 'dots' | null }[]; line?: boolean }>();
</script>

<template>
  <div class="d-flex flex-wrap justify-center ga-4 mt-2 text-caption text-medium-emphasis">
    <span v-for="item in items" :key="item.label" class="d-flex align-center ga-1">
      <i :class="[line ? 'legend-line' : 'legend-dot', item.pattern && `pattern-${item.pattern}`]" :style="{ backgroundColor: item.color }" /> {{ item.label }}
    </span>
  </div>
</template>

<style scoped>
.legend-dot {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.legend-line {
  display: inline-block;
  width: 12px;
  height: 3px;
  border-radius: 2px;
}
</style>
