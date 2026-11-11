<script setup lang="ts">
// La FTP nel tempo, un punto ogni 5 giorni o più, con il picco storico, i numeri, l'avviso
// di plateau e le osservazioni. Come leggerlo sta nella spiegazione del titolo.
import { mdiChartLine } from '@mdi/js';
import { computed } from 'vue';
import { VCard, VCardText } from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import { ftpTrendSummary } from '../core/analysis-view.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import type { FtpTrend } from '../core/ftp.ts';
import CardHeading from './CardHeading.vue';
import ChartLegend from './ChartLegend.vue';
import InfoLabel from './InfoLabel.vue';
import InsightList from './InsightList.vue';
import LineChart from './LineChart.vue';
import LineIcon from './LineIcon.vue';
import MetricGrid from './MetricGrid.vue';

const props = defineProps<{ trend: FtpTrend | null; rows: [string, string][] }>();

const colorOf = useThemeColor();
const summary = computed(() => (props.trend ? ftpTrendSummary(props.trend) : ''));
const legend = computed(() => [
  { color: colorOf('series-orange'), label: 'FTP' },
  { color: colorOf('series-gold'), label: `Picco storico (${props.trend?.peakFtp}W)` },
]);

const data = computed(() => {
  const history = props.trend?.history ?? [];
  return {
    labels: history.map(h => h.date),
    datasets: [
      {
        type: 'line' as const, data: history.map(h => h.ftp), borderColor: colorOf('series-orange'), backgroundColor: colorOf('series-orange'),
        borderWidth: 2.5, pointRadius: 3,
      },
      {
        type: 'line' as const, data: history.map(() => props.trend?.peakFtp ?? 0), borderColor: colorOf('series-gold'),
        borderWidth: 1.5, borderDash: [3, 3], pointRadius: 0, pointHoverRadius: 0,
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
    <CardHeading :icon="mdiChartLine" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.ftpTrend" /></CardHeading>
    <VCardText>
      <p v-if="!trend" class="text-medium-emphasis">
        Servono almeno 2 settimane di dati FTP per mostrare il trend. Torna dopo qualche settimana di utilizzo.
      </p>
      <template v-else>
        <LineChart :data="data" :tooltip="tooltip" :height="160" :begin-at-zero="false" />
        <ChartLegend line :items="legend" />
        <p class="text-body-2 mt-2">{{ summary }}</p>
        <MetricGrid :items="rows" class="my-3" />
        <div v-if="trend.isPlateauDetected" class="plateau d-flex ga-2 my-2">
          <LineIcon name="warning" :size="18" class="mt-1" />
          <span>
            <b>Plateau</b>: FTP ferma da diverse settimane. Cambia tipo di allenamento, partendo dal focus consigliato nella
            scheda Potenza.
          </span>
        </div>
        <InsightList v-if="trend.insights.length" :items="trend.insights" />
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.plateau {
  padding: 0.6rem 0.8rem;
  border-left: 4px solid rgb(var(--v-theme-warning));
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  background: rgba(var(--v-theme-warning), 0.12);
}
</style>
