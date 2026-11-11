<script setup lang="ts">
// Un'etichetta sottolineata a puntini: clic, tocco o Invio aprono la spiegazione breve
// accanto; "Approfondisci" apre il pannello laterale sullo stesso argomento. Con `panel` il
// clic apre subito il pannello, senza la spiegazione breve (i "Dettagli" del piano). Una "i"
// cerchiata dopo il testo dice che si può aprire: resta sulla riga dell'ultima parola.
import { mdiInformationOutline } from '@mdi/js';
import { computed, ref } from 'vue';
import { VBtn, VCard, VCardText, VIcon, VMenu } from 'vuetify/components';
import { openInfoPanel } from '../app/info-panel.ts';
import type { Explanation } from '../core/explanations/types.ts';

const props = defineProps<{ topic: Explanation; label?: string; panel?: boolean }>();

const open = ref(false);
// Il testo diviso prima dell'ultima parola: l'ultima e la "i" non vanno mai a capo separate.
const text = computed(() => {
  const full = props.label ?? props.topic.title;
  const cut = full.lastIndexOf(' ') + 1;
  return { head: full.slice(0, cut), last: full.slice(cut) };
});
const button = ref<HTMLButtonElement | null>(null);

function more(): void {
  open.value = false;
  openInfoPanel(props.topic, button.value);
}
</script>

<template>
  <button v-if="panel" ref="button" type="button" class="info-label" @click="more">
    {{ text.head }}<span class="last">{{ text.last }}<VIcon :icon="mdiInformationOutline" size="0.9em" class="info-i" /></span>
  </button>
  <VMenu v-else v-model="open" location="bottom start" max-width="320" :close-on-content-click="false">
    <template #activator="{ props: menu }">
      <button ref="button" v-bind="menu" type="button" class="info-label">
        {{ text.head }}<span class="last">{{ text.last }}<VIcon :icon="mdiInformationOutline" size="0.9em" class="info-i" /></span>
      </button>
    </template>
    <VCard>
      <VCardText class="text-body-2 pb-2">{{ topic.short }}</VCardText>
      <div v-if="topic.lead" class="px-2 pb-2">
        <VBtn variant="text" color="primary" size="small" class="action" @click="more">Approfondisci</VBtn>
      </div>
    </VCard>
  </VMenu>
</template>

<style scoped>
.info-label {
  padding: 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  text-align: inherit;
  text-decoration: underline dotted;
  text-decoration-color: rgb(var(--v-theme-muted));
  text-underline-offset: 0.2em;
  cursor: pointer;
}

.info-label:hover,
.info-label:focus-visible {
  text-decoration-color: rgb(var(--v-theme-primary));
}

.last {
  white-space: nowrap;
}

.info-i {
  margin-left: 0.2em;
  vertical-align: -0.1em;
  opacity: 0.75;
}
</style>
