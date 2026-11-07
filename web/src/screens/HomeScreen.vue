<script setup lang="ts">
// Home: l'atleta con i totali di sempre e l'export JSON, la precisione dei dati con
// "Aggiorna con streams", e il profilo con i record. I due lavori lunghi stanno in
// app/jobs.ts: continuano cambiando sezione, e qui se ne vede l'avanzamento.
import { mdiDownload } from '@mdi/js';
import { computed, ref } from 'vue';
import {
  VAvatar, VBtn, VCard, VCardText, VCardTitle, VCol, VExpansionPanel, VExpansionPanels, VExpansionPanelText,
  VExpansionPanelTitle, VRow,
} from 'vuetify/components';
import { exportJob, refreshStreams, streamsJob } from '../app/jobs.ts';
import { hrProfile, session } from '../app/session.ts';
import ExportDialog from '../components/ExportDialog.vue';
import MetricGrid from '../components/MetricGrid.vue';
import { displayName } from '../core/activity-view.ts';
import { athleteTotals, dataPrecision, profileRows, recordRows } from '../core/home.ts';
import { buildProfile, personalRecords } from '../core/profile.ts';
import { loadSettings } from '../data/storage.ts';
import { MAX_STREAMS_FETCH } from '../data/streams.ts';

const exportOpen = ref(false);

const athlete = computed(() => session.athlete);
const location = computed(() => [athlete.value?.city, athlete.value?.country].filter(Boolean).join(', '));
const totals = computed(() => athleteTotals(session.stats));

// Si ricalcola quando "Aggiorna con streams" aggiunge le metriche alle attività.
const precision = computed(() => dataPrecision(hrProfile(), session.activities, MAX_STREAMS_FETCH));
const precisionItems = computed<[string, string, string?][]>(() => [
  ['FTP', precision.value.ftp.value, precision.value.ftp.note],
  ['LTHR', precision.value.lthr.value, precision.value.lthr.note],
  ['Attività con potenza', precision.value.withPower],
  ['Attività con FC', precision.value.withHr],
  ['Streams precisi', precision.value.streams],
]);

