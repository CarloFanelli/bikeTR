<script setup lang="ts">
// Curva di potenza: la FTP usata in tutta l'app con le sue sorgenti, il grafico della
// miglior potenza per durata (asse logaritmico) e una riga per fascia, che porta all'uscita.
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { VCard, VCardText, VCardTitle } from 'vuetify/components';
import { type ftpCard, POWER_CURVE_TICKS, type powerCurveView } from '../core/analysis-view.ts';
import LineChart from './LineChart.vue';

const props = defineProps<{ curve: ReturnType<typeof powerCurveView> | null; ftp: ReturnType<typeof ftpCard> }>();

const data = computed(() => ({
  datasets: [{
    type: 'line' as const, data: (props.curve?.points ?? []).map(p => ({ x: p.x, y: p.y })),
    borderColor: '#fc5200', backgroundColor: '#fc5200', borderWidth: 2, pointRadius: 4,
  }],
}));

// La fascia, i watt e l'uscita del punto più vicino.
const tooltip = {
  title: (i: number) => props.curve?.points[i].title ?? '',
  label: (_: number, i: number) => {
    const p = props.curve?.points[i];
    return p ? `${p.text} — ${p.activity}` : '';
  },
};
</script>

<template>
  <VCard>
    <VCardTitle>⚡ Curva di potenza & FTP stimato</VCardTitle>
    <VCardText>
      <p v-if="!curve" class="text-medium-emphasis">
        Nessuna attività con dati di potenza. Serve un misuratore di potenza sulla bici.
      </p>
      <template v-else>
        <div v-if="ftp" class="ftp-card mb-3">
          <div class="text-medium-emphasis">FTP effettiva (usata nei calcoli)</div>
          <div class="ftp-value">{{ ftp.value }}</div>
          <div class="text-caption text-medium-emphasis">Sorgente attiva: <b>{{ ftp.active }}</b></div>
          <div class="text-caption text-medium-emphasis mt-1">
            Tutte le sorgenti:
            <template v-for="(source, i) in ftp.sources" :key="source.text">
              {{ i ? ' · ' : '' }}<b v-if="source.strong">{{ source.text }}</b><template v-else>{{ source.text }}</template>
            </template>
          </div>
          <div class="text-caption text-medium-emphasis mt-2">
            Regola: FTP dichiarata prevale. Altrimenti prendo il MAX tra attività (best WAP 20-60' × 0.95) e segmenti
            (best avg W 15-30' × 0.95). Per la precisione massima: test FTP dedicato di 20' all-out.
          </div>
        </div>
        <LineChart :data="data" :tooltip="tooltip" :log-x="POWER_CURVE_TICKS" :height="200" />
        <div class="pdc mt-3">
          <div v-for="row in curve.rows" :key="row.label" class="pdc-row">
            <span class="text-medium-emphasis">{{ row.label }}</span>
            <RouterLink
              v-if="row.activityId"
              class="pdc-val"
              :to="{ name: 'attivita-dettaglio', params: { id: row.activityId } }"
            >
              {{ row.value }}
            </RouterLink>
            <span v-else class="text-medium-emphasis">— nessun dato</span>
          </div>
        </div>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.ftp-card {
  padding: 0.75rem 1rem;
  border-left: 4px solid rgb(var(--v-theme-primary));
  border-radius: 8px;
  background: #0f1115;
}

.ftp-value {
  margin: 0.2rem 0;
  color: rgb(var(--v-theme-primary));
  font-size: 1.4rem;
  font-weight: 700;
}

.pdc {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
  gap: 0.4rem 1.5rem;
}

.pdc-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.9rem;
}

.pdc-val {
  color: rgb(var(--v-theme-primary));
  font-weight: 600;
  text-decoration: none;
}

.pdc-val:hover {
  text-decoration: underline;
}
</style>
