<script setup lang="ts">
// Schermata di chi non è collegato a Strava: una scheda al centro con il nome dell'app e
// "Collega Strava"; se nel .env mancano le credenziali, i passi per aggiungerle.
import { VAlert, VBtn, VCard, VCardText } from 'vuetify/components';

defineProps<{ missing: string[] }>();

// Il server di autenticazione manda a Strava e, al ritorno, all'app.
const connect = () => { window.location.href = '/auth/login'; };
</script>

<template>
  <div class="connect">
    <VCard variant="outlined" class="pa-2">
      <VCardText>
        <h1 class="text-h4 mb-2">BikeTR</h1>
        <p class="text-medium-emphasis mb-6">
          Analizza le tue uscite di Strava e ti consiglia l'allenamento di oggi, tutto sul tuo computer.
        </p>
        <template v-if="missing.length">
          <VAlert type="warning" variant="tonal" class="mb-4">
            Nel file <code>.env</code> manca: <b>{{ missing.join(' e ') }}</b>.
          </VAlert>
          <ol class="steps">
            <li>
              Crea un'app su
              <a href="https://www.strava.com/settings/api" target="_blank" rel="noopener">strava.com/settings/api</a>,
              con <b>Authorization Callback Domain</b> <code>localhost</code>.
            </li>
            <li>
              Copia <code>.env.example</code> in <code>.env</code> e scrivi <b>Client ID</b> e <b>Client Secret</b> in
              <code>STRAVA_CLIENT_ID</code> e <code>STRAVA_CLIENT_SECRET</code>.
            </li>
            <li>Esegui <code>docker compose up -d</code> e ricarica questa pagina.</li>
          </ol>
        </template>
        <VBtn v-else color="primary" variant="flat" size="large" class="action" min-height="44" @click="connect">
          Collega Strava
        </VBtn>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.connect {
  max-width: 520px;
  margin: 8vh auto 0;
}

.steps {
  padding-left: 1.25rem;
  line-height: 1.6;
}

.steps li {
  margin-bottom: 0.5rem;
  overflow-wrap: anywhere;
}

a {
  color: rgb(var(--v-theme-primary));
}

code {
  padding: 0.1rem 0.3rem;
  border-radius: 3px;
  background: rgb(var(--v-theme-subtle));
  font-size: 0.85em;
}
</style>
