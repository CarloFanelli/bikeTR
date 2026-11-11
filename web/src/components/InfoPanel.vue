<script setup lang="ts">
// Il pannello delle spiegazioni: da destra, con la pagina visibile accanto, da 768 px in
// su; a schermo intero sotto. I link (paper citati) si mostrano come testo, mai come HTML. Si chiude con Esc, la X o un clic fuori, e cambiando sezione.
import { mdiClose } from '@mdi/js';
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import {
  VBtn, VCard, VDialog, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle, VNavigationDrawer,
} from 'vuetify/components';
import { closeInfoPanel, infoPanel } from '../app/info-panel.ts';
import MetricGrid from './MetricGrid.vue';

const { width } = useDisplay();
const compact = computed(() => width.value < 768);

const open = computed({
  get: () => infoPanel.topic !== null,
  set: (value: boolean) => { if (!value) closeInfoPanel(); },
});

const route = useRoute();
watch(() => route.path, () => closeInfoPanel({ restoreFocus: false }));

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && infoPanel.topic) closeInfoPanel();
}
onMounted(() => window.addEventListener('keydown', onKey));
onBeforeUnmount(() => window.removeEventListener('keydown', onKey));
</script>

<template>
  <component
    :is="compact ? VDialog : VNavigationDrawer"
    v-model="open"
    v-bind="compact ? { fullscreen: true, scrollable: true } : { location: 'right', temporary: true, width: 400 }"
  >
    <VCard v-if="infoPanel.topic" flat class="info-panel h-100 d-flex flex-column" role="dialog" :aria-label="infoPanel.topic.title">
      <div class="d-flex align-center justify-space-between pa-5 pb-2">
        <h2 class="panel-title">{{ infoPanel.topic.title }}</h2>
        <VBtn :icon="mdiClose" variant="text" size="44" aria-label="Chiudi" @click="closeInfoPanel()" />
      </div>
      <div class="panel-body px-5 pb-6">
        <p v-for="line in infoPanel.topic.lead" :key="line" class="mb-3">{{ line }}</p>
        <ul v-if="infoPanel.topic.links?.length" class="links my-4">
          <li v-for="link in infoPanel.topic.links" :key="link.url">
            <a :href="link.url" target="_blank" rel="noopener">{{ link.label }}</a>
            <div v-if="link.note" class="text-medium-emphasis text-body-2">{{ link.note }}</div>
            <blockquote v-for="quote in link.quotes" :key="quote" class="quote text-body-2">{{ quote }}</blockquote>
          </li>
        </ul>
        <MetricGrid v-if="infoPanel.topic.rows?.length" :items="infoPanel.topic.rows" class="my-4" />
        <VExpansionPanels v-if="infoPanel.topic.technical" variant="accordion" class="mt-2">
          <VExpansionPanel elevation="0">
            <VExpansionPanelTitle>Dettagli tecnici</VExpansionPanelTitle>
            <VExpansionPanelText class="text-body-2">
              <p v-for="line in infoPanel.topic.technical" :key="line" class="mb-2">{{ line }}</p>
            </VExpansionPanelText>
          </VExpansionPanel>
        </VExpansionPanels>
      </div>
    </VCard>
  </component>
</template>

<style scoped>
.panel-title {
  font-family: var(--v-font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.links {
  padding-left: 0;
  list-style: none;
}

.links li {
  margin-bottom: 1rem;
}

.links a {
  color: rgb(var(--v-theme-primary));
}

.quote {
  margin: 0.4rem 0 0;
  padding-left: 0.75rem;
  border-left: 2px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.panel-body {
  overflow-y: auto;
  line-height: 1.6;
}
</style>
