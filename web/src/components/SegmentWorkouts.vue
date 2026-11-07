<script setup lang="ts">
// Workout mirati sui segmenti preferiti con almeno 3 tentativi: uno per pannello, con PR e
// obiettivo nel titolo. I nomi dei segmenti sono testo, come li ha scritti l'atleta.
import {
  VCard, VCardSubtitle, VCardText, VCardTitle, VExpansionPanel, VExpansionPanels, VExpansionPanelText,
  VExpansionPanelTitle,
} from 'vuetify/components';
import type { workoutCards } from '../core/segments-view.ts';
import MetricGrid from './MetricGrid.vue';

defineProps<{ cards: ReturnType<typeof workoutCards> }>();
</script>

<template>
  <VCard>
    <VCardTitle>🎯 Workout mirati per i tuoi segmenti</VCardTitle>
    <VCardSubtitle>Intervalli costruiti sulla potenza e durata dei tuoi segmenti preferiti.</VCardSubtitle>
    <VCardText>
      <p v-if="!cards.length" class="text-medium-emphasis">
        Servono almeno 3 tentativi su un segmento per generare workout mirati.
      </p>
      <VExpansionPanels v-else multiple>
        <VExpansionPanel v-for="card in cards" :key="card.id">
          <VExpansionPanelTitle class="font-weight-bold text-body-2">🎯 {{ card.name }} — {{ card.target }}</VExpansionPanelTitle>
          <VExpansionPanelText>
            <MetricGrid :items="card.rows" class="my-2" />
            <div class="detail mt-2">{{ card.detail }}</div>
            <div class="text-caption text-medium-emphasis mt-2">{{ card.reason }}</div>
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
