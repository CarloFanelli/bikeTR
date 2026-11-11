<script setup lang="ts">
// Workout mirati sui segmenti preferiti con almeno 3 tentativi: uno per pannello, con PR e
// obiettivo nel titolo. I nomi dei segmenti sono testo, come li ha scritti l'atleta. Come
// sono costruiti sta nella spiegazione del titolo.
import { mdiArmFlexOutline } from '@mdi/js';
import {
  VCard, VCardText, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import { withoutEmoji } from '../core/emoji.ts';
import { ANALYSIS_EXPLANATIONS as EXPLAIN } from '../core/explanations/analysis.ts';
import type { workoutCards } from '../core/segments-view.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import MetricGrid from './MetricGrid.vue';

defineProps<{ cards: ReturnType<typeof workoutCards> }>();
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiArmFlexOutline" class="px-4 pt-4 pb-2"><InfoLabel :topic="EXPLAIN.segmentWorkouts" /></CardHeading>
    <VCardText>
      <p v-if="!cards.length" class="text-medium-emphasis">
        Servono almeno 3 tentativi su un segmento per generare workout mirati.
      </p>
      <VExpansionPanels v-else multiple>
        <VExpansionPanel v-for="card in cards" :key="card.id">
          <VExpansionPanelTitle class="font-weight-bold text-body-2">{{ card.name }} — {{ withoutEmoji(card.target) }}</VExpansionPanelTitle>
          <VExpansionPanelText>
            <MetricGrid :items="card.rows" class="my-2" />
            <div class="detail mt-2">{{ withoutEmoji(card.detail) }}</div>
            <div class="text-caption text-medium-emphasis mt-2">{{ withoutEmoji(card.reason) }}</div>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
    </VCardText>
  </VCard>
</template>

<style scoped>
.detail {
  font-size: 0.85rem;
  line-height: 1.6;
  white-space: pre-line;
}
</style>
