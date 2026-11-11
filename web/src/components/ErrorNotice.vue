<script setup lang="ts">
// Un errore in parole semplici: una frase su cosa non è riuscito, il messaggio tecnico dentro
// "Dettagli tecnici" (chiuso) e, per i download da Strava, "Riprova". Il messaggio arriva
// spesso con "❌" davanti: qui si mostra senza emoji, come testo.
import { computed } from 'vue';
import { VAlert, VBtn } from 'vuetify/components';
import { withoutEmoji } from '../core/emoji.ts';

const props = defineProps<{ summary: string; detail?: string | null; retry?: boolean; busy?: boolean }>();
const emit = defineEmits<{ retry: [] }>();

const technical = computed(() => (props.detail ? withoutEmoji(props.detail).trim() : ''));
</script>

<template>
  <VAlert type="error" variant="tonal" density="comfortable">
    <p>{{ summary }}</p>
    <details v-if="technical" class="mt-2">
      <summary class="text-body-2">Dettagli tecnici</summary>
      <p class="technical text-body-2 mt-1">{{ technical }}</p>
    </details>
    <VBtn
      v-if="retry"
      variant="outlined"
      color="error"
      class="action mt-3"
      min-height="44"
      :loading="busy"
      :disabled="busy"
      @click="emit('retry')"
    >
      Riprova
    </VBtn>
  </VAlert>
</template>

<style scoped>
summary {
  cursor: pointer;
}

.technical {
  overflow-wrap: anywhere;
}
</style>
