<script setup lang="ts">
// Il piano delle prossime 4 settimane: gli avvisi in una riga di etichette (settimana di
// scarico, mesociclo o taper, modello di allenamento, da dove viene il carico), ognuno con la
// sua spiegazione, poi una settimana per pannello (la prima aperta) con un giorno per riga,
// segnato col colore del suo tipo come nel grafico del carico; oggi è evidenziato. Il dettaglio di
// un giorno e i numeri della settimana stanno nel pannello delle spiegazioni; un giorno
// passato con un'attività porta al suo dettaglio.
import { computed, ref } from 'vue';
import { RouterLink } from 'vue-router';
import {
  VChip, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import { useThemeColor } from '../app/theme-color.ts';
import { emojiIcon, splitEmoji } from '../core/emoji.ts';
import { loadSourceTopic, recoveryWeekTopic, TRAINING_EXPLANATIONS } from '../core/explanations/training.ts';
import type { Explanation } from '../core/explanations/types.ts';
import type { HrProfile } from '../core/hr.ts';
import type { Mesocycle } from '../core/meso.ts';
import type { WeekPlan } from '../core/plan/month.ts';
import { clipWords } from '../core/text.ts';
import { loadSourceLine, mesoBanner, modelRows, planRows, weekBlock } from '../core/training-view.ts';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ month: WeekPlan[]; hr: HrProfile; meso: Mesocycle | null; raceName?: string }>();

// Colori del tema per i ruoli della settimana, leggibili in chiaro e in scuro; il viola è la
// settimana di scarico decisa dal modello.
const ROLE_COLORS: Record<string, string> = {
  build1: 'primary', build2: 'series-gold', peak: 'series-orange', deload: 'series-green', block_load: 'series-red',
  block_lit1: 'primary', block_lit2: 'primary', taper1: 'series-z5', taper2: 'series-z5', taper3: 'series-z5', race_week: 'series-z5',
};
const colorOf = useThemeColor();
const roleColor = (role: string | null | undefined) => colorOf((role && ROLE_COLORS[role]) || 'load-cross');

// Una spiegazione fatta dal testo di un giorno o di un avviso: l'inizio nel popover, tutto nel pannello.
const fromText = (title: string, lines: string[]): Explanation => ({
  title, short: clipWords(lines[0] ?? '', 25).visible, lead: lines,
});
const noEmoji = (text: string) => splitEmoji(text).text;

const first = computed(() => props.month[0]);
const banner = computed(() => mesoBanner(props.meso, first.value.weekRole));
const loadSource = computed<Explanation>(() => ({ ...loadSourceTopic(props.hr), technical: [noEmoji(loadSourceLine(props.hr))] }));
const model = computed<Explanation>(() => ({
  ...TRAINING_EXPLANATIONS.trainingModel,
  rows: modelRows(first.value.model).map(([label, value]) => [label, noEmoji(value)]),
}));
const weeks = computed(() => props.month.map((wp, i) => {
  const block = weekBlock(wp, i, props.raceName);
  return {
    ...block,
    diagTopic: fromText(`Come è costruita la settimana ${i + 1}`, block.diag.map(noEmoji)),
    rows: planRows(wp.days).map(row => ({
      ...row,
      iconName: emojiIcon(row.icon),
      kindColor: colorOf(row.kind.color),
      topic: row.detail ? fromText(`${row.label} · ${row.title}`, row.detail.split('\n').filter(Boolean)) : null,
    })),
  };
}));
const open = ref([0]);
</script>

