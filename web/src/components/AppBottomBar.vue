<script setup lang="ts">
// Sui telefoni (sotto 768 px) le cinque sezioni principali stanno sempre in basso, con icona e
// nome; quella aperta nel suo colore. Libreria e Impostazioni sono nel menu dell'atleta.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { VBottomNavigation, VBtn, VIcon } from 'vuetify/components';
import { BOTTOM_BAR, sectionOf } from '../app/sections.ts';

const route = useRoute();
const current = computed(() => sectionOf(route.path)?.to);
</script>

<template>
  <VBottomNavigation tag="nav" aria-label="Sezioni" grow border="t" elevation="0" height="64">
    <VBtn
      v-for="s in BOTTOM_BAR"
      :key="s.to"
      :to="s.to"
      :active="current === s.to"
      :color="current === s.to ? s.color : undefined"
      class="action"
      min-width="48"
    >
      <VIcon :icon="s.icon" />
      <span class="text-caption">{{ s.title }}</span>
    </VBtn>
  </VBottomNavigation>
</template>
