<script setup lang="ts">
// Schermata di chi non è collegato a Strava: dice quali credenziali mancano nel .env,
// altrimenti offre "Collega Strava".
import { VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle } from 'vuetify/components';

defineProps<{ missing: string[] }>();

// Il server di autenticazione manda a Strava e, al ritorno, all'app.
const connect = () => { window.location.href = '/auth/login'; };
</script>

<template>
  <VCard max-width="720">
    <VCardTitle>Collega Strava</VCardTitle>
    <VCardText v-if="missing.length">
      <VAlert type="warning" variant="tonal" class="mb-4">
        Nel file <code>.env</code> manca: <b>{{ missing.join(' e ') }}</b>.
      </VAlert>
      <ol class="ml-5">
        <li>
          Vai su <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a>
          e crea un'app; come <b>Authorization Callback Domain</b> metti <code>localhost</code>.
        </li>
        <li>
          Nella cartella del progetto copia <code>.env.example</code> in <code>.env</code> (se non c'è già) e scrivi
          <b>Client ID</b> e <b>Client Secret</b> in <code>STRAVA_CLIENT_ID</code> e <code>STRAVA_CLIENT_SECRET</code>.
        </li>
        <li>Esegui di nuovo <code>docker compose up -d</code> e ricarica questa pagina.</li>
      </ol>
    </VCardText>
    <VCardActions v-else>
      <VBtn color="primary" variant="flat" @click="connect">Collega Strava</VBtn>
    </VCardActions>
  </VCard>
</template>
