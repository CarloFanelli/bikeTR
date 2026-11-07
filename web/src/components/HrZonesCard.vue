<script setup lang="ts">
// Minuti per zona di FC nelle ultime 4 settimane, una barra per zona con i suoi colori, e
// il giudizio sulla polarizzazione con la spiegazione del calcolo.
import { computed } from 'vue';
import {
  VCard, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import type { hrZonesView } from '../core/analysis-view.ts';
import LineChart from './LineChart.vue';

const props = defineProps<{ view: ReturnType<typeof hrZonesView> }>();

const rows = computed(() => props.view.rows ?? []);
const data = computed(() => ({
  labels: rows.value.map(r => r.label),
  datasets: [{
    type: 'bar' as const, data: rows.value.map(r => r.minutes), backgroundColor: rows.value.map(r => r.color), borderRadius: 4,
  }],
}));
const tooltip = { label: (_: number, i: number) => rows.value[i].text };
</script>

<template>
  <VCard>
    <VCardTitle>❤️ Distribuzione zone FC (ultime 4 settimane)</VCardTitle>
    <VCardText>
      <p v-if="view.message" class="text-medium-emphasis">{{ view.message }}</p>
      <template v-else>
        <LineChart :data="data" :tooltip="tooltip" :height="180" />
        <div class="zones mt-3">
          <div v-for="row in rows" :key="row.label" class="zone" :style="{ borderLeftColor: row.color }">
            <span>{{ row.label }}</span><span class="text-medium-emphasis">{{ row.text }}</span>
          </div>
        </div>
        <p class="text-body-2 text-medium-emphasis mt-3">
          {{ view.note }}<br>Ideale: ~80% easy / ~20% hard (polarized training).
        </p>
        <VExpansionPanels class="mt-3">
          <VExpansionPanel>
            <VExpansionPanelTitle>Come viene calcolata la polarizzazione?</VExpansionPanelTitle>
            <VExpansionPanelText class="text-body-2 explain">
              <p>Per ogni attività delle ultime 4 settimane:</p>
              <ol>
                <li>
                  Minuti effettivi = <code>moving_time × peso_tipo</code> (bici/corsa = 1×, forza = 0.5×, camminata = 0.2×,
                  ecc.)
                </li>
                <li>
                  Se c'è la FC: guardo la media dell'attività.
                  <ul>
                    <li><b>easyMin</b> += minuti se <code>FC_media &lt; 88% LTHR</code> (sotto soglia)</li>
                    <li><b>hardMin</b> += minuti se <code>FC_media ≥ 88% LTHR</code> (soglia o sopra)</li>
                  </ul>
                </li>
                <li>Senza FC: conto come easy (fallback prudente)</li>
              </ol>
              <p>Alla fine: <code>easyPct = easyMin / (easyMin + hardMin)</code>. Stessa cosa per hard.</p>
              <p>
                <b>Limitazione onesta</b>: uso la FC media dell'intera attività, non i minuti effettivi per zona. Un'uscita
                con 20' di soglia + 60' di recupero ha media Z2 ma nella realtà ha ~20' hard + 60' easy. Per precisione al
                minuto servirebbero i "streams" di Strava (costosi in API). L'approssimazione funziona bene se gli
                allenamenti sono abbastanza omogenei.
              </p>
              <p>
                <b>Target polarized</b>: ≥75% easy è buono, 80-85% è ideale. Sopra 85% rischio di troppo volume senza
                stimolo. Sotto 70% = troppa intensità, plateau probabile.
              </p>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.zones {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 0.4rem 1rem;
}

.zone {
  display: flex;
  justify-content: space-between;
  padding-left: 0.5rem;
  border-left: 4px solid;
  font-size: 0.9rem;
}

.explain p,
.explain ol {
  margin: 0.4rem 0;
}

.explain ol,
.explain ul {
  padding-left: 1.2rem;
}
</style>
