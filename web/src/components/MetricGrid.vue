<script setup lang="ts">
// Una griglia di valori: il nome piccolo sopra, il valore in grassetto sotto, e una nota
// facoltativa dopo il valore (es. "(dichiarata)"). Lo slot `before` aggiunge qualcosa
// prima di un valore (es. un'etichetta colorata), dato il suo nome.
defineProps<{ items: [label: string, value: string, note?: string][] }>();
defineSlots<{ before?: (props: { label: string }) => unknown }>();
</script>

<template>
  <div class="metric-grid">
    <div v-for="[label, value, note] in items" :key="label">
      <div class="text-caption text-medium-emphasis">{{ label }}</div>
      <div>
        <slot name="before" :label="label" /><b>{{ value }}</b><span v-if="note" class="text-caption text-medium-emphasis">{{ ' ' + note }}</span>
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
