<script setup lang="ts">
// I prossimi 28 giorni, da lunedì: un clic su un giorno passa da normale a "salto" a
// "pioggia" e torna normale. Vuetify non ha un calendario così: sono pulsanti in griglia,
// con i colori di oggi.
import { VBtn } from 'vuetify/components';
import type { restCalendar } from '../core/training-view.ts';

defineProps<{ weeks: ReturnType<typeof restCalendar> }>();
const emit = defineEmits<{ cycle: [iso: string] }>();
</script>

<template>
  <div>
    <template v-for="week in weeks" :key="week.label">
      <div class="text-caption text-medium-emphasis mt-3">{{ week.label }}</div>
      <div class="rest-week">
        <VBtn
          v-for="day in week.days"
          :key="day.iso"
          :class="['rest-day', `rest-day--${day.state}`, { 'rest-day--today': day.today, 'rest-day--past': day.past }]"
          variant="flat"
          height="auto"
          title="Click: normale → skip → pioggia"
          @click="emit('cycle', day.iso)"
        >
          <span class="d-flex flex-column align-center ga-1">
            <span>{{ day.label }}</span>
            <span>{{ day.icon }}</span>
          </span>
        </VBtn>
      </div>
    </template>
    <div class="text-caption text-medium-emphasis text-center mt-2">
      Settimana lun → dom. Click per ciclare: 🚴 allenati → ⏸️ salto → 🌧️ piove (corpo libero).
    </div>
  </div>
</template>

<style scoped>
.rest-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.rest-day {
  min-width: 0;
  padding: 0.6rem 0.3rem;
  border: 1px solid #2a2e38;
  border-radius: 8px;
  background: #0f1115;
  color: rgb(var(--v-theme-on-surface));
  font-size: 0.8rem;
  font-weight: 500;
  text-transform: none;
  letter-spacing: normal;
}

.rest-day:hover {
  border-color: rgb(var(--v-theme-primary));
}

.rest-day--skip {
  background: #3a2a10;
  border-color: rgb(var(--v-theme-primary));
  color: #ffc98a;
}

.rest-day--rain {
  background: #1a2a3a;
  border-color: #60a5fa;
  color: #93c5fd;
}

.rest-day--today {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  font-weight: 700;
}

.rest-day--past {
  opacity: 0.5;
}
</style>
