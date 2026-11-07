<script setup lang="ts">
// FTP e LTHR usate in tutta l'app, e le tabelle dei metodi che le stimano: quale uscita,
// quale formula, chi vince. Le tabelle sono aperte quando il valore è stimato.
import { ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  VCard, VCardSubtitle, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VExpansionPanelText,
  VExpansionPanelTitle, VTable,
} from 'vuetify/components';
import type { ftpLthrView } from '../core/analysis-view.ts';

const props = defineProps<{ view: ReturnType<typeof ftpLthrView> }>();

const ftpOpen = ref(props.view.ftp.table?.open ? [0] : []);
const lthrOpen = ref(props.view.lthr.table?.open ? [0] : []);
const detail = (id: number) => ({ name: 'attivita-dettaglio', params: { id } });
</script>

<template>
  <VCard>
    <VCardTitle>🔍 Calcolo FTP / LTHR — dettaglio</VCardTitle>
    <VCardSubtitle>Quale attività e quale formula hanno determinato i valori usati in tutta l'app.</VCardSubtitle>
    <VCardText>
      <h3 class="text-subtitle-1 font-weight-bold">
        ⚡ FTP attuale: <span class="accent">{{ view.ftp.value }}</span>{{ ' ' }}<span class="text-body-2 text-medium-emphasis">({{ view.ftp.kind }})</span>
      </h3>
      <p v-if="view.ftp.declared" class="text-body-2 text-medium-emphasis">
        Hai dichiarato manualmente <b>{{ view.ftp.declared }}W</b> nei settings — prevale su qualunque stima.
      </p>
      <VExpansionPanels v-if="view.ftp.table" v-model="ftpOpen" class="mt-2">
        <VExpansionPanel>
          <VExpansionPanelTitle>{{ view.ftp.table.summary }}</VExpansionPanelTitle>
          <VExpansionPanelText>
            <p class="text-body-2 text-medium-emphasis">
              Per ogni bucket di durata cerco la migliore <i>weighted average power</i> con peso esponenziale (half-life 12
              settimane). Il fattore corregge il fatto che WAP su una uscita lunga è ≈ FTP, mentre uno sforzo breve è ben
              sopra FTP.
            </p>
            <VTable density="compact" class="breakdown mt-2">
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
                    <td>{{ row.bucket }}{{ row.winner ? ' 🏆' : '' }}</td>
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
              <b>FTP da segmenti</b>: {{ view.ftp.table.fromSegments }} W (best avg watts su segmenti 15-30 min × 0.95). Vince
              il MAX tra attività e segmenti.
            </p>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
      <p v-else-if="view.ftp.missing" class="text-medium-emphasis">
        Nessuna attività con potenza nei dati: registra uscite con power meter o dichiara FTP nei settings.
      </p>

      <h3 class="text-subtitle-1 font-weight-bold mt-6">
        ❤️ LTHR attuale: <span class="accent">{{ view.lthr.value }}</span>{{ ' ' }}<span class="text-body-2 text-medium-emphasis">({{ view.lthr.kind }})</span>
      </h3>
      <VExpansionPanels v-if="view.lthr.table" v-model="lthrOpen" class="mt-2">
        <VExpansionPanel>
          <VExpansionPanelTitle>Dettaglio stima M1 / M2 / segmenti</VExpansionPanelTitle>
          <VExpansionPanelText>
            <p class="text-body-2 text-medium-emphasis">
              Prendo il MAX tra tre metodi indipendenti. Se uno fallisce per dati insufficienti, gli altri reggono la stima.
            </p>
            <VTable density="compact" class="breakdown mt-2">
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
                    <td>{{ row.method }}{{ row.winner ? ' 🏆' : '' }}</td>
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
        Nessuna attività con FC: collega un cardiofrequenzimetro o dichiara LTHR nei settings.
      </p>
    </VCardText>
  </VCard>
</template>

<style scoped>
.accent {
  color: rgb(var(--v-theme-primary));
}

.breakdown {
  background: transparent;
}

.breakdown thead th {
  background: #14171d;
  font-size: 0.8rem;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.breakdown .winner {
  background: rgba(252, 82, 0, 0.08);
}

.breakdown a {
  color: inherit;
  text-decoration-color: #2a2e38;
}

.breakdown a:hover {
  text-decoration-color: rgb(var(--v-theme-primary));
}
</style>
