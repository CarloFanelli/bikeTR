<script setup lang="ts">
// Sezione non ancora rifatta: lo dice e porta alla stessa sezione nell'app di oggi.
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { VBtn, VCard, VCardActions, VCardText, VCardTitle } from 'vuetify/components';

const route = useRoute();
const legacyLink = computed(() => (route.params.id
  ? `${route.meta.legacy}?id=${encodeURIComponent(String(route.params.id))}`
  : route.meta.legacy));
</script>

<template>
  <VCard max-width="640">
    <VCardTitle>{{ route.meta.title }}</VCardTitle>
    <VCardText>Questa sezione non è ancora nella nuova app: per ora si usa quella di oggi.</VCardText>
    <VCardActions>
      <VBtn color="primary" variant="tonal" :href="legacyLink">Apri nell'app di oggi</VBtn>
    </VCardActions>
  </VCard>
</template>
