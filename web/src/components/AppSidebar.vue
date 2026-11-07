<script setup lang="ts">
// Barra laterale: le cinque sezioni in alto; Impostazioni, stato di Strava e il tasto
// che la riduce a icone in basso. Ridotta, ogni voce mostra il nome al passaggio del mouse.
import {
  mdiBike, mdiChartLine, mdiCheckCircleOutline, mdiChevronDoubleLeft, mdiChevronDoubleRight, mdiCogOutline,
  mdiFormatListBulleted, mdiHomeOutline, mdiRobotOutline, mdiTarget,
} from '@mdi/js';
import { computed, ref } from 'vue';
import { VList, VListItem, VNavigationDrawer, VTooltip } from 'vuetify/components';
import type { Athlete } from '../core/strava-types.ts';
import { loadSidebarCollapsed, saveSidebarCollapsed } from '../data/storage.ts';

const props = defineProps<{ athlete: Athlete }>();

interface SidebarItem {
  title: string;
  icon: string;
  to?: string;
  subtitle?: string;
  // Testo al passaggio del mouse anche a barra espansa.
  hint?: string;
  onClick?: () => void;
}

const collapsed = ref(loadSidebarCollapsed());

function toggle(): void {
  collapsed.value = !collapsed.value;
  saveSidebarCollapsed(collapsed.value);
}

const sections: SidebarItem[] = [
  { title: 'Home', icon: mdiHomeOutline, to: '/home' },
  { title: 'Allenamento', icon: mdiTarget, to: '/allenamento' },
  { title: 'Analisi', icon: mdiChartLine, to: '/analisi' },
  { title: 'Attività', icon: mdiFormatListBulleted, to: '/attivita' },
  { title: 'Coach AI', icon: mdiRobotOutline, to: '/coach' },
];

const bottom = computed<SidebarItem[]>(() => {
  const name = `${props.athlete.firstname} ${props.athlete.lastname}`.trim();
  return [
    { title: 'Impostazioni', icon: mdiCogOutline, to: '/impostazioni' },
    // Un nome lungo si taglia con "…": intero al passaggio del mouse.
    { title: name, subtitle: 'Collegato a Strava', icon: mdiCheckCircleOutline, hint: `Collegato a Strava come ${name}` },
    collapsed.value
      ? { title: 'Espandi', icon: mdiChevronDoubleRight, hint: 'Espandi la barra', onClick: toggle }
      : { title: 'Riduci a icone', icon: mdiChevronDoubleLeft, onClick: toggle },
  ];
});
</script>

<template>
  <VNavigationDrawer permanent :rail="collapsed">
    <template #prepend>
      <VListItem :prepend-icon="mdiBike" title="BikeTR" class="text-primary font-weight-bold" />
    </template>
    <VList nav class="d-flex flex-column h-100">
      <VTooltip
        v-for="(item, i) in [...sections, ...bottom]"
        :key="item.title + i"
        :text="item.hint ?? item.title"
        location="end"
        :disabled="!collapsed && !item.hint"
      >
        <template #activator="{ props: tooltip }">
          <VListItem
            v-bind="tooltip"
            :class="{ 'mt-auto': i === sections.length }"
            :to="item.to"
            :prepend-icon="item.icon"
            :title="item.title"
            :subtitle="item.subtitle"
            @click="item.onClick"
          />
        </template>
      </VTooltip>
    </VList>
  </VNavigationDrawer>
</template>
