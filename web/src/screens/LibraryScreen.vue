<script setup lang="ts">
// Libreria: i paper che il Coach cerca, con cosa ne dipende. Da 1280 px l'elenco sta in una colonna
// a sinistra (25%) e il paper scelto si legge a destra (75%), ognuno con il suo scorrimento; più
// stretto l'elenco e il paper si alternano a tutta larghezza. Il paper aperto sta nell'indirizzo
// (/libreria/27175601); i suoi passaggi si chiedono aprendolo, come il Coach li legge e li cita.
// "Aggiungi un paper", in cima all'elenco, apre nell'area di lettura (/libreria/aggiungi) l'aggiunta:
// per PMID, o per parole del titolo o degli autori cercate su PubMed tramite il servizio del Coach,
// scegliendo tra i paper trovati. Prima l'anteprima, poi la conferma, che lo scarica di nuovo, lo indicizza, lo salva e
// lo apre. Un paper si toglie dopo una conferma che nomina chi lo perde; un paper di
// base tolto si ripristina dall'elenco.
import { mdiArrowLeft, mdiPlus } from '@mdi/js';
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useDisplay } from 'vuetify';
import { VAlert, VBtn, VCard, VCardText } from 'vuetify/components';
import { splitEmoji } from '../core/emoji.ts';
import type { Library, LibraryPaper, LibraryPassages, PaperMatch, PaperPreview } from '../core/library-types.ts';
import AddPaperPanel from '../components/AddPaperPanel.vue';
import ErrorNotice from '../components/ErrorNotice.vue';
import LineIcon from '../components/LineIcon.vue';
import PaperList from '../components/PaperList.vue';
import PaperReader from '../components/PaperReader.vue';
import { ADD_PAGE, addedLine, isPmid, paperAt, pmidError, removalQuestion } from '../core/library-view.ts';
import {
  addPaper, libraryPapers, libraryPassages, previewPaper, removePaper, restorePaper, searchPapers, type CoachAnswer,
} from '../data/coach.ts';

const route = useRoute();
const router = useRouter();
const { width } = useDisplay();
const wide = computed(() => width.value >= 1280);

const papers = ref<CoachAnswer<Library> | null>(null);
// I passaggi dei paper già aperti, per PMID: si chiedono una volta sola.
const passages = reactive<Record<string, CoachAnswer<LibraryPassages>>>({});

onMounted(async () => {
  papers.value = await libraryPapers();
});

// Il paper aperto: undefined senza un PMID nell'indirizzo o mentre la libreria arriva, null se il
// PMID non è tra i paper che il Coach cerca.
const openPmid = computed(() => (typeof route.params.pmid === 'string' ? route.params.pmid : undefined));
const library = computed(() => (papers.value?.ok ? papers.value.value : null));
const current = computed(() => (library.value ? paperAt(library.value.papers, openPmid.value) : undefined));
const adding = computed(() => openPmid.value === ADD_PAGE);
// Stretto, l'area di lettura prende il posto dell'elenco quando mostra un paper o l'aggiunta.
const reading = computed(() => !!current.value || adding.value);

watch(() => current.value?.pmid, async (pmid) => {
  if (!pmid || passages[pmid]?.ok) return;
  passages[pmid] = await libraryPassages(pmid);
}, { immediate: true });

// Stretto, l'elenco e il paper condividono lo scorrimento della finestra: aprendo un paper si
// ricorda dove stava l'elenco, e tornando all'elenco si riparte da lì.
let listScroll = 0;
watch(() => !wide.value && reading.value, async (reading, wasReading) => {
  if (reading && !wasReading) {
    listScroll = window.scrollY;
    window.scrollTo(0, 0);
  } else if (!reading && wasReading) {
    await nextTick();
    window.scrollTo(0, listScroll);
  }
});

const pmid = ref('');
const preview = ref<PaperPreview | null>(null);
// L'esito dell'ultima azione: un rifiuto o il paper aggiunto.
const outcome = ref('');
const busy = ref(false);

// Un paper di base tolto non si aggiunge di nuovo: si ripristina.
const removedTyped = computed(() => library.value?.removed.find((p) => p.pmid === pmid.value.trim()) ?? null);

// L'ultima ricerca per parole, con il testo cercato. Ogni ricerca ha il suo numero: la risposta di
// una ricerca superata da un'altra non si mostra.
const found = ref<{ query: string; answer: CoachAnswer<PaperMatch[]> } | null>(null);
let searches = 0;

async function lookUp() {
  const text = pmid.value.trim();
  if (!text) return;
  preview.value = null;
  outcome.value = '';
  if (!isPmid(text)) return findWords(text);
  // La ricerca per parole ancora in corso è abbandonata: non tiene più occupato il campo.
  searches++;
  busy.value = false;
  found.value = null;
  return previewOf(text);
}

