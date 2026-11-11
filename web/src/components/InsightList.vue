<script setup lang="ts">
// Le osservazioni sotto un grafico (forma, FTP): un'icona e una frase per riga. L'emoji
// calcolato diventa un'icona a linea, o niente se non ne ha una.
import { emojiIcon, withoutEmoji } from '../core/emoji.ts';
import LineIcon from './LineIcon.vue';

defineProps<{ items: { icon: string; text: string }[]; title?: string }>();
</script>

<template>
  <div class="insights pa-3 mt-3">
    <div v-if="title" class="font-weight-bold text-body-2 mb-2">{{ title }}</div>
    <div v-for="item in items" :key="item.text" class="insight text-body-2">
      <LineIcon v-if="emojiIcon(item.icon)" :name="emojiIcon(item.icon)!" :size="18" />
      <span v-else />
      <span>{{ withoutEmoji(item.text) }}</span>
    </div>
  </div>
</template>

<style scoped>
.insights {
  border-left: 3px solid rgb(var(--v-theme-primary));
  border-radius: var(--radius-control);
  background: rgb(var(--v-theme-subtle));
}

.insight {
  display: grid;
  grid-template-columns: 24px 1fr;
  gap: 0.5rem;
  padding: 0.25rem 0;
  line-height: 1.4;
}
</style>
