<script setup lang="ts">
// I prossimi 28 giorni, da lunedì: un clic su un giorno passa da normale a "salto" a
// "pioggia" e torna normale, come dice la riga in alto con la legenda. Vuetify non ha
// un calendario così: sono pulsanti in griglia, uno per giorno.
import { VBtn } from 'vuetify/components';
import { emojiIcon } from '../core/emoji.ts';
import type { restCalendar } from '../core/training-view.ts';
import LineIcon from './LineIcon.vue';

defineProps<{ weeks: ReturnType<typeof restCalendar> }>();
const emit = defineEmits<{ cycle: [iso: string] }>();

const STATE_NAMES = { normal: 'allenamento', skip: 'salto', rain: 'pioggia' };
const LEGEND = [
  { state: 'normal', label: 'Allenamento', icon: null },
  { state: 'skip', label: 'Salto', icon: 'skip' },
  { state: 'rain', label: 'Pioggia', icon: 'rain' },
] as const;
</script>

<template>
  <div>
    <p class="text-body-2 text-medium-emphasis mb-2">Tocca un giorno per cambiarlo: allenamento, poi salto, poi pioggia.</p>
    <div class="legend text-caption">
      <span v-for="item in LEGEND" :key="item.state" :class="['swatch', `rest-day--${item.state}`]">
        <LineIcon v-if="item.icon" :name="item.icon" :size="14" />{{ item.label }}
      </span>
    </div>
    <template v-for="week in weeks" :key="week.label">
      <div class="text-caption text-medium-emphasis mt-3">{{ week.label }}</div>
      <div class="rest-week">
        <VBtn
          v-for="day in week.days"
          :key="day.iso"
          :class="['rest-day', `rest-day--${day.state}`, { 'rest-day--today': day.today, 'rest-day--past': day.past }]"
          variant="flat"
          height="auto"
          :aria-label="`${day.label}: ${STATE_NAMES[day.state]}`"
          @click="emit('cycle', day.iso)"
        >
          <span class="d-flex flex-column align-center ga-1">
            <span>{{ day.label }}</span>
            <LineIcon v-if="emojiIcon(day.icon)" :name="emojiIcon(day.icon)!" :size="18" />
          </span>
        </VBtn>
      </div>
    </template>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.swatch {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border: 1px solid rgb(var(--v-theme-grid));
  border-radius: 999px;
}

.rest-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4rem;
  margin-top: 0.4rem;
}

.rest-day {
  min-width: 0;
  min-height: 48px;
  padding: 0.375rem 0.2rem;
  border: 1px solid rgb(var(--v-theme-grid));
  border-radius: var(--radius-control);
  background: rgb(var(--v-theme-surface));
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
  background: rgba(var(--v-theme-warning), 0.12);
  border-color: rgb(var(--v-theme-warning));
  color: rgb(var(--v-theme-warning));
}

.rest-day--rain {
  background: rgba(var(--v-theme-info), 0.12);
  border-color: rgb(var(--v-theme-info));
  color: rgb(var(--v-theme-info));
}

.rest-day--today {
  box-shadow: 0 0 0 2px rgb(var(--v-theme-primary));
  font-weight: 700;
}

.rest-day--past {
  opacity: 0.5;
}
</style>
