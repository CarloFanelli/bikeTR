<script setup lang="ts">
// Il workout proposto dal Coach: titolo, potenza e passi sulla pagina, con l'inizio del
// ragionamento; il ragionamento intero e i paper citati nel pannello delle spiegazioni.
// Sopra, l'avviso del ripiego e le note su bozze e corse. I testi del servizio e del modello
// si mostrano sempre come testo, mai come HTML. Il resto (risposta grezza, paper trovati,
// modello e tempi) sta in "Dietro le quinte", nella schermata.
import { computed, ref } from 'vue';
import { VBtn } from 'vuetify/components';
import { openInfoPanel } from '../app/info-panel.ts';
import type { CoachWorkout } from '../core/coach-types.ts';
import { draftsNotes, ridesNotes } from '../core/coach-view.ts';
import { splitEmoji, withoutEmoji } from '../core/emoji.ts';
import { fallbackTopic, workoutWhyTopic } from '../core/explanations/coach.ts';
import { clipWords } from '../core/text.ts';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ workout: CoachWorkout }>();

const notes = computed(() => [...draftsNotes(props.workout), ...ridesNotes(props.workout.rides)].map(splitEmoji));
const reasoning = computed(() => clipWords(props.workout.razionale, 30));
const why = ref<{ $el: HTMLElement } | null>(null);
</script>

<template>
  <div v-if="workout.fallbackWarning" class="notice notice-warning">
    <LineIcon name="warning" :size="18" />
    <InfoLabel :topic="fallbackTopic(workout.fallbackWarning)" />
  </div>
  <div v-for="note in notes" :key="note.text" class="notice text-medium-emphasis">
    <LineIcon v-if="note.icon" :name="note.icon" :size="18" />
    <span>{{ note.text }}</span>
  </div>
  <article class="workout">
    <h2 class="workout-title">{{ workout.title }}</h2>
    <div v-if="workout.targetWatt" class="watt">
      <LineIcon name="power" :size="18" />
      <span>{{ withoutEmoji(workout.targetWatt) }}</span>
    </div>
    <ol class="steps">
      <li v-for="(step, i) in workout.struttura" :key="i">{{ withoutEmoji(step) }}</li>
    </ol>
    <p v-if="workout.razionale" class="reasoning text-medium-emphasis">{{ reasoning.visible }}</p>
    <VBtn
      ref="why"
      variant="text"
      color="primary"
      class="action px-0"
      min-height="44"
      @click="openInfoPanel(workoutWhyTopic(workout), why?.$el ?? null)"
    >
      Perché questo workout
    </VBtn>
  </article>
</template>

<style scoped>
.notice {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
}

.notice-warning {
  color: rgb(var(--v-theme-warning));
}

.workout {
  padding-top: 0.5rem;
}

.workout-title {
  margin-bottom: 0.5rem;
  font-family: var(--v-font-heading);
  font-size: 1.375rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.watt {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.75rem;
  font-weight: 600;
}

.steps {
  margin: 0 0 1rem;
  padding-left: 1.25rem;
  line-height: 1.6;
}

.steps li {
  margin: 0.25rem 0;
}

.reasoning {
  margin-bottom: 0.25rem;
  line-height: 1.6;
}
</style>
