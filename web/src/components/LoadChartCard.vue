<script setup lang="ts">
// Il carico degli ultimi 30 giorni: una barra per giorno, colorata per tipo (le dure a righe,
// le lunghe a puntini), e la media giornaliera tratteggiata. Sta in Allenamento e in Analisi.
import { mdiChartBar } from '@mdi/js';
import { computed } from 'vue';
import { VCard, VCardText } from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import { CHART_EXPLANATIONS } from '../core/explanations/charts.ts';
import { LOAD_KINDS, type LoadPattern, type loadChartView, loadSummary } from '../core/training-view.ts';
import CardHeading from './CardHeading.vue';
import ChartLegend from './ChartLegend.vue';
import InfoLabel from './InfoLabel.vue';
import LineChart from './LineChart.vue';

const props = defineProps<{ chart: ReturnType<typeof loadChartView> }>();

// I tipi di carico nominano colori del tema: qui diventano i colori del tema attivo.
const colorOf = useThemeColor();

const summary = computed(() => loadSummary(props.chart));
const legend = computed(() => LOAD_KINDS.map(kind => ({ color: colorOf(kind.color), label: kind.tag, pattern: kind.pattern })));

// Il riempimento di una barra: il colore, con righe chiare o puntini sopra quando serve.
// Una piastrella di 8 px ripetuta resta visibile anche sulle barre strette.
function fill(color: string, pattern: LoadPattern): string | CanvasPattern {
  if (!pattern) return color;
  const tile = document.createElement('canvas');
  tile.width = tile.height = 8;
  const ctx = tile.getContext('2d');
  if (!ctx) return color;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 8, 8);
  ctx.fillStyle = ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
  ctx.beginPath();
  if (pattern === 'stripes') {
    ctx.lineWidth = 2;
    for (const o of [-8, 0, 8]) {
      ctx.moveTo(o, 8);
      ctx.lineTo(o + 8, 0);
    }
    ctx.stroke();
  } else {
    ctx.arc(4, 4, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  return ctx.createPattern(tile, 'repeat') ?? color;
}

const data = computed(() => {
  const { labels, loads, colors, patterns, average } = props.chart;
  return {
    labels,
    datasets: [
      { type: 'bar' as const, data: loads, backgroundColor: colors.map((c, i) => fill(colorOf(c), patterns[i])), borderRadius: 2, order: 2 },
      {
        type: 'line' as const, data: labels.map(() => average), borderColor: colorOf('muted'), borderWidth: 1,
        borderDash: [3, 3], pointRadius: 0, pointHoverRadius: 0, order: 1,
      },
    ],
  };
});

// Al passaggio del mouse: il giorno, il suo carico con il tipo, e la media giornaliera.
const tooltip = {
  label: (dataset: number, i: number) => dataset === 0
    ? `carico ${props.chart.loads[i].toFixed(0)} · ${props.chart.tags[i]}`
    : `media giornaliera ${props.chart.average.toFixed(0)}`,
};
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiChartBar" class="px-4 pt-4 pb-2"><InfoLabel :topic="CHART_EXPLANATIONS.dailyLoad" /></CardHeading>
    <VCardText>
      <LineChart :data="data" :tooltip="tooltip" :height="180" />
      <ChartLegend :items="legend" />
      <p class="text-body-2 mt-2">{{ summary }}</p>
    </VCardText>
  </VCard>
</template>
