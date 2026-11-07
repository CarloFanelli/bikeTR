<script setup lang="ts">
// Attività: le 15 più recenti; ognuna apre il suo dettaglio dentro l'app.
import { computed } from 'vue';
import { VCard, VCardTitle, VList, VListItem } from 'vuetify/components';
import { session } from '../app/session.ts';
import { activityRow } from '../core/activity-view.ts';

const RECENT = 15;

const rows = computed(() => session.activities.slice(0, RECENT).map(a => ({ id: a.id, ...activityRow(a) })));
</script>

<template>
  <VCard>
    <VCardTitle>Attività recenti</VCardTitle>
    <VList lines="two">
      <VListItem
        v-for="row in rows"
        :key="row.id"
        :to="{ name: 'attivita-dettaglio', params: { id: row.id } }"
        :title="row.title"
        :subtitle="row.meta"
      >
        <template #append>
          <div class="text-right">
            <b>{{ row.distance }}</b>
            <div class="text-caption text-medium-emphasis">{{ row.sub }}</div>
          </div>
        </template>
      </VListItem>
    </VList>
  </VCard>
</template>
