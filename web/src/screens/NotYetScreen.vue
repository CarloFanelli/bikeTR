<script setup lang="ts">
// Sezione non ancora rifatta: lo dice e porta alla stessa sezione nell'app di oggi.
import { useRoute } from 'vue-router';
import { VBtn, VCard, VCardActions, VCardText, VCardTitle } from 'vuetify/components';

const route = useRoute();
</script>

<template>
  <VCard max-width="640">
    <VCardTitle>{{ route.meta.title }}</VCardTitle>
    <VCardText>Questa sezione non è ancora nella nuova app: per ora si usa quella di oggi.</VCardText>
    <VCardActions>
      <VBtn color="primary" variant="tonal" :href="route.meta.legacy">Apri nell'app di oggi</VBtn>
    </VCardActions>
  </VCard>
</template>
