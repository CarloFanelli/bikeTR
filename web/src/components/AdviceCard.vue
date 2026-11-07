<script setup lang="ts">
// Un consiglio del piano: titolo, dettaglio e motivo, con i numeri sotto. Il testo può
// contenere il nome di un'attività: si mostra com'è scritto.
import { VChip } from 'vuetify/components';
import type { DayAdvice } from '../core/training-view.ts';
import MetricGrid from './MetricGrid.vue';

defineProps<{ advice: DayAdvice; rows: [string, string][]; readiness: string | null }>();

const READINESS_COLORS: Record<string, string> = {
  pronto: '#4ade80', moderato: '#facc15', affaticato: '#fc5200', sovraccarico: '#ef4444',
};
</script>

<template>
  <div class="advice pa-4 mb-4">
    <div v-if="advice.label" class="text-caption text-uppercase text-medium-emphasis mb-1">{{ advice.label }}</div>
    <div class="text-subtitle-1 font-weight-bold mb-1">{{ advice.rec.title }}</div>
    <div class="my-2">{{ advice.rec.detail }}</div>
    <div class="text-medium-emphasis font-italic">{{ advice.rec.reason }}</div>
  </div>
  <MetricGrid :items="rows">
    <template #before="{ label }">
      <VChip
        v-if="label === 'Prontezza' && readiness"
        :color="READINESS_COLORS[readiness]"
        size="x-small"
        label
        class="mr-1"
      >
        {{ readiness }}
      </VChip>
    </template>
  </MetricGrid>
</template>

<style scoped>
.advice {
  background: #0f1115;
  border-left: 4px solid rgb(var(--v-theme-primary));
  border-radius: 8px;
}
</style>
