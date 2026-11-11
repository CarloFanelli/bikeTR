<script setup lang="ts">
// Un consiglio del piano: icona, titolo e dettaglio (al massimo 30 parole sulla pagina).
// "Perché" apre il motivo, il dettaglio intero se tagliato e i numeri da cui nasce. Il
// testo può contenere il nome di un'attività: si mostra com'è scritto.
import { mdiCalendarArrowRight } from '@mdi/js';
import { computed } from 'vue';
import { splitEmoji } from '../core/emoji.ts';
import type { Explanation } from '../core/explanations/types.ts';
import { clipWords } from '../core/text.ts';
import type { DayAdvice } from '../core/training-view.ts';
import CardHeading from './CardHeading.vue';
import InfoLabel from './InfoLabel.vue';
import LineIcon from './LineIcon.vue';

const props = defineProps<{ advice: DayAdvice; rows: [string, string][]; readiness: string | null; compact?: boolean }>();

const title = computed(() => splitEmoji(props.advice.rec.title));
const detail = computed(() => clipWords(props.advice.rec.detail, 30));

const why = computed<Explanation>(() => {
  const { reason, detail: full } = props.advice.rec;
  return {
    title: 'Perché questo allenamento',
    short: reason ? clipWords(reason, 25).visible : 'I numeri da cui nasce il consiglio.',
    lead: [reason, detail.value.clipped ? full : null].filter((line): line is string => !!line),
    // Senza emoji ("🟢 alta" → "alta"); la prontezza con il suo stato ("pronto", "affaticato"…).
    rows: props.rows.map(([label, raw]) => {
      const value = splitEmoji(raw).text;
      return [label, label === 'Prontezza' && props.readiness ? `${value} · ${props.readiness}` : value];
    }),
  };
});
</script>

<template>
  <div>
    <CardHeading v-if="advice.label" :icon="mdiCalendarArrowRight" class="mb-4">{{ advice.label }}</CardHeading>
    <div class="d-flex align-center ga-2">
      <LineIcon v-if="title.icon" :name="title.icon" :size="compact ? 20 : 28" />
      <h2 :class="compact ? 'text-h6' : 'text-h5'">{{ title.text }}</h2>
    </div>
    <p class="detail mt-2 mb-3 text-medium-emphasis">{{ detail.visible }}</p>
    <InfoLabel :topic="why" :label="compact ? 'Perché' : 'Perché questo allenamento'" />
  </div>
</template>

<style scoped>
.detail {
  white-space: pre-line;
}
</style>
