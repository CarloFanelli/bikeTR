<script setup lang="ts">
// Power profile: la potenza per durata rispetto ai riferimenti, i rapporti tra durate, i
// deficit con la loro cura, i punti di forza e il focus consigliato. Come leggerlo sta nella
// spiegazione del titolo.
import { mdiChartBox } from '@mdi/js';
import { VCard, VCardText } from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import type { powerProfileView } from '../core/analysis-view.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';
import MetricGrid from './MetricGrid.vue';

defineProps<{ view: ReturnType<typeof powerProfileView> | null }>();

// Nomi di colori del tema: ogni tema ha la sua tinta, leggibile sul fondo della card.
const BAR_COLORS: Record<string, string> = { strength: 'series-green', average: 'series-gold', deficit: 'series-orange' };
const SEVERITY_COLORS: Record<string, string> = { high: 'series-red', medium: 'series-orange', low: 'series-gold' };
const colorOf = useThemeColor();
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiChartBox" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.powerProfile" label="Profilo di potenza" /></CardHeading>
    <VCardText>
      <p v-if="!view" class="text-medium-emphasis">
        Servono dati di potenza e peso corporeo nelle impostazioni per l'analisi del power profile.
      </p>
      <template v-else>
        <div class="pp-grid my-3">
          <div v-for="bar in view.bars" :key="bar.label" class="pp-row">
            <span class="text-medium-emphasis">{{ bar.label }}</span>
            <span class="pp-bar">
              <span :style="{ width: `${bar.width}%`, background: bar.kind ? colorOf(BAR_COLORS[bar.kind]) : undefined }" />
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
            :style="{ borderLeftColor: colorOf(SEVERITY_COLORS[d.severity]) }"
          >
            <div><b>{{ d.label }}</b> <span class="text-medium-emphasis">({{ d.severity }})</span></div>
            <div class="my-1">{{ d.description }}</div>
            <div class="d-flex align-center ga-2 text-body-2"><LineIcon name="target" :size="18" />{{ d.prescription }}</div>
          </div>
        </div>
        <div
          v-for="label in view.strengths"
          :key="label"
          class="side-card d-flex align-center ga-2 text-body-2 my-2"
          :style="{ borderLeftColor: colorOf('series-green') }"
        >
          <LineIcon name="done" :size="18" /><b>{{ label }}</b>
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
  grid-template-columns: minmax(0, 9rem) minmax(3rem, 1fr) auto;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.88rem;
}

.pp-bar {
  height: 10px;
  overflow: hidden;
  border-radius: 5px;
  background: rgb(var(--v-theme-grid));
}

.pp-bar > span {
  display: block;
  height: 100%;
  border-radius: 5px;
}

.side-card {
  padding: 0.6rem 0.8rem;
  border-left: 3px solid;
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  background: rgb(var(--v-theme-subtle));
}

.focus {
  padding: 0.75rem 1rem;
  border-left: 4px solid rgb(var(--v-theme-info));
  border-radius: var(--radius-control);
  background: rgba(var(--v-theme-info), 0.1);
  font-size: 0.9rem;
}
</style>
