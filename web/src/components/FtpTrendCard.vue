<script setup lang="ts">
// La FTP nel tempo, un punto ogni 5 giorni o più, con il picco storico, i numeri, l'avviso
// di plateau e le osservazioni.
import { computed } from 'vue';
import { VCard, VCardSubtitle, VCardText, VCardTitle } from 'vuetify/components';
import type { FtpTrend } from '../core/ftp.ts';
import ChartLegend from './ChartLegend.vue';
import InsightList from './InsightList.vue';
import LineChart from './LineChart.vue';
import MetricGrid from './MetricGrid.vue';

const props = defineProps<{ trend: FtpTrend | null; rows: [string, string][] }>();

const data = computed(() => {
  const history = props.trend?.history ?? [];
  return {
    labels: history.map(h => h.date),
    datasets: [
      {
        type: 'line' as const, data: history.map(h => h.ftp), borderColor: '#fc5200', backgroundColor: '#fc5200',
        borderWidth: 2.5, pointRadius: 3,
      },
      {
        type: 'line' as const, data: history.map(() => props.trend?.peakFtp ?? 0), borderColor: 'rgba(255, 215, 0, 0.5)',
        borderWidth: 1, borderDash: [3, 3], pointRadius: 0, pointHoverRadius: 0,
      },
    ],
  };
});

const tooltip = {
  label: (dataset: number, i: number) => dataset === 0
    ? `FTP ${props.trend?.history[i].ftp} W`
    : `Picco storico ${props.trend?.peakFtp} W`,
};
</script>

<template>
  <VCard>
    <VCardTitle>📈 Trend FTP nel tempo</VCardTitle>
    <VCardSubtitle>Evoluzione della FTP stimata settimana per settimana.</VCardSubtitle>
    <VCardText>
      <p v-if="!trend" class="text-medium-emphasis">
        Servono almeno 2 settimane di dati FTP per mostrare il trend. Torna dopo qualche settimana di utilizzo.
      </p>
      <template v-else>
        <LineChart :data="data" :tooltip="tooltip" :height="160" :begin-at-zero="false" />
        <ChartLegend
          line
          :items="[{ color: '#fc5200', label: 'FTP' }, { color: '#ffd700', label: `Picco storico (${trend.peakFtp}W)` }]"
        />
        <MetricGrid :items="rows" class="my-3" />
        <div v-if="trend.isPlateauDetected" class="plateau my-2">
          <b>⚠️ Plateau rilevato</b> — FTP stabile da diverse settimane. Considera un cambio di protocollo per sbloccare la
          progressione (vedi "Focus consigliato" nel Power Profile).
        </div>
        <InsightList v-if="trend.insights.length" :items="trend.insights" />
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.plateau {
  padding: 0.6rem 0.8rem;
  border-left: 4px solid #fc5200;
  border-radius: 0 6px 6px 0;
  background: rgba(252, 82, 0, 0.12);
}
</style>
