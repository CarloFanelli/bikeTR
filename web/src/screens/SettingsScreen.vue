<script setup lang="ts">
// Impostazioni: valori dell'atleta usati da tutte le sezioni, il modello che il Coach
// usa e scollegamento da Strava, in sezioni con titolo. Una modifica fa comparire la barra
// "Salva" / "Annulla"; uscire, ricaricare o scollegarsi con modifiche non salvate chiede conferma.
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import {
  VAlert, VBtn, VCard, VCardActions, VCardText, VCardTitle, VCheckbox, VDialog, VSelect, VSnackbar, VTextField,
} from 'vuetify/components';
import { disconnect, hrProfile, refreshLoads, session } from '../app/session.ts';
import CoachSettingsCard from '../components/CoachSettingsCard.vue';
import DayToggle from '../components/DayToggle.vue';
import InfoLabel from '../components/InfoLabel.vue';
import NumberField from '../components/NumberField.vue';
import { SETTINGS_EXPLANATIONS as EXPLAIN } from '../core/explanations/settings.ts';
import { settingsErrors, settingsForm, settingsFromForm } from '../core/settings.ts';
import { loadSettings, saveSettings } from '../data/storage.ts';

const LTHR_SOURCES = [{ title: 'Dichiarata', value: 'declared' }, { title: 'Stimata', value: 'estimated' }];
const FTP_SOURCES = [{ title: 'Stimata (TSS potenza)', value: 'estimated' }, { title: 'Da frequenza cardiaca (hrTSS)', value: 'hr' }];
const STRENGTH_LEVELS = [
  { title: '1 — Base (circuito × 2)', value: 1 },
  { title: '2 — Intermedio (× 3, varianti)', value: 2 },
  { title: '3 — Avanzato (+ pliometria)', value: 3 },
];

// Le stime vengono da attività e segmenti, non dalle impostazioni: si calcolano una volta.
const estimates = hrProfile();

const form = ref(settingsForm(loadSettings()));
const errors = computed(() => settingsErrors(form.value));
const invalid = computed(() => Object.keys(errors.value).length > 0);

// Quello che "Salva" scriverebbe adesso: diverso dall'ultimo salvato = modifiche in sospeso.
// Tornare a mano al valore salvato fa sparire la barra.
const pending = () => JSON.stringify(settingsFromForm(form.value));
const lastSaved = ref(pending());
const dirty = computed(() => pending() !== lastSaved.value);
const saveError = ref('');
const saved = ref(false);
const saving = ref(false);

async function save(): Promise<void> {
  if (invalid.value || saving.value) return;
  saving.value = true;
  const values = pending();
  const answer = await saveSettings(settingsFromForm(form.value));
  saving.value = false;
  if (!answer.ok) {
    saveError.value = `Non salvato: ${answer.msg} Le modifiche restano sullo schermo.`;
    return;
  }
  lastSaved.value = values;
  saveError.value = '';
  saved.value = true;
  void refreshLoads();
}

function cancel(): void {
  form.value = settingsForm(loadSettings());
  lastSaved.value = pending();
  saveError.value = '';
}

// La conferma prima di perdere le modifiche: il router aspetta la risposta.
const leaving = ref(false);
let answer: ((leave: boolean) => void) | null = null;
function askLeave(): Promise<boolean> {
  leaving.value = true;
  return new Promise((resolve) => { answer = resolve; });
}
function reply(leave: boolean): void {
  leaving.value = false;
  answer?.(leave);
  answer = null;
}

onBeforeRouteLeave(() => !dirty.value || askLeave());

// Ricaricare o chiudere la scheda: l'avviso del browser.
function beforeUnload(e: BeforeUnloadEvent): void {
  if (dirty.value) e.preventDefault();
}
onMounted(() => window.addEventListener('beforeunload', beforeUnload));
onBeforeUnmount(() => window.removeEventListener('beforeunload', beforeUnload));

// Scollegarsi non cambia sezione, quindi la conferma del router non scatta: la chiede qui.
const disconnecting = ref(false);
async function disconnectStrava(): Promise<void> {
  if (dirty.value && !(await askLeave())) return;
  disconnecting.value = true;
  await disconnect();
}
</script>

