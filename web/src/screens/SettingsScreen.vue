<script setup lang="ts">
// Impostazioni: valori dell'atleta usati da tutte le sezioni, modello
// del Coach e scollegamento da Strava. Uscire con modifiche non salvate chiede conferma.
import { computed, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  VAlert, VBtn, VCard, VCardText, VCardTitle, VCheckbox, VCol, VRow, VSelect, VTextField,
} from 'vuetify/components';
import { disconnect, hrProfile, session } from '../app/session.ts';
import CoachSettingsCard from '../components/CoachSettingsCard.vue';
import DayToggle from '../components/DayToggle.vue';
import NumberField from '../components/NumberField.vue';
import { settingsErrors, settingsForm, settingsFromForm } from '../core/settings.ts';
import { COACH_DEFAULT_MODEL } from '../data/coach.ts';
import { loadCoachSettings, loadSettings, saveCoachSettings, saveSettings } from '../data/storage.ts';

const LTHR_SOURCES = [{ title: 'Dichiarata', value: 'declared' }, { title: 'Stimata', value: 'estimated' }];
const FTP_SOURCES = [{ title: 'Stimata (TSS potenza)', value: 'estimated' }, { title: 'HR-based (hrTSS)', value: 'hr' }];
const STRENGTH_LEVELS = [
  { title: '1 — Base (circuito × 2)', value: 1 },
  { title: '2 — Intermedio (× 3, varianti)', value: 2 },
  { title: '3 — Avanzato (+ pliometria)', value: 3 },
];

// Le stime vengono da attività e segmenti, non dalle impostazioni: si calcolano una volta.
const estimates = hrProfile();

const form = ref(settingsForm(loadSettings()));
const model = ref(loadCoachSettings().model || COACH_DEFAULT_MODEL);
const errors = computed(() => settingsErrors(form.value));
const status = ref<{ type: 'success' | 'error'; text: string } | null>(null);

// Quello che "Salva impostazioni" scriverebbe adesso: diverso dall'ultimo salvato = modifiche in sospeso.
const pending = () => JSON.stringify([settingsFromForm(form.value), model.value.trim() || COACH_DEFAULT_MODEL]);
const lastSaved = ref(pending());

function save(): void {
  const problems = Object.values(errors.value);
  if (problems.length) {
    status.value = { type: 'error', text: `Non salvato. ${problems.join(' ')}` };
    return;
  }
  saveSettings(settingsFromForm(form.value));
  saveCoachSettings({ model: model.value.trim() || COACH_DEFAULT_MODEL });
  lastSaved.value = pending();
  status.value = { type: 'success', text: 'Impostazioni salvate.' };
}

onBeforeRouteLeave(() => pending() === lastSaved.value || window.confirm('Modifiche non salvate: uscire comunque?'));

const disconnecting = ref(false);
async function disconnectStrava(): Promise<void> {
  disconnecting.value = true;
  await disconnect();
}
</script>