<template>
  <div class="notices mb-4">
    <div v-if="first.isRecoveryWeek" class="notice">
      <LineIcon name="recovery-week" />
      <InfoLabel :topic="recoveryWeekTopic(first.model.consecLoad)" />
    </div>
    <div v-if="banner" class="notice">
      <LineIcon v-if="emojiIcon(banner.icon)" :name="emojiIcon(banner.icon)!" />
      <InfoLabel :topic="fromText(banner.title, banner.lines)" panel />
      <VChip v-if="banner.role" size="x-small" label :color="roleColor(banner.role.role)">{{ banner.role.label }}</VChip>
    </div>
    <div class="notice">
      <LineIcon name="trend-up" />
      <InfoLabel :topic="model" label="Modello di allenamento" panel />
    </div>
    <div class="notice">
      <LineIcon name="power" />
      <InfoLabel :topic="loadSource" />
    </div>
  </div>

  <VExpansionPanels v-model="open" multiple>
    <VExpansionPanel v-for="(week, i) in weeks" :key="week.title" :value="i" elevation="0" class="week">
      <VExpansionPanelTitle class="font-weight-bold">{{ week.title }}</VExpansionPanelTitle>
      <VExpansionPanelText>
        <div v-if="week.banner" class="week-role mb-2" :style="{ '--role': roleColor(week.banner.role) }">
          <LineIcon v-if="emojiIcon(week.banner.emoji)" :name="emojiIcon(week.banner.emoji)!" :size="18" />
          <span><b v-if="week.banner.label">{{ week.banner.label }}</b> {{ week.banner.detail }}</span>
        </div>
        <div v-if="week.diag.length" class="mb-2 text-body-2">
          <InfoLabel :topic="week.diagTopic" label="Come è costruita questa settimana" panel />
        </div>
        <div v-for="row in week.rows" :key="row.label" :class="['plan-row', { 'plan-row--past': row.past, 'plan-row--today': row.today }]">
          <i :class="['kind-bar', row.kind.pattern && `pattern-${row.kind.pattern}`]" :style="{ backgroundColor: row.kindColor }" />
          <div class="text-caption text-medium-emphasis">
            <b v-if="row.today" class="today">Oggi</b>
            <span class="text-uppercase">{{ row.label }}</span>
          </div>
          <LineIcon v-if="row.iconName" :name="row.iconName" />
          <span v-else />
          <div class="d-flex flex-wrap align-center ga-2">
            <RouterLink
              v-if="row.activityId"
              :to="{ name: 'attivita-dettaglio', params: { id: row.activityId } }"
              class="plan-title plan-title--link"
            >
              {{ row.title }}
            </RouterLink>
            <span v-else class="plan-title">{{ row.title }}</span>
            <span class="text-caption text-medium-emphasis">{{ row.kind.tag }}</span>
            <InfoLabel v-if="row.topic" :topic="row.topic" label="Dettagli" class="text-body-2 text-medium-emphasis" panel />
          </div>
        </div>
      </VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>

<style scoped>
.notices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.notice {
  display: inline-flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  min-height: 44px;
  padding: 0.25rem 0.75rem;
  border: 1px solid rgb(var(--v-theme-grid));
  border-radius: 999px;
  font-size: 0.875rem;
}

.week {
  border-top: 1px solid rgb(var(--v-theme-grid));
}

.week-role {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid var(--role);
  border-radius: 0 var(--radius-control) var(--radius-control) 0;
  background: rgb(var(--v-theme-subtle));
  font-size: 0.9rem;
}

.plan-row {
  display: grid;
  grid-template-columns: 6px 6rem 1.5rem minmax(0, 1fr);
  gap: 0.75rem;
  align-items: center;
  min-height: 48px;
  padding: 0.5rem 0.5rem 0.5rem 0;
  border-bottom: 1px solid rgb(var(--v-theme-grid));
}

.kind-bar {
  align-self: stretch;
  border-radius: 3px;
}

.plan-row--today {
  border-radius: var(--radius-control);
  background: rgba(var(--section), 0.08);
}

.today {
  display: block;
  color: rgb(var(--section));
}

.plan-row:last-child {
  border-bottom: none;
}

.plan-row--past {
  opacity: 0.6;
}

.plan-title {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.plan-title--link {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: rgb(var(--v-theme-grid));
}

.plan-title--link:hover {
  text-decoration-color: rgb(var(--v-theme-primary));
}
</style>
