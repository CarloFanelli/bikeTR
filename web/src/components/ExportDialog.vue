<script setup lang="ts">
// "Esporta allenamenti": all'apertura conta lo storico, poi scarica un JSON al livello di
// dettaglio scelto. L'export continua anche chiudendo la finestra o cambiando sezione.
import { computed, ref, watch } from 'vue';
import {
  VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VCol, VDialog, VProgressLinear, VRadio, VRadioGroup,
  VRow, VTextField,
} from 'vuetify/components';
import { countForExport, exportJob, runExport } from '../app/jobs.ts';
import { estimate, type ExportMode, exportRange, filterForExport } from '../data/export.ts';

const open = defineModel<boolean>({ required: true });
const mode = ref<ExportMode>('compact');
const from = ref('');
const to = ref('');
const onlyRides = ref(true);

watch(open, isOpen => {
  if (isOpen) void countForExport();
});

const range = computed(() => exportJob.all && exportRange(exportJob.all));
// "— 90 chiamate API · ~15 min" per tutto lo storico, "— …" finché non è contato.
function cost(m: ExportMode): string {
  if (!exportJob.all) return '— …';
  const { calls, minutes } = estimate(m, exportJob.all.length);
  return `— ${calls} chiamate API · ~${minutes} min`;
}

const MODES: { value: ExportMode; title: string; text: string; warn?: string }[] = [
  {
    value: 'compact', title: '📦 Compatto',
    text: 'Summary di ogni attività + metriche già in cache (NP/IF/TSS, zone FC). File piccolo, immediato.',
  },
  {
    value: 'detailed', title: '📋 Dettagliato',
    text: '+ /activities/:id: segment_efforts, splits_metric, laps, best_efforts, gear, description.',
  },
  {
    value: 'max', title: '🔬 Massimo (streams grezzi)',
    text: '+ serie secondo-per-secondo: time, hr, watts, cadence, velocity, altitude, distance, temp, grade.',
    warn: 'File grosso, probabilmente troppo per chat su molte attività.',
  },
];

// Con molte richieste a Strava chiede conferma, come oggi.
function confirmed(choiceMode: ExportMode, count: number): boolean {
  const { calls, minutes } = estimate(choiceMode, count);
  if (choiceMode === 'max' && count > 30) {
    return window.confirm(`Modalità Massimo su ${count} attività:\n- ${calls} chiamate API\n- ~${minutes} minuti\n- File potenzialmente >50 MB\n\nVuoi procedere?`);
  }
  if (choiceMode === 'detailed' && count > 100) {
    return window.confirm(`Modalità Dettagliata su ${count} attività:\n- ${calls} chiamate API\n- ~${minutes} minuti\n\nVuoi procedere?`);
  }
  return true;
}

function start(): void {
  if (!exportJob.all || exportJob.running) return;
  const choice = { mode: mode.value, from: from.value, to: to.value, onlyRides: onlyRides.value };
  if (confirmed(choice.mode, filterForExport(exportJob.all, choice).length)) void runExport(choice);
}
</script>

<template>
  <VDialog v-model="open" max-width="640">
    <VCard>
      <VCardTitle>📥 Esporta allenamenti</VCardTitle>
      <VCardText>
        <p class="text-medium-emphasis mb-3">JSON pronto da incollare in chat con Claude.</p>
        <p class="text-body-2 mb-3">
          <span v-if="exportJob.countError" class="text-error">{{ exportJob.countError }}</span>
          <span v-else-if="exportJob.counting">{{ exportJob.countText }}</span>
          <span v-else-if="exportJob.all && range">
            Trovate <b>{{ exportJob.all.length }}</b> attività totali. Range: {{ range.first }} → {{ range.last }}.
          </span>
        </p>

        <VRadioGroup v-model="mode" label="Livello di dettaglio" :disabled="exportJob.running">
          <VRadio v-for="m in MODES" :key="m.value" :value="m.value" class="mb-2">
            <template #label>
              <div>
                <div>
                  <b>{{ m.title }}</b>
                  <span class="text-medium-emphasis">
                    {{ m.value === 'compact' ? '— 0 chiamate API' : cost(m.value) }}
                  </span>
                </div>
                <div class="text-caption text-medium-emphasis">
                  {{ m.text }} <span v-if="m.warn" class="text-warning">{{ m.warn }}</span>
                </div>
              </div>
            </template>
          </VRadio>
        </VRadioGroup>

        <div class="text-subtitle-2 mb-2">Filtra periodo (opzionale)</div>
        <VRow density="compact">
          <VCol cols="12" sm="6"><VTextField v-model="from" type="date" label="Da" :disabled="exportJob.running" /></VCol>
          <VCol cols="12" sm="6"><VTextField v-model="to" type="date" label="A" :disabled="exportJob.running" /></VCol>
        </VRow>
        <VCheckbox
          v-model="onlyRides"
          label="Solo bici (Ride/MTB/Gravel/Virtual)"
          density="compact"
          :disabled="exportJob.running"
          hide-details
        />
        <div class="text-caption text-medium-emphasis mb-3">
          Vuoto = tutto lo storico. Utile per ridurre il file in modalità "Massimo".
        </div>

        <div class="text-body-2 mb-2">
          <span v-if="exportJob.error" class="text-error">{{ exportJob.error }}</span>
          <span v-else-if="exportJob.done">
            ✅ Esportato <b>{{ exportJob.done.fname }}</b> ({{ exportJob.done.size }}, {{ exportJob.done.count }} attività)
          </span>
          <span v-else>{{ exportJob.progress }}</span>
        </div>
        <VProgressLinear v-if="exportJob.pct !== null" :model-value="exportJob.pct" color="primary" height="6" rounded />
      </VCardText>
      <VCardActions>
        <VBtn @click="open = false">
          {{ exportJob.running ? 'Chiudi (continua in background)' : exportJob.done ? 'Chiudi' : 'Annulla' }}
        </VBtn>
        <VBtn
          color="primary"
          variant="flat"
          :disabled="!exportJob.all || exportJob.running"
          :loading="exportJob.running"
          @click="start"
        >
          {{ exportJob.done ? 'Esporta di nuovo' : 'Esporta' }}
        </VBtn>
      </VCardActions>
    </VCard>
  </VDialog>
</template>
