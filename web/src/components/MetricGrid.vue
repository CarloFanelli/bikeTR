<script setup lang="ts">
// Una griglia di valori: il nome piccolo sopra, il valore in grassetto sotto, e una nota
// facoltativa dopo il valore (es. "(dichiarata)").
defineProps<{ items: [label: string, value: string, note?: string][] }>();
</script>

<template>
  <div class="metric-grid">
    <div v-for="[label, value, note] in items" :key="label">
      <div class="text-caption text-medium-emphasis">{{ label }}</div>
      <div>
        <b>{{ value }}</b><span v-if="note" class="text-caption text-medium-emphasis">{{ ' ' + note }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.metric-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 0.75rem 1rem;
}
</style>