<template>
  <div class="d-flex flex-column ga-4">
    <VCard>
      <VCardTitle>Zone e soglie</VCardTitle>
      <VCardText>
        <VRow>
          <VCol cols="12" sm="6" lg="4"><NumberField v-model="form.hrMax" field="hrMax" :error="errors.hrMax" /></VCol>
          <VCol cols="12" sm="6" lg="4">
            <NumberField v-model="form.hrLthr" field="hrLthr" placeholder="es. 173" :error="errors.hrLthr" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <VTextField label="LTHR stimata (da attività)" :model-value="estimates.lthrEst ?? ''" placeholder="—" readonly />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <VSelect v-model="form.lthrSource" label="Sorgente LTHR" :items="LTHR_SOURCES" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <NumberField v-model="form.ftpDeclared" field="ftpDeclared" placeholder="es. 220" :error="errors.ftpDeclared" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <VTextField label="FTP stimata (da attività)" :model-value="estimates.ftpEst ?? ''" placeholder="—" readonly />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <VSelect v-model="form.ftpSource" label="Sorgente FTP (se non dichiarata)" :items="FTP_SOURCES" />
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>Volume settimanale</VCardTitle>
      <VCardText>
        <VRow>
          <VCol cols="12" sm="6" lg="4">
            <NumberField v-model="form.weeklyHours" field="weeklyHours" :error="errors.weeklyHours" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <NumberField v-model="form.weeklyDays" field="weeklyDays" :error="errors.weeklyDays" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <NumberField v-model="form.longRides" field="longRides" :error="errors.longRides" />
          </VCol>
          <VCol cols="12" sm="6" lg="4"><NumberField v-model="form.weight" field="weight" :error="errors.weight" /></VCol>
          <VCol cols="12" sm="6" lg="4">
            <VSelect v-model="form.strengthLevel" label="Livello corpo libero" :items="STRENGTH_LEVELS" />
          </VCol>
        </VRow>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>Disponibilità settimanale</VCardTitle>
      <VCardText>
        <div class="mb-1">Giorni disponibili per allenarmi</div>
        <DayToggle v-model="form.availableDays" />
        <div class="text-caption text-medium-emphasis mt-1 mb-4">
          Toggle per ciascun giorno. I giorni non spuntati saranno auto-marcati come riposo nel piano.
        </div>
        <div class="mb-1">Giorni per uscita lunga</div>
        <DayToggle v-model="form.longRideDays" />
        <div class="text-caption text-medium-emphasis mt-1 mb-4">
          Default sabato. Solo i giorni qui spuntati possono essere LONG nel piano settimanale.
        </div>
        <NumberField
          v-model="form.longRideMaxMin"
          field="longRideMaxMin"
          placeholder="es. 240 = 4h"
          hint="Il workout LONG sarà scalato a questa durata (default 180 min se vuoto)."
          :error="errors.longRideMaxMin"
          class="settings-narrow"
        />
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>Gara / evento (opzionale)</VCardTitle>
      <VCardText>
        <VRow>
          <VCol cols="12" sm="6" lg="4">
            <VTextField v-model="form.raceDate" type="date" label="Data gara / evento principale" />
          </VCol>
          <VCol cols="12" sm="6" lg="4">
            <VTextField v-model="form.raceName" label="Nome evento (opzionale)" maxlength="40" placeholder="es. Granfondo X" />
          </VCol>
        </VRow>
        <div class="text-caption text-medium-emphasis">
          Se compilato, le 3 settimane prima diventano fase di taper (Mujika 2018): volume −20% / −40% / −55%,
          intensità mantenuta.
        </div>
      </VCardText>
    </VCard>

    <VCard>
      <VCardTitle>Recovery tools (opzionale)</VCardTitle>
      <VCardText>
        <VCheckbox
          v-model="form.hasCompression"
          label="Ho la pressoterapia (compressione pneumatica intermittente)"
          density="compact"
          hide-details
        />
        <VCheckbox
          v-model="form.hasMassageGun"
          label="Ho il massage gun (Theragun/Hypervolt o simili)"
          density="compact"
          hide-details
        />
        <div class="text-caption text-medium-emphasis mt-2">
          Se attivi, i giorni RECOVERY/REST/MOBILITY e il post-sessione di HARD/LONG includeranno le note per usarli.
          Funzionano su sistemi diversi (compressione = drenaggio venoso/linfatico, percussione = tono muscolare
          locale): combinarli è plausibilmente additivo. Caveat: il massage gun NON va usato immediatamente prima di
          sessioni di sprint/forza esplosiva (depressione temporanea del pre-load neuromuscolare documentata).
        </div>
      </VCardText>
    </VCard>

    <CoachSettingsCard v-model="model" />

    <div>
      <VBtn color="primary" variant="flat" @click="save">Salva impostazioni</VBtn>
      <VAlert v-if="status" :type="status.type" variant="tonal" class="mt-3">{{ status.text }}</VAlert>
      <p class="text-medium-emphasis mt-3">
        Obiettivo corrente: <b>migliorare soglia/FTP</b>. Il consiglio tiene conto di carico degli ultimi 7/28 giorni e
        recupero.
      </p>
    </div>

    <VCard>
      <VCardTitle>Strava</VCardTitle>
      <VCardText>
        <p class="mb-3">Collegato come {{ session.athlete?.firstname }} {{ session.athlete?.lastname }}.</p>
        <VBtn color="error" variant="tonal" :loading="disconnecting" @click="disconnectStrava">Disconnetti da Strava</VBtn>
      </VCardText>
    </VCard>
  </div>
</template>

<style scoped>
.settings-narrow {
  max-width: 320px;
}
</style>
