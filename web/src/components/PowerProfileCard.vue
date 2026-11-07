<script setup lang="ts">
// Power profile: la potenza per durata rispetto ai riferimenti, i rapporti tra durate, i
// deficit con la loro cura, i punti di forza e il focus consigliato.
import { VCard, VCardSubtitle, VCardText, VCardTitle } from 'vuetify/components';
import type { powerProfileView } from '../core/analysis-view.ts';
import MetricGrid from './MetricGrid.vue';

defineProps<{ view: ReturnType<typeof powerProfileView> | null }>();

const BAR_COLORS: Record<string, string> = { strength: '#4ade80', average: '#facc15', deficit: '#fc5200' };
const SEVERITY_COLORS: Record<string, string> = { high: '#ef4444', medium: '#fc5200', low: '#facc15' };
</script>

<template>
  <VCard>
    <VCardTitle>🎯 Power Profile — Deficit e punti di forza</VCardTitle>
    <VCardSubtitle>Confronto della tua curva di potenza con i rapporti ideali per identificare dove migliorare.</VCardSubtitle>
    <VCardText>
      <p v-if="!view" class="text-medium-emphasis">
        Servono dati di potenza e peso corporeo nelle impostazioni per l'analisi del power profile.
      </p>
      <template v-else>
        <div class="pp-grid my-3">
          <div v-for="bar in view.bars" :key="bar.label" class="pp-row">
            <span class="text-medium-emphasis">{{ bar.label }}</span>
            <span class="pp-bar">
              <span :style="{ width: `${bar.width}%`, background: bar.kind ? BAR_COLORS[bar.kind] : undefined }" />
            </span>
            <span v-if="bar.value"><b>{{ bar.value.watts }}</b>{{ bar.value.wkg }}</span>
            <span v-else class="text-medium-emphasis">—</span>
          </div>
        </div>
        <MetricGrid v-if="view.ratios.length" :items="view.ratios" class="my-3" />
        <div v-if="view.deficits.length" class="mt-4">
          <div class="text-medium-emphasis mb-2">Deficit identificati:</div>
          <div
            v-for="d in view.deficits"
            :key="d.label"
            class="side-card my-2"
            :style="{ borderLeftColor: SEVERITY_COLORS[d.severity] }"
          >
            <div><b>{{ d.label }}</b> <span class="text-medium-emphasis">({{ d.severity }})</span></div>
            <div class="my-1">{{ d.description }}</div>
            <div class="text-body-2">💊 {{ d.prescription }}</div>
          </div>
        </div>
        <div v-for="label in view.strengths" :key="label" class="side-card text-body-2 my-2" style="border-left-color: #4ade80">
          ✅ <b>{{ label }}</b>
        </div>
        <div v-if="view.focus" class="focus mt-3"><b>Focus consigliato:</b> {{ view.focus }}</div>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.pp-grid {
  display: grid;
  gap: 0.5rem;
}

.pp-row {
  display: grid;
  grid-template-columns: 160px 1fr 140px;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.88rem;
}

.pp-bar {
  height: 10px;
  overflow: hidden;
  border-radius: 5px;
  background: #2a2e38;
}

.pp-bar > span {
  display: block;
  height: 100%;
  border-radius: 5px;
}

.side-card {
  padding: 0.6rem 0.8rem;
  border-left: 3px solid;
  border-radius: 0 6px 6px 0;
  background: #14171d;
}

.focus {
  padding: 0.75rem 1rem;
  border-left: 4px solid #3b82f6;
  border-radius: 8px;
  background: color-mix(in srgb, #3b82f6 15%, transparent);
  font-size: 0.9rem;
}
</style>
