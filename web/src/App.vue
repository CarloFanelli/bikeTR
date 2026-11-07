<script setup lang="ts">
// Guscio dell'app: senza collegamento a Strava solo "Collega Strava";
// collegati, la barra laterale e la sezione dell'indirizzo.
import { RouterView } from 'vue-router';
import { VAlert, VApp, VContainer, VMain, VProgressCircular } from 'vuetify/components';
import { session } from './app/session.ts';
import AppSidebar from './components/AppSidebar.vue';
import ConnectScreen from './screens/ConnectScreen.vue';
</script>

<template>
  <VApp>
    <AppSidebar v-if="session.phase === 'ready' && session.athlete" :athlete="session.athlete" />
    <VMain>
      <VContainer fluid>
        <VAlert v-if="session.notice" type="error" variant="tonal" class="mb-4" closable>{{ session.notice }}</VAlert>
        <div v-if="session.phase === 'loading'" class="d-flex align-center ga-3">
          <VProgressCircular indeterminate size="24" color="primary" />
          Carico i dati da Strava…
        </div>
        <ConnectScreen v-else-if="session.phase === 'connect'" :missing="session.missing" />
        <VAlert v-else-if="session.phase === 'error'" type="error" variant="tonal">{{ session.error }}</VAlert>
        <RouterView v-else />
      </VContainer>
    </VMain>
  </VApp>
</template>
