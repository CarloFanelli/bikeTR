<script setup lang="ts">
// Il profilo dell'atleta: livello stimato (le righe del calcolo stanno nel suo pannello),
// totali da Strava e record delle ultime uscite. Sta nella scheda Profilo e dati di Analisi.
import { mdiAccountOutline } from '@mdi/js';
import { computed } from 'vue';
import { VCard, VCardText } from 'vuetify/components';
import { session } from '../app/session.ts';
import { trainingContext } from '../app/today.ts';
import { displayName } from '../core/activity-view.ts';
import { splitEmoji } from '../core/emoji.ts';
import { levelTopic } from '../core/explanations/home.ts';
import { athleteTotals, profileRows, recordRows } from '../core/home.ts';
import { personalRecords } from '../core/profile.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';

const profile = computed(() => trainingContext().profile);
const totals = computed(() => athleteTotals(session.stats).map(t => ({ ...t, ...splitEmoji(t.label) })));
const records = computed(() => recordRows(personalRecords(session.activities)));
// "Forma" nel pannello del livello è il volume delle ultime settimane, da non confondere
// con la forma di Home.
const level = computed(() => levelTopic(
  profile.value.level,
  profileRows(profile.value).map(([label, value]) => [label === 'Forma' ? 'Volume recente' : label, value]),
));
</script>

<template>
  <VCard>
    <CardHeading :icon="mdiAccountOutline" class="px-4 pt-4 pb-2">Il tuo profilo</CardHeading>
    <VCardText>
      <div class="text-caption text-medium-emphasis">Livello stimato</div>
      <InfoLabel :topic="level" :label="profile.level.label" class="text-h6" />
      <div v-if="totals.length" class="totals mt-4">
        <div v-for="t in totals" :key="t.label" class="d-flex align-center ga-2">
          <LineIcon v-if="t.icon" :name="t.icon" />
          <span>{{ t.text }}: <b>{{ t.distance }}</b> · {{ t.count }} att.</span>
        </div>
      </div>
      <template v-if="records.length">
        <h3 class="text-subtitle-1 font-weight-bold mt-6 mb-3">Record delle ultime ~60 uscite</h3>
        <div class="records">
          <VCard
            v-for="rec in records"
            :key="rec.label"
            variant="tonal"
            :to="{ name: 'attivita-dettaglio', params: { id: rec.activity.id } }"
          >
            <VCardText>
              <div class="text-caption text-medium-emphasis">{{ rec.label }}</div>
              <div class="text-h6">{{ rec.value }}</div>
              <div class="text-caption text-medium-emphasis wrap">{{ displayName(rec.activity.name, rec.activity.id) }}</div>
            </VCardText>
          </VCard>
        </div>
      </template>
    </VCardText>
  </VCard>
</template>

<style scoped>
.wrap {
  overflow-wrap: anywhere;
}

.records {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 200px), 1fr));
  gap: 1rem;
}

.totals {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
</style>
