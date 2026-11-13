<script setup lang="ts">
// Barra in alto: le sei sezioni, quella aperta nel suo colore (sotto 768 px stanno nella barra
// in basso, e Libreria passa nel menu dell'atleta), l'avanzamento dell'export su ogni schermata
// e il menu dell'atleta con "Aggiorna da Strava", Impostazioni, export e tema.
import { mdiClose, mdiCogOutline, mdiDownload, mdiRefresh } from '@mdi/js';
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { useDisplay, useTheme } from 'vuetify';
import {
  VAppBar, VAvatar, VBtn, VBtnToggle, VChip, VDivider, VList, VListItem, VMenu, VProgressCircular,
} from 'vuetify/components';
import { exportJob, refreshFromStrava, syncJob } from '../app/jobs.ts';
import { SECTIONS, sectionOf } from '../app/sections.ts';
import type { Athlete } from '../core/strava-types.ts';
import { loadThemeChoice, saveThemeChoice, type ThemeChoice } from '../data/storage.ts';
import ExportDialog from './ExportDialog.vue';

const props = defineProps<{ athlete: Athlete }>();

const route = useRoute();
const isActive = (to: string) => sectionOf(route.path)?.to === to;
const LIBRARY = SECTIONS.find(s => s.to === '/libreria');

const { width } = useDisplay();
const compact = computed(() => width.value < 768);

const name = computed(() => `${props.athlete.firstname} ${props.athlete.lastname}`.trim());
const initials = computed(() =>
  [props.athlete.firstname, props.athlete.lastname].map(part => part?.trim()[0] ?? '').join('').toUpperCase());
// Senza foto Strava manda un indirizzo relativo al proprio segnaposto: lì si mostrano le iniziali.
const picture = computed(() => props.athlete.profile?.startsWith('http') ? props.athlete.profile : null);

const theme = useTheme();
const themeChoice = ref<ThemeChoice>(loadThemeChoice());
const THEME_OPTIONS: { value: ThemeChoice; title: string }[] = [
  { value: 'system', title: 'Sistema' },
  { value: 'light', title: 'Chiaro' },
  { value: 'dark', title: 'Scuro' },
];

function chooseTheme(choice: ThemeChoice): void {
  themeChoice.value = choice;
  theme.change(choice);
  saveThemeChoice(choice);
}

const exportOpen = ref(false);
</script>

<template>
  <VAppBar flat border="b" color="surface" height="64">
    <RouterLink to="/home" class="brand ml-4 mr-6">BikeTR</RouterLink>

    <nav v-if="!compact" aria-label="Sezioni" class="d-flex ga-1 flex-grow-1">
      <VBtn
        v-for="s in SECTIONS"
        :key="s.to"
        :to="s.to"
        :active="isActive(s.to)"
        variant="text"
        :color="isActive(s.to) ? s.color : undefined"
        class="action"
        height="44"
      >
        {{ s.title }}
      </VBtn>
    </nav>
    <div v-else class="flex-grow-1" />

    <VChip v-if="exportJob.running" class="mr-2" variant="tonal" color="primary">
      <VProgressCircular :model-value="exportJob.pct ?? 0" size="16" width="2" class="mr-2" />
      Export {{ exportJob.pct ?? 0 }}%
    </VChip>
    <VChip
      v-else-if="exportJob.error"
      class="mr-2"
      color="error"
      variant="tonal"
      closable
      :close-icon="mdiClose"
      close-label="Chiudi l'avviso"
      @click:close="exportJob.error = ''"
    >
      Export non riuscito
    </VChip>

    <VMenu location="bottom end" :close-on-content-click="false">
      <template #activator="{ props: menu }">
        <VBtn v-bind="menu" icon size="48" class="mr-2" :aria-label="`Menu di ${name}`">
          <VAvatar size="36" color="primary" :image="picture ?? undefined">
            <span v-if="!picture" class="text-body-2 font-weight-medium">{{ initials }}</span>
          </VAvatar>
        </VBtn>
      </template>
      <VList min-width="260" max-width="320">
        <VListItem :title="name" subtitle="Collegato a Strava" class="account-name" />
        <VDivider />
        <VListItem
          :prepend-icon="mdiRefresh"
          title="Aggiorna da Strava"
          :subtitle="syncJob.running ? 'Aggiornamento in corso…' : syncJob.result"
          :disabled="syncJob.running"
          :class="{ 'sync-error': syncJob.error }"
          min-height="48"
          @click="refreshFromStrava"
        >
          <template v-if="syncJob.running" #append>
            <VProgressCircular indeterminate size="20" width="2" />
          </template>
        </VListItem>
        <VListItem v-if="compact && LIBRARY" :to="LIBRARY.to" :prepend-icon="LIBRARY.icon" :title="LIBRARY.title" min-height="48" />
        <VListItem to="/impostazioni" :prepend-icon="mdiCogOutline" title="Impostazioni" min-height="48" />
        <VListItem :prepend-icon="mdiDownload" title="Esporta allenamenti" min-height="48" @click="exportOpen = true" />
        <VDivider />
        <div class="px-4 py-3">
          <div class="text-caption text-medium-emphasis mb-2">Tema</div>
          <VBtnToggle
            :model-value="themeChoice"
            mandatory
            divided
            density="comfortable"
            variant="outlined"
            class="w-100"
            @update:model-value="chooseTheme"
          >
            <VBtn v-for="t in THEME_OPTIONS" :key="t.value" :value="t.value" class="flex-grow-1" height="44">{{ t.title }}</VBtn>
          </VBtnToggle>
        </div>
      </VList>
    </VMenu>
  </VAppBar>
  <ExportDialog v-model="exportOpen" />
</template>

<style scoped>
.brand {
  color: rgb(var(--v-theme-on-surface));
  font-family: var(--v-font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.02em;
  text-decoration: none;
}

/* Il risultato di "Aggiorna da Strava", anche lungo, va a capo; un errore in rosso. */
:deep(.v-list-item-subtitle) {
  white-space: normal;
}
.sync-error :deep(.v-list-item-subtitle) {
  color: rgb(var(--v-theme-error));
  opacity: 1;
}

/* Il nome intero, anche lungo, va a capo invece di tagliarsi. */
.account-name :deep(.v-list-item-title) {
  white-space: normal;
}
</style>