const profile = computed(() => buildProfile(session.stats, session.activities, loadSettings(), new Date()));
const records = computed(() => recordRows(personalRecords(session.activities)));
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <VCard v-if="athlete">
      <VCardText class="d-flex flex-wrap align-center ga-4">
        <VAvatar v-if="athlete.profile" :image="athlete.profile" size="64" />
        <div class="flex-grow-1">
          <div class="text-h6">{{ athlete.firstname }} {{ athlete.lastname }}</div>
          <div class="text-medium-emphasis">{{ location }}</div>
          <div v-for="t in totals" :key="t.label">{{ t.label }}: <b>{{ t.distance }}</b> · {{ t.count }} att.</div>
        </div>
        <div class="text-right">
          <VBtn :prepend-icon="mdiDownload" variant="tonal" @click="exportOpen = true">Esporta allenamenti</VBtn>
          <div v-if="exportJob.running" class="text-caption text-medium-emphasis mt-1">
            Export in corso: {{ exportJob.progress || 'avvio…' }}
          </div>
        </div>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>🎯 Precisione dati</VCardTitle>
      <VCardText>
        <p class="mb-3">{{ precision.mode.icon }} <b>{{ precision.mode.label }}</b> {{ precision.mode.detail }}</p>
        <MetricGrid :items="precisionItems" />
        <VExpansionPanels class="mt-4" variant="accordion">
          <VExpansionPanel>
            <VExpansionPanelTitle class="text-medium-emphasis">Come vengono stimati FTP e LTHR?</VExpansionPanelTitle>
            <VExpansionPanelText class="text-body-2 explain">
              <p>
                <b>FTP stimata</b> — prende il MAX tra <i>attività</i> e <i>segmenti</i>; se non c'è FTP dichiarata,
                viene usata questa.
              </p>
              <p>
                <i>Da attività</i> (<code>estimateFTP</code>): power-duration model su quattro bucket di durata
                (10–20', 20–40', 40–90', e fallback &lt;10'), best per bucket pesato per recency (half-life ≈ 8
                settimane). Coefficiente classico Coggan/Allen <code>×0.95</code> per il bucket 20–40'.
              </p>
              <p><i>Da segmenti</i> (<code>estimatesFromSegments</code>): quattro metodi, scelto quello con confidenza più alta:</p>
              <ul>
                <li><b>best 15–30'</b> × 0.95 (retrocompatibile, confidenza 0.7)</li>
                <li><b>weighted recent</b> × 0.95: stesso bucket pesato per recency exp(-età/12 settimane) (confidenza 0.75)</li>
                <li>
                  <b>suitable climb</b>: best effort 15–40' solo su segmenti di salita 3–12% con ≥40m dislivello e
                  ≥1.5km (elimina drafting/vento, confidenza 0.9)
                </li>
                <li><b>power-duration model</b>: triangolazione su 5 bucket di durata con fattori specifici, media (confidenza 0.85)</li>
              </ul>
              <p><b>LTHR stimata</b> — prende il MAX tra:</p>
              <ul>
                <li><b>M1</b>: <code>HRmax osservato × 0.91</code> (media letteratura Friel/Coggan/Allen 88–92%)</li>
                <li>
                  <b>M2</b>: <code>best avg HR in attività 20–60'</code> × 0.98, solo dove il max HR era ≥ 90%
                  dell'HRmax osservato
                </li>
                <li><b>M3</b>: <code>best avg HR su segmenti 15–45'</code> × 0.98 — sforzi all-out tipici, più affidabili</li>
              </ul>
              <p>
                <b>Limitazioni senza streams</b>: il <i>Weighted Avg</i> del summary Strava è una NP approssimata,
                non precisa. Con gli streams (serie secondo-per-secondo) calcolo NP vera con rolling 30s, TSS
                chirurgico, minuti per zona HR effettivi. Clicca "Aggiorna con streams" per scaricarli (1 chiamata
                API/attività, rate limit Strava 100/15min).
              </p>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
        <VBtn
          class="mt-4"
          color="primary"
          variant="tonal"
          :loading="streamsJob.running"
          :disabled="streamsJob.running"
          @click="refreshStreams"
        >
          Aggiorna con streams (API call)
        </VBtn>
        <div class="text-medium-emphasis mt-2">{{ streamsJob.progress }}</div>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>🧬 Profilo atleta</VCardTitle>
      <VCardText>
        <VRow>
          <VCol cols="12" md="4">
            <VCard variant="tonal" color="primary" class="pa-4 h-100">
              <div class="text-medium-emphasis">Livello stimato</div>
              <div class="text-h5 font-weight-bold">{{ profile.level.label }}</div>
              <div class="text-caption">{{ profile.level.note }}</div>
            </VCard>
          </VCol>
          <VCol cols="12" md="8"><MetricGrid :items="profileRows(profile)" /></VCol>
        </VRow>
        <template v-if="records.length">
          <h3 class="text-subtitle-1 font-weight-bold mt-6 mb-3">🏆 I tuoi record (dalle ultime ~60 uscite)</h3>
          <VRow>
            <VCol v-for="rec in records" :key="rec.label" cols="12" sm="6" lg="3">
              <VCard variant="tonal" class="h-100" :to="{ name: 'attivita-dettaglio', params: { id: rec.activity.id } }">
                <VCardText>
                  <div class="text-caption text-medium-emphasis">{{ rec.label }}</div>
                  <div class="text-h6">{{ rec.value }}</div>
                  <div class="text-caption text-medium-emphasis">{{ displayName(rec.activity.name, rec.activity.id) }}</div>
                </VCardText>
              </VCard>
            </VCol>
          </VRow>
        </template>
      </VCardText>
    </VCard>

    <ExportDialog v-model="exportOpen" />
  </div>
</template>

<style scoped>
.explain p,
.explain ul {
  margin-bottom: 0.5rem;
}

.explain ul {
  padding-left: 1.25rem;
}
</style>
