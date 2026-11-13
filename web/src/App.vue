<script setup lang="ts">
// Guscio dell'app: senza collegamento a Strava solo "Collega Strava";
// collegati, la barra in alto e la sezione dell'indirizzo. Mentre i dati arrivano da Strava,
// la forma della schermata in card grigie. Il contenuto porta il colore della sezione aperta.
// Sui telefoni le sezioni stanno nella barra in basso.
import { computed } from 'vue';
import { RouterView, useRoute } from 'vue-router';
import { useDisplay } from 'vuetify';
import { VAlert, VApp, VContainer, VMain } from 'vuetify/components';
import { sectionOf } from './app/sections.ts';
import { session, startSession } from './app/session.ts';
import AppBottomBar from './components/AppBottomBar.vue';
import AppTopBar from './components/AppTopBar.vue';
import ErrorNotice from './components/ErrorNotice.vue';
import InfoPanel from './components/InfoPanel.vue';
import LoadingPlaceholder from './components/LoadingPlaceholder.vue';
import ConnectScreen from './screens/ConnectScreen.vue';

const route = useRoute();
const section = computed(() => sectionOf(route.path)?.color);
const { width } = useDisplay();
const phone = computed(() => width.value < 768);
</script>

<template>
  <VApp>
    <AppTopBar v-if="session.phase === 'ready' && session.athlete" :athlete="session.athlete" />
    <AppBottomBar v-if="session.phase === 'ready' && session.athlete && phone" />
    <VMain :class="section">
      <VContainer fluid>
        <VAlert v-if="session.notice" type="error" variant="tonal" class="mb-4" closable>{{ session.notice }}</VAlert>
        <VAlert
          v-if="session.phase === 'ready' && session.syncNotice"
          type="warning"
          variant="tonal"
          class="mb-4"
          closable
          @click:close="session.syncNotice = null"
        >
          {{ session.syncNotice }}
        </VAlert>
        <LoadingPlaceholder v-if="session.phase === 'loading'" />
        <ConnectScreen v-else-if="session.phase === 'connect'" :missing="session.missing" />
        <ErrorNotice
          v-else-if="session.phase === 'error'"
          summary="Non riesco a leggere i tuoi dati. Le sezioni restano vuote finché la lettura non riesce."
          :detail="session.error"
          retry
          @retry="startSession"
        />
        <RouterView v-else />
      </VContainer>
    </VMain>
    <InfoPanel />
  </VApp>
</template>
