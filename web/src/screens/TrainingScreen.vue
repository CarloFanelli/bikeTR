<script setup lang="ts">
// Allenamento: i consigli di oggi e di domani in alto,
// poi il piano del mese con accanto, sugli schermi larghi, il calendario dei 28 giorni, e in
// fondo il grafico del carico. Le spiegazioni stanno
// nei popover e nel pannello laterale. Ogni clic sul calendario salva il giorno e ricalcola tutto.
import { mdiBike, mdiCalendarMonthOutline, mdiCalendarText } from '@mdi/js';
import { computed, ref } from 'vue';
import { VBtn, VCard, VCardText } from 'vuetify/components';
import { attempt, todayAdvice, trainingContext } from '../app/today.ts';
import CardHeading from '../components/CardHeading.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import AdviceCard from '../components/AdviceCard.vue';
import InfoLabel from '../components/InfoLabel.vue';
import LoadChartCard from '../components/LoadChartCard.vue';
import MonthPlan from '../components/MonthPlan.vue';
import RestCalendar from '../components/RestCalendar.vue';
import { TRAINING_EXPLANATIONS } from '../core/explanations/training.ts';
import { loadChartDays } from '../core/plan/load-chart.ts';
import { buildMonthPlan } from '../core/plan/month.ts';
import { adviceRows, loadChartView, restCalendar } from '../core/training-view.ts';
import { cycleDayState } from '../data/storage.ts';

// Cambia a ogni giorno segnato: il piano si ricalcola con i giorni salvati.
const marks = ref(0);

function cycle(iso: string): void {
  cycleDayState(iso);
  marks.value++;
}

const view = computed(() => {
  void marks.value;
  const ctx = trainingContext();
  const { inputs, now, activities, settings, rests, hr, profile, fatigue } = ctx;
  return {
    hr, fatigue, meso: inputs.meso, raceName: settings.raceName,
    date: now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
    advice: todayAdvice(ctx),
    calendar: restCalendar(rests, inputs.rainyDays, now),
    chart: loadChartView(loadChartDays(activities, hr, now)),
    month: attempt(() => buildMonthPlan(activities, settings, rests, profile, inputs)),
  };
});

const rowsOf = (metrics: Parameters<typeof adviceRows>[0]) => adviceRows(metrics, view.value.fatigue, view.value.meso);
</script>

<template>
  <div class="page-wide card-grid">
    <header class="span-all">
      <div class="text-body-2 text-medium-emphasis first-capital">{{ view.date }}</div>
      <h1 class="text-h4">Allenamento</h1>
    </header>

    <!-- Senza consiglio (errore) domani non c'è: oggi prende la riga intera. -->
    <VCard :class="view.advice.value ? 'span-2 today-card' : 'span-all'">
      <VCardText class="pa-6">
        <ErrorNotice
          v-if="view.advice.error"
          summary="Non riesco a calcolare l'allenamento di oggi. Il carico e il piano qui sotto funzionano ancora."
          :detail="view.advice.error"
        />
        <template v-else-if="view.advice.value">
          <CardHeading :icon="mdiBike" class="mb-4">Oggi</CardHeading>
          <AdviceCard
            :advice="view.advice.value.today"
            :rows="rowsOf(view.advice.value.today.metrics)"
            :readiness="view.fatigue.readiness"
          />
          <VBtn to="/coach" color="primary" variant="flat" class="mt-5 action" height="44">Chiedi al Coach</VBtn>
        </template>
      </VCardText>
    </VCard>

    <VCard v-if="view.advice.value">
      <VCardText class="pa-5">
        <AdviceCard
          :advice="view.advice.value.tomorrow"
          :rows="rowsOf(view.advice.value.tomorrow.metrics)"
          :readiness="view.fatigue.readiness"
          compact
        />
      </VCardText>
    </VCard>

    <!-- Piano e calendario in un loro blocco: il calendario resta in vista solo finché c'è il piano accanto. -->
    <div class="plan-and-calendar span-all">
      <VCard class="plan">
        <CardHeading :icon="mdiCalendarText" class="px-4 pt-4 pb-2">Piano delle prossime settimane</CardHeading>
        <VCardText>
          <ErrorNotice
            v-if="view.month.error"
            summary="Non riesco a calcolare il piano delle prossime settimane. L'allenamento di oggi funziona ancora."
            :detail="view.month.error"
          />
          <MonthPlan v-else-if="view.month.value" :month="view.month.value" :hr="view.hr" :meso="view.meso" :race-name="view.raceName" />
        </VCardText>
      </VCard>

      <VCard class="calendar">
        <CardHeading :icon="mdiCalendarMonthOutline" class="px-4 pt-4 pb-2"><InfoLabel :topic="TRAINING_EXPLANATIONS.calendar" /></CardHeading>
        <VCardText><RestCalendar :weeks="view.calendar" @cycle="cycle" /></VCardText>
      </VCard>
    </div>

    <LoadChartCard :chart="view.chart" class="span-all" />
  </div>
</template>

<style scoped>
/* Sotto 1280 px piano e calendario uno sotto l'altro, ognuno sulla riga intera. */
.plan-and-calendar {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 16px;
}

/* Fra 768 e 1279 px oggi prende una colonna, come domani: le due card stanno in una riga. */
@media (min-width: 768px) and (max-width: 1279px) {
  .today-card {
    grid-column: auto;
  }
}

/* Da 1280 px il piano prende due colonne su tre e il calendario la terza, in cima mentre si
   scorre il piano: si ferma dove il blocco finisce, prima del grafico del carico. */
@media (min-width: 1280px) {
  .plan-and-calendar {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .plan {
    grid-column: span 2;
  }

  .calendar {
    align-self: start;
    position: sticky;
    top: 80px;
  }
}
</style>