async function findWords(query: string) {
  const search = ++searches;
  busy.value = true;
  const answer = await searchPapers(query);
  if (search !== searches) return;
  busy.value = false;
  found.value = { query, answer };
}

// Annullando l'anteprima di un paper trovato restano i risultati della stessa ricerca.
async function previewOf(target: string) {
  outcome.value = pmidError(target) ?? '';
  if (outcome.value || removedTyped.value) return;
  busy.value = true;
  const answer = await previewPaper(target);
  busy.value = false;
  if (answer.ok) preview.value = answer.value;
  else outcome.value = answer.msg;
}

async function confirm() {
  if (!preview.value) return;
  busy.value = true;
  const answer = await addPaper(preview.value.pmid);
  busy.value = false;
  preview.value = null;
  outcome.value = answer.ok ? addedLine(answer.value) : answer.msg;
  if (answer.ok) {
    pmid.value = '';
    found.value = null;
    papers.value = await libraryPapers();
    await router.push(`/libreria/${answer.value.pmid}`);
  }
}

// Il paper tolto è quello aperto: lasciata la libreria, la pagina torna all'elenco.
async function remove(p: LibraryPaper) {
  if (!window.confirm(removalQuestion(p))) return;
  const answer = await removePaper(p.pmid);
  outcome.value = answer.ok ? '' : answer.msg;
  if (answer.ok) await router.replace('/libreria');
  papers.value = await libraryPapers();
}

async function restore(target: string) {
  const answer = await restorePaper(target);
  outcome.value = answer.ok ? '' : answer.msg;
  if (target === pmid.value.trim()) pmid.value = '';
  papers.value = await libraryPapers();
}

// L'esito di un'aggiunta comincia con un'emoji: sulla pagina diventa un'icona.
const outcomeLine = computed(() => splitEmoji(outcome.value));
</script>

<template>
  <div class="library page-wide" :class="{ wide }">
    <header class="mb-4">
      <h1 class="text-h4">Libreria</h1>
      <p class="text-medium-emphasis mt-1">I paper in cui il Coach cerca i passaggi da dare al modello.</p>
    </header>

    <p v-if="outcome" class="d-flex align-center ga-2 mb-4">
      <LineIcon v-if="outcomeLine.icon" :name="outcomeLine.icon" :size="18" />
      <span>{{ outcomeLine.text }}</span>
    </p>

    <p v-if="current === null" class="mb-4">Questo paper non è nella libreria.</p>

    <div class="columns">
      <div v-show="wide || !reading" class="list-column">
        <VBtn
          :to="`/libreria/${ADD_PAGE}`" :active="adding" :prepend-icon="mdiPlus" color="primary" variant="tonal"
          class="action mb-3" min-height="44" block
        >
          Aggiungi un paper
        </VBtn>
        <ErrorNotice
          v-if="papers && !papers.ok"
          summary="Non riesco a leggere la libreria dal servizio del Coach. Il resto dell'app funziona ancora."
          :detail="papers.msg"
          class="mb-4"
        />
        <VAlert v-if="library?.warning" type="warning" variant="tonal" class="mb-4">{{ library.warning }}</VAlert>
        <p v-if="!papers" class="text-medium-emphasis">Carico la libreria…</p>
        <PaperList v-if="library" :library="library" :open="openPmid" @restore="restore" />
      </div>

      <VCard v-if="wide || reading" class="reader-column">
        <VCardText>
          <VBtn v-if="!wide" variant="text" :prepend-icon="mdiArrowLeft" to="/libreria" class="action px-2 mb-2" height="44">
            Torna all'elenco
          </VBtn>
          <AddPaperPanel
            v-if="adding" v-model="pmid" :preview="preview" :removed="removedTyped" :busy="busy" :found="found"
            :library="library" @search="lookUp" @confirm="confirm" @cancel="preview = null" @restore="restore"
            @pick="previewOf" @retry="found && findWords(found.query)"
          />
          <PaperReader v-else-if="current" :paper="current" :passages="passages[current.pmid]" @remove="remove(current)" />
          <p v-else class="hint text-medium-emphasis">Scegli un paper dall'elenco per leggerlo</p>
        </VCardText>
      </VCard>
    </div>
  </div>
</template>

<style scoped>
/* Da 1280 px la pagina è alta quanto la finestra sotto la barra in alto (64 px, più 16 + 16 del
   contenitore): non scorre lei, scorrono l'elenco e l'area di lettura, ognuno per conto suo. */
.wide {
  display: flex;
  flex-direction: column;
  height: calc(100dvh - 96px);
}

.wide .columns {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 3fr);
  gap: 16px;
}

.wide .list-column,
.wide .reader-column {
  min-height: 0;
  overflow-y: auto;
}

.hint {
  padding-block: 3rem;
  text-align: center;
}
</style>
