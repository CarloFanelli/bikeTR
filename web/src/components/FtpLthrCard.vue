<script setup lang="ts">
// FTP e LTHR usate in tutta l'app, e le tabelle dei metodi che le stimano: quale uscita,
// quale formula, chi vince. Le tabelle sono aperte quando il valore è stimato; il metodo sta
// nella spiegazione del titolo.
import { mdiCalculatorVariantOutline } from '@mdi/js';
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  VCard, VCardText, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle, VTable,
} from 'vuetify/components';
import type { ftpLthrView } from '../core/analysis-view.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ view: ReturnType<typeof ftpLthrView> }>();

const ftpOpen = ref(props.view.ftp.table?.open ? [0] : []);
const lthrOpen = ref(props.view.lthr.table?.open ? [0] : []);
const detail = (id: number) => ({ name: 'attivita-dettaglio', params: { id } });
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiCalculatorVariantOutline" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.ftpLthr" /></CardHeading>
    <VCardText>
      <h3 class="value-line text-subtitle-1 font-weight-bold">
        <LineIcon name="power" :size="18" /> FTP attuale: <span class="accent">{{ view.ftp.value }}</span>{{ ' ' }}<span class="text-body-2 text-medium-emphasis">({{ view.ftp.kind }})</span>
      </h3>
      <p v-if="view.ftp.declared" class="text-body-2 text-medium-emphasis">
        Hai dichiarato <b>{{ view.ftp.declared }} W</b> in Impostazioni: vale su ogni stima.
      </p>
      <VExpansionPanels v-if="view.ftp.table" v-model="ftpOpen" class="mt-2">
        <VExpansionPanel>
          <VExpansionPanelTitle>{{ view.ftp.table.summary }}</VExpansionPanelTitle>
          <VExpansionPanelText>
            <VTable density="compact" class="breakdown">
              <thead>
                <tr><th>Durata</th><th>Attività</th><th>WAP</th><th>Decay</th><th>× Fattore</th><th>= FTP candidato</th></tr>
              </thead>
              <tbody>
                <template v-for="row in view.ftp.table.rows" :key="row.bucket">
                  <tr v-if="row.empty">
                    <td>{{ row.bucket }}</td>
                    <td colspan="5" class="text-medium-emphasis">— nessuna attività in questo bucket —</td>
                  </tr>
                  <tr v-else :class="{ winner: row.winner }">
                    <td class="text-no-wrap">{{ row.bucket }} <LineIcon v-if="row.winner" name="race" :size="16" /></td>
                    <td>
                      <RouterLink :to="detail(row.activity.id)">{{ row.activity.name }}</RouterLink>
                      <div class="text-caption text-medium-emphasis">{{ row.sub }}</div>
                    </td>
                    <td><b>{{ row.watts }}</b> W</td>
                    <td>{{ row.decay }}</td>
                    <td>{{ row.factor }}</td>
                    <td><b>{{ row.candidate }}</b> W</td>
                  </tr>
                </template>
              </tbody>
            </VTable>
            <p v-if="view.ftp.table.fromSegments" class="mt-3">
              <b>FTP da segmenti</b>: {{ view.ftp.table.fromSegments }} W. Vince la stima più alta fra uscite e segmenti.
            </p>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
      <p v-else-if="view.ftp.missing" class="text-medium-emphasis">
        Nessuna attività con potenza: registra uscite con un misuratore di potenza o dichiara la FTP in Impostazioni.
      </p>

      <h3 class="value-line text-subtitle-1 font-weight-bold mt-6">
        <LineIcon name="heart" :size="18" /> LTHR attuale: <span class="accent">{{ view.lthr.value }}</span>{{ ' ' }}<span class="text-body-2 text-medium-emphasis">({{ view.lthr.kind }})</span>
      </h3>
      <VExpansionPanels v-if="view.lthr.table" v-model="lthrOpen" class="mt-2">
        <VExpansionPanel>
          <VExpansionPanelTitle>Dettaglio stima M1 / M2 / segmenti</VExpansionPanelTitle>
          <VExpansionPanelText>
            <VTable density="compact" class="breakdown">
              <thead>
                <tr><th>Metodo</th><th>Riferimento</th><th>Calcolo</th><th>Risultato</th></tr>
              </thead>
              <tbody>
                <template v-for="row in view.lthr.table.rows" :key="row.method">
                  <tr v-if="'empty' in row">
                    <td>{{ row.method }}</td>
                    <td colspan="3" class="text-medium-emphasis">{{ row.empty }}</td>
                  </tr>
                  <tr v-else :class="{ winner: row.winner }">
                    <td class="text-no-wrap">{{ row.method }} <LineIcon v-if="row.winner" name="race" :size="16" /></td>
                    <td>
                      <template v-if="row.activity">
                        <RouterLink :to="detail(row.activity.id)">{{ row.activity.name }}</RouterLink>
                        <div class="text-caption text-medium-emphasis">{{ row.sub }}</div>
                      </template>
                      <span v-else class="text-medium-emphasis">{{ row.sub }}</span>
                    </td>
                    <td>{{ row.calc }}</td>
                    <td><b>{{ row.value }}</b> bpm</td>
                  </tr>
                </template>
              </tbody>
            </VTable>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
      <p v-else class="text-medium-emphasis">
        Nessuna attività con FC: usa una fascia cardio o dichiara la LTHR in Impostazioni.
      </p>
    </VCardText>
  </VCard>
</template>

<style scoped>
.value-line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}

.accent {
  color: rgb(var(--v-theme-primary));
}

.breakdown {
  background: transparent;
}

.breakdown thead th {
  background: rgb(var(--v-theme-subtle));
  font-size: 0.8rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.breakdown .winner {
  background: rgba(var(--v-theme-primary), 0.08);
}

.breakdown a {
  color: inherit;
  text-decoration-color: rgb(var(--v-theme-grid));
}

.breakdown a:hover {
  text-decoration-color: rgb(var(--v-theme-primary));
}
</style>
