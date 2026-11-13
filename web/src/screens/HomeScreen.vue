<script setup lang="ts">
// Home, la panoramica del giorno: l'allenamento di oggi, forma e prontezza, km, ore e carico
// della settimana, l'ultima uscita. Profilo e precisione dei dati stanno in Analisi, nella
// scheda Profilo e dati; le spiegazioni nei popover e nel pannello laterale.
import {
  mdiBike, mdiChartBar, mdiClockOutline, mdiGauge, mdiMapMarkerDistance, mdiMapMarkerPath, mdiTrendingUp,
} from '@mdi/js';
import { computed } from 'vue';
import { RouterLink } from 'vue-router';
import { VBtn, VCard, VCardText } from 'vuetify/components';
import { allActivities, ensureAllActivities } from '../app/all-activities.ts';
import { hrProfile, session } from '../app/session.ts';
import { todayAdvice, trainingContext } from '../app/today.ts';
import CardHeading from '../components/CardHeading.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import InfoLabel from '../components/InfoLabel.vue';
import LineIcon from '../components/LineIcon.vue';
import { splitEmoji } from '../core/emoji.ts';
import { HOME_EXPLANATIONS } from '../core/explanations/home.ts';
import { TRAINING_EXPLANATIONS } from '../core/explanations/training.ts';
import { lastRide, weekTiles } from '../core/home.ts';

const athlete = computed(() => session.athlete);
const location = computed(() => [athlete.value?.city, athlete.value?.country].filter(Boolean).join(', '));

const day = computed(() => {
  const ctx = trainingContext();
  const { fatigue } = ctx;
  // Nessun carico negli ultimi 90 giorni: la fatica non si può calcolare.
  const noData = fatigue.ctl === 0 && fatigue.atl === 0;
  const advice = todayAdvice(ctx);
  return {
    date: ctx.now.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' }),
    advice: advice.value ? splitEmoji(advice.value.today.rec.title) : null,
    adviceError: advice.error,
    form: { value: `${fatigue.tsb > 0 ? '+' : ''}${fatigue.tsb}`, color: fatigue.tsb > 0 ? 'success' : fatigue.tsb < 0 ? 'warning' : '' },
    readiness: noData ? null : `${fatigue.composite}/100 · ${fatigue.readiness}`,
  };
});

// Senza carico negli ultimi 90 giorni la prontezza spiega perché manca.
const readinessTopic = computed(() => (day.value.readiness ? TRAINING_EXPLANATIONS.readiness : HOME_EXPLANATIONS.readinessMissing));

// Km, ore e carico della settimana.
const TILE_ICONS: Record<string, string> = { Km: mdiMapMarkerDistance, Ore: mdiClockOutline, Carico: mdiChartBar };
const week = computed(() => weekTiles(session.activities, hrProfile(), new Date()));
// L'ultima uscita in bici di tutto lo storico; finché non è arrivato, tra le ultime 60.
ensureAllActivities();
const ride = computed(() => lastRide(allActivities.list ?? session.activities));
</script>

<template>
  <div class="page-wide card-grid">
    <header class="span-all">
      <div class="text-body-2 text-medium-emphasis first-capital">{{ day.date }}</div>
      <h1 class="text-h4">{{ athlete ? `Ciao ${athlete.firstname}` : 'Oggi' }}</h1>
      <div v-if="location" class="text-body-2 text-medium-emphasis">{{ location }}</div>
    </header>

    <VCard>
      <VCardText class="pa-6">
        <CardHeading :icon="mdiBike" class="mb-3">Allenamento di oggi</CardHeading>
        <ErrorNotice
          v-if="day.adviceError"
          summary="Non riesco a calcolare l'allenamento di oggi. Il resto della Home funziona ancora."
          :detail="day.adviceError"
          class="mb-3"
        />
        <div v-else-if="day.advice" class="d-flex align-center ga-2">
          <LineIcon v-if="day.advice.icon" :name="day.advice.icon" :size="28" />
          <h2 class="text-h5 wrap">{{ day.advice.text }}</h2>
        </div>
        <VBtn to="/allenamento" color="primary" variant="flat" class="mt-4 action" height="44">Vai ad Allenamento</VBtn>
      </VCardText>
    </VCard>

    <VCard>
      <VCardText>
        <CardHeading :icon="mdiTrendingUp" class="mb-2"><InfoLabel :topic="HOME_EXPLANATIONS.form" /></CardHeading>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ HOME_EXPLANATIONS.form.short }}</p>
        <div :class="['text-h4 mt-1', day.form.color && `text-${day.form.color}`]">{{ day.form.value }}</div>
      </VCardText>
    </VCard>
    <VCard>
      <VCardText>
        <CardHeading :icon="mdiGauge" class="mb-2"><InfoLabel :topic="readinessTopic" /></CardHeading>
        <p class="text-body-2 text-medium-emphasis mb-3">{{ readinessTopic.short }}</p>
        <div class="text-h4 mt-1">{{ day.readiness ?? '—' }}</div>
      </VCardText>
    </VCard>

    <VCard v-for="tile in week" :key="tile.label">
      <VCardText>
        <CardHeading :icon="TILE_ICONS[tile.label]" class="mb-3">{{ tile.label }} questa settimana</CardHeading>
        <div class="text-h4 mt-1">{{ tile.value }}</div>
        <div class="text-body-2 text-medium-emphasis">{{ tile.change }} sugli stessi giorni della settimana scorsa</div>
      </VCardText>
    </VCard>

    <VCard>
      <CardHeading :icon="mdiMapMarkerPath" class="px-4 pt-4 pb-2">Ultima uscita</CardHeading>
      <VCardText>
        <RouterLink
          v-if="ride.ride"
          :to="{ name: 'attivita-dettaglio', params: { id: ride.ride.id } }"
          class="ride-link d-flex align-center ga-3"
        >
          <LineIcon name="ride" :size="24" />
          <div class="flex-grow-1 min-w-0">
            <div class="font-weight-bold wrap">{{ ride.ride.name }}</div>
            <div class="text-body-2 text-medium-emphasis">
              {{ ride.ride.date }} · {{ ride.ride.distance }} · {{ ride.ride.time }}
            </div>
          </div>
        </RouterLink>
        <div v-else class="text-medium-emphasis">{{ ride.empty }}</div>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.wrap {
  overflow-wrap: anywhere;
}

.ride-link {
  color: inherit;
  text-decoration: none;
  min-height: 48px;
}

.ride-link:hover .font-weight-bold {
  text-decoration: underline;
}
</style>
