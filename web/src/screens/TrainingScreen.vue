<script setup lang="ts">
// Allenamento: consiglio di oggi (e anteprima del prossimo se oggi è saltato), calendario
// dei 28 giorni, grafico del carico e piano del mese. Ogni clic sul calendario salva il
// giorno e ricalcola tutto, come la tab di oggi.
import { computed, ref } from 'vue';
import { VAlert, VCard, VCardText, VCardTitle } from 'vuetify/components';
import { planInputs, session } from '../app/session.ts';
import AdviceCard from '../components/AdviceCard.vue';
import LoadChartCard from '../components/LoadChartCard.vue';
import MonthPlan from '../components/MonthPlan.vue';
import RestCalendar from '../components/RestCalendar.vue';
import { buildFormTrend, compositeFatigueScore } from '../core/form.ts';
import { planHr } from '../core/plan/inputs.ts';
import { loadChartDays } from '../core/plan/load-chart.ts';
import { buildMonthPlan } from '../core/plan/month.ts';
import { buildProfile } from '../core/profile.ts';
import { adviceRows, dailyAdvice, loadChartView, restCalendar } from '../core/training-view.ts';
import { cycleDayState, loadPlannedRests, loadSettings } from '../data/storage.ts';

// Cambia a ogni giorno segnato: il piano si ricalcola con i giorni salvati.
const marks = ref(0);

function cycle(iso: string): void {
  cycleDayState(iso);
  marks.value++;
}

// Un calcolo che fallisce mostra il suo errore al posto della card, il resto si vede lo stesso.
function attempt<T>(fn: () => T): { value: T; error: null } | { value: null; error: string } {
  try {
    return { value: fn(), error: null };
  } catch (e) {
    return { value: null, error: (e as Error).message };
  }
}

const view = computed(() => {
  void marks.value;
  const inputs = planInputs();
  const { now } = inputs;
  const activities = session.activities;
  const settings = loadSettings();
  const rests = loadPlannedRests();
  const hr = planHr(settings, activities, inputs);
  const profile = buildProfile(session.stats, activities, settings, now);
  const fatigue = compositeFatigueScore(buildFormTrend(activities, hr, now), activities, now);
  return {
    hr, fatigue, meso: inputs.meso, raceName: settings.raceName,
    advice: attempt(() => dailyAdvice(activities, settings, rests, profile, inputs)),
    calendar: restCalendar(rests, inputs.rainyDays, now),
    chart: loadChartView(loadChartDays(activities, hr, now)),
    month: attempt(() => buildMonthPlan(activities, settings, rests, profile, inputs)),
  };
});

const rowsOf = (metrics: Parameters<typeof adviceRows>[0]) => adviceRows(metrics, view.value.fatigue, view.value.meso);
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <VCard>
      <VCardTitle>🎯 Allenamento di oggi</VCardTitle>
      <VCardText>
        <VAlert v-if="view.advice.error" type="error" variant="tonal">
          Consiglio non disponibile: {{ view.advice.error }}
        </VAlert>
        <template v-else-if="view.advice.value">
          <AdviceCard
            :advice="view.advice.value.today"
            :rows="rowsOf(view.advice.value.today.metrics)"
            :readiness="view.fatigue.readiness"
          />
          <template v-if="view.advice.value.next">
            <h3 class="text-subtitle-1 font-weight-bold mt-6 mb-3">Anteprima prossimo allenamento</h3>
            <AdviceCard
              :advice="view.advice.value.next"
              :rows="rowsOf(view.advice.value.next.metrics)"
              :readiness="view.fatigue.readiness"
            />
          </template>
        </template>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>Prossimi 28 giorni — clicca per marcare "salto"</VCardTitle>
      <VCardText><RestCalendar :weeks="view.calendar" @cycle="cycle" /></VCardText>
    </VCard>

    <LoadChartCard :chart="view.chart" />

    <VCard>
      <VCardTitle>🗓️ Pianificazione prossimi 7 giorni</VCardTitle>
      <VCardText>
        <VAlert v-if="view.month.error" type="error" variant="tonal">Piano non disponibile: {{ view.month.error }}</VAlert>
        <MonthPlan v-else-if="view.month.value" :month="view.month.value" :hr="view.hr" :meso="view.meso" :race-name="view.raceName" />
      </VCardText>
    </VCard>
  </div>
</template>
