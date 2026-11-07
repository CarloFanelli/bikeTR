<script setup lang="ts">
// Il piano delle prossime 4 settimane: da dove viene il carico, mesociclo o taper, il
// modello di allenamento, poi una settimana per pannello (la prima aperta). Un giorno
// passato con un'attività porta al suo dettaglio.
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  VChip, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import type { HrProfile } from '../core/hr.ts';
import type { Mesocycle } from '../core/meso.ts';
import type { WeekPlan } from '../core/plan/month.ts';
import { loadSourceLine, mesoBanner, modelRows, planRows, weekBlock } from '../core/training-view.ts';
import MetricGrid from './MetricGrid.vue';

const props = defineProps<{ month: WeekPlan[]; hr: HrProfile; meso: Mesocycle | null; raceName?: string }>();

// Colori dei ruoli della settimana; il viola è la settimana di scarico decisa dal modello.
const ROLE_COLORS: Record<string, string> = {
  build1: '#3b82f6', build2: '#facc15', peak: '#fc5200', deload: '#4ade80', block_load: '#ef4444',
  block_lit1: '#3b82f6', block_lit2: '#3b82f6', taper1: '#ec4899', taper2: '#ec4899', taper3: '#ec4899', race_week: '#ec4899',
};
const roleColor = (role: string | null | undefined) => (role && ROLE_COLORS[role]) || '#8b5cf6';

const first = computed(() => props.month[0]);
const skipDays = computed(() => [...first.value.plannedRests].sort().join(', '));
const banner = computed(() => mesoBanner(props.meso, first.value.weekRole));
const weeks = computed(() => props.month.map((wp, i) => ({ ...weekBlock(wp, i, props.raceName), rows: planRows(wp.days) })));
const open = ref([0]);
</script>

<template>
  <div class="text-caption text-medium-emphasis mb-2">{{ loadSourceLine(hr) }}</div>
  <div v-if="skipDays" class="text-caption text-medium-emphasis mb-2">⏸️ Giorni skip: {{ skipDays }}</div>
  <div v-if="first.isRecoveryWeek" class="plan-banner mb-3" :style="{ '--role': roleColor(null) }">
    🔄 <b>Settimana di scarico</b> — hai accumulato {{ first.model.consecLoad }} settimane di carico consecutive. Questa
    settimana riduco intensità e volume per consolidare gli adattamenti (principio 3:1 load/recovery).
  </div>
  <div v-if="banner" class="plan-banner mb-3" :style="{ '--role': '#3b82f6' }">
    {{ banner.icon }} <b class="meso-title">{{ banner.title }}</b>
    <VChip v-if="banner.role" size="x-small" label :color="roleColor(banner.role.role)" class="ml-2 text-uppercase">{{ banner.role.label }}</VChip>
    <div v-for="line in banner.lines" :key="line" class="text-caption text-medium-emphasis mt-1">{{ line }}</div>
  </div>

  <VExpansionPanels class="mb-4">
    <VExpansionPanel>
      <VExpansionPanelTitle class="text-medium-emphasis">🧠 Modello di allenamento (analisi 42 giorni)</VExpansionPanelTitle>
      <VExpansionPanelText>
        <MetricGrid :items="modelRows(first.model)" />
        <p class="text-caption text-medium-emphasis mt-2">
          Il piano settimanale incrocia questi dati: posiziona le sessioni di qualità sui giorni in cui tipicamente le
          fai, riempie con easy nei giorni abituali, e corregge la polarizzazione se troppo squilibrata verso il hard.
        </p>
      </VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>

  <VExpansionPanels v-model="open" multiple>
    <VExpansionPanel v-for="(week, i) in weeks" :key="week.title" :value="i">
      <VExpansionPanelTitle class="font-weight-bold">{{ week.title }}</VExpansionPanelTitle>
      <VExpansionPanelText>
        <div v-if="week.banner" class="plan-banner mb-2" :style="{ '--role': roleColor(week.banner.role) }">
          {{ week.banner.emoji }} <b v-if="week.banner.label">{{ week.banner.label }}</b> {{ week.banner.detail }}
        </div>
        <div class="week-diag text-caption text-medium-emphasis mb-2">
          <div v-for="line in week.diag" :key="line">{{ line }}</div>
        </div>
        <component
          :is="row.activityId ? RouterLink : 'div'"
          v-for="row in week.rows"
          :key="row.label"
          :to="row.activityId ? { name: 'attivita-dettaglio', params: { id: row.activityId } } : undefined"
          :class="['plan-row', { 'plan-row--past': row.past, 'plan-row--link': row.activityId }]"
        >
          <div>
            <div class="text-caption text-uppercase text-medium-emphasis">{{ row.label }}</div>
            <div class="plan-icon">{{ row.icon }}</div>
          </div>
          <div>
            <div class="font-weight-bold mb-1">{{ row.title }}</div>
            <div class="plan-detail text-medium-emphasis">{{ row.detail }}</div>
          </div>
        </component>
      </VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>

<style scoped>
.plan-banner {
  padding: 0.75rem 1rem;
  border-left: 4px solid var(--role);
  border-radius: 8px;
  background: color-mix(in srgb, var(--role) 15%, transparent);
  font-size: 0.9rem;
}

.meso-title {
  color: #60a5fa;
}

.week-diag {
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: #14171d;
  line-height: 1.5;
}

.plan-row {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 1rem;
  align-items: start;
  padding: 0.7rem 0;
  border-bottom: 1px solid #2a2e38;
  color: inherit;
  text-decoration: none;
}

.plan-row:last-child {
  border-bottom: none;
}

.plan-row--past {
  padding-left: 0.3rem;
  border-radius: 6px;
  background: #0a0c10;
  opacity: 0.65;
}

.plan-row--link:hover {
  opacity: 0.85;
}

.plan-icon {
  margin-top: 0.1rem;
  font-size: 1.4rem;
}

.plan-detail {
  font-size: 0.85rem;
  white-space: pre-line;
}
</style>
