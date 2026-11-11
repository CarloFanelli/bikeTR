<script setup lang="ts">
// Errore del Coach in una riga: il titolo apre la spiegazione (il messaggio del servizio e,
// per la ricerca dei paper, i comandi in "Dettagli tecnici"). Senza FTP, il link a Impostazioni.
// Il messaggio del servizio si mostra come testo.
import { computed } from 'vue';
import { VAlert, VBtn } from 'vuetify/components';
import type { CoachRefusal } from '../core/coach-types.ts';
import { errorTopic } from '../core/explanations/coach.ts';
import InfoLabel from './InfoLabel.vue';

const props = defineProps<{ refusal: CoachRefusal }>();

const topic = computed(() => errorTopic(props.refusal));
const settings = { name: 'impostazioni' };
</script>

<template>
  <VAlert type="error" variant="tonal" density="comfortable" class="mb-4">
    <div class="d-flex flex-wrap align-center ga-2">
      <InfoLabel :topic="topic" />
      <VBtn
        v-if="refusal.error === 'no_ftp'"
        :to="settings"
        variant="text"
        color="primary"
        class="action"
        min-height="44"
      >
        Vai a Impostazioni
      </VBtn>
    </div>
  </VAlert>
</template>