<template>
  <div class="settings" :class="{ 'with-bar': dirty }">
    <header class="mb-6">
      <h1 class="text-h4">Impostazioni</h1>
      <p class="text-medium-emphasis mt-1">
        <InfoLabel :topic="EXPLAIN.goal" label="Obiettivo: migliorare soglia e FTP" />
      </p>
    </header>

    <section class="section">
      <h2 class="section-title">Soglie</h2>
      <div class="fields">
        <NumberField v-model="form.hrMax" field="hrMax" :error="errors.hrMax" />
        <NumberField v-model="form.hrLthr" field="hrLthr" placeholder="es. 173" :error="errors.hrLthr" />
        <VTextField label="LTHR stimata (da attività)" :model-value="estimates.lthrEst ?? ''" placeholder="—" readonly />
        <VSelect v-model="form.lthrSource" label="Sorgente LTHR" :items="LTHR_SOURCES" />
        <NumberField v-model="form.ftpDeclared" field="ftpDeclared" placeholder="es. 220" :error="errors.ftpDeclared" />
        <VTextField label="FTP stimata (da attività)" :model-value="estimates.ftpEst ?? ''" placeholder="—" readonly />
        <VSelect v-model="form.ftpSource" label="Sorgente FTP (se non dichiarata)" :items="FTP_SOURCES" />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Volume</h2>
      <div class="fields">
        <NumberField v-model="form.weeklyHours" field="weeklyHours" :error="errors.weeklyHours" />
        <NumberField v-model="form.weeklyDays" field="weeklyDays" :error="errors.weeklyDays" />
        <NumberField v-model="form.longRides" field="longRides" :error="errors.longRides" />
        <NumberField v-model="form.weight" field="weight" :error="errors.weight" />
        <VSelect v-model="form.strengthLevel" label="Livello corpo libero" :items="STRENGTH_LEVELS" />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Disponibilità</h2>
      <div class="mb-2"><InfoLabel :topic="EXPLAIN.availableDays" /></div>
      <DayToggle v-model="form.availableDays" class="mb-5" />
      <div class="mb-2"><InfoLabel :topic="EXPLAIN.longRideDays" /></div>
      <DayToggle v-model="form.longRideDays" class="mb-5" />
      <NumberField
        v-model="form.longRideMaxMin"
        field="longRideMaxMin"
        placeholder="es. 240 = 4h"
        :help="EXPLAIN.longRideMaxMin"
        :error="errors.longRideMaxMin"
        class="narrow"
      />
    </section>

    <section class="section">
      <h2 class="section-title"><InfoLabel :topic="EXPLAIN.race" /></h2>
      <div class="fields">
        <VTextField v-model="form.raceDate" type="date" label="Data della gara o dell'evento" />
        <VTextField v-model="form.raceName" label="Nome dell'evento" maxlength="40" placeholder="es. Granfondo X" />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title"><InfoLabel :topic="EXPLAIN.recovery" /></h2>
      <VCheckbox
        v-model="form.hasCompression"
        label="Ho la pressoterapia (compressione pneumatica intermittente)"
        density="comfortable"
        hide-details
      />
      <VCheckbox
        v-model="form.hasMassageGun"
        label="Ho il massage gun (Theragun, Hypervolt o simili)"
        density="comfortable"
        hide-details
      />
    </section>

    <CoachSettingsCard class="section" />

    <section class="section">
      <h2 class="section-title">Strava</h2>
      <p class="mb-3">Collegato come {{ session.athlete?.firstname }} {{ session.athlete?.lastname }}.</p>
      <VBtn color="error" variant="tonal" class="action" min-height="44" :loading="disconnecting" @click="disconnectStrava">
        Disconnetti da Strava
      </VBtn>
    </section>

    <div v-if="dirty" class="save-bar" role="region" aria-label="Modifiche non salvate">
      <span class="flex-grow-1 text-body-2" :class="saveError ? 'text-error' : 'text-medium-emphasis'" aria-live="polite">
        {{ saveError || (invalid ? 'Correggi i campi segnati per salvare.' : 'Modifiche non salvate.') }}
      </span>
      <VBtn variant="text" class="action" min-height="44" @click="cancel">Annulla</VBtn>
      <VBtn color="primary" variant="flat" class="action" min-height="44" :disabled="invalid" :loading="saving" @click="save">
        Salva
      </VBtn>
    </div>

    <VSnackbar v-model="saved" :timeout="3000" color="success">Impostazioni salvate.</VSnackbar>

    <VDialog v-model="leaving" max-width="420" persistent>
      <VCard>
        <VCardTitle class="text-wrap">Modifiche non salvate</VCardTitle>
        <VCardText>Se esci adesso, le modifiche a queste impostazioni si perdono.</VCardText>
        <VCardActions class="flex-wrap justify-end">
          <VBtn variant="text" class="action" min-height="44" @click="reply(true)">Esci senza salvare</VBtn>
          <VBtn color="primary" variant="flat" class="action" min-height="44" @click="reply(false)">Resta</VBtn>
        </VCardActions>
      </VCard>
    </VDialog>
  </div>
</template>

<style scoped>
.settings {
  max-width: 880px;
  margin: 0 auto;
}

.section {
  padding: 1.5rem 0;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.section-title {
  margin-bottom: 1rem;
  font-family: var(--v-font-heading);
  font-size: 1.25rem;
  font-weight: 600;
  letter-spacing: -0.01em;
}

.fields {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 240px), 1fr));
  gap: 0 1rem;
}

.narrow {
  max-width: 320px;
}

/* La barra resta in fondo allo schermo mentre si scorre, e alla fine della pagina occupa il
   suo posto: l'ultimo campo non resta mai coperto. */
.save-bar {
  position: sticky;
  bottom: 0;
  z-index: 2;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  margin-top: 1rem;
  padding: 0.75rem 1rem;
  border: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
  border-radius: var(--radius-panel);
  background: rgb(var(--v-theme-surface));
  box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.08);
}
</style>
