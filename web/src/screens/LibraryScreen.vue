<script setup lang="ts">
// Libreria: i paper che il Coach cerca, con cosa ne dipende. Aprendo un paper si chiedono i suoi
// passaggi, come il Coach li legge e li cita. Un paper si aggiunge per PMID: prima l'anteprima,
// poi la conferma, che lo scarica di nuovo, lo indicizza e lo salva. Un paper si toglie dopo una
// conferma che nomina chi lo perde; un paper di base tolto si ripristina dal suo elenco.
// La riga di un paper ha citazione, origine e passaggi; il resto si vede aprendolo.
import { computed, onMounted, reactive, ref } from 'vue';
import {
  VAlert, VBtn, VCard, VCardText, VChip, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
  VTextField,
} from 'vuetify/components';
import { paperCitation, pubmedUrl } from '../core/coach-view.ts';
import { splitEmoji } from '../core/emoji.ts';
import type { Library, LibraryPaper, LibraryPassages, PaperPreview } from '../core/library-types.ts';
import ErrorNotice from '../components/ErrorNotice.vue';
import LineIcon from '../components/LineIcon.vue';
import {
  FREE_INDEXING, addedLine, dependencyLines, europePmcUrl, originLabel, passageCount, pmidError, removalQuestion,
  textUsed,
} from '../core/library-view.ts';
import {
  addPaper, libraryPapers, libraryPassages, previewPaper, removePaper, restorePaper, type CoachAnswer,
} from '../data/coach.ts';

const papers = ref<CoachAnswer<Library> | null>(null);
// I passaggi dei paper già aperti, per PMID: si chiedono una volta sola.
const passages = reactive<Record<string, CoachAnswer<LibraryPassages>>>({});

onMounted(async () => {
  papers.value = await libraryPapers();
});

const pmid = ref('');
const preview = ref<PaperPreview | null>(null);
// L'esito dell'ultima azione: un rifiuto o il paper aggiunto.
const outcome = ref('');
const busy = ref(false);

// Un paper di base tolto non si aggiunge di nuovo: si ripristina.
const removedTyped = computed(() =>
  papers.value?.ok ? papers.value.value.removed.find((p) => p.pmid === pmid.value.trim()) ?? null : null);

async function lookUp() {
  preview.value = null;
  outcome.value = pmidError(pmid.value) ?? '';
  if (outcome.value || removedTyped.value) return;
  busy.value = true;
  const answer = await previewPaper(pmid.value.trim());
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
    papers.value = await libraryPapers();
  }
}

async function remove(p: LibraryPaper) {
  if (!window.confirm(removalQuestion(p))) return;
  const answer = await removePaper(p.pmid);
  outcome.value = answer.ok ? '' : answer.msg;
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

async function open(pmid: string | undefined) {
  if (!pmid || passages[pmid]?.ok) return;
  passages[pmid] = await libraryPassages(pmid);
}
</script>

<template>
  <div class="library">
    <header class="mb-6">
      <h1 class="text-h4">Libreria</h1>
      <p class="text-medium-emphasis mt-1">I paper in cui il Coach cerca i passaggi da dare al modello.</p>
    </header>

    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <VTextField v-model="pmid" label="PMID del paper da aggiungere" hide-details class="pmid" @keyup.enter="lookUp" />
      <VBtn color="primary" class="action" min-height="44" :loading="busy && !preview" :disabled="busy" @click="lookUp">
        Cerca su PubMed
      </VBtn>
    </div>
    <div v-if="removedTyped" class="d-flex flex-wrap align-center ga-2 mb-4">
      <span>È un paper di base che hai tolto: {{ paperCitation(removedTyped) }}</span>
      <VBtn variant="tonal" class="action" min-height="44" @click="restore(removedTyped.pmid)">Ripristina</VBtn>
    </div>
    <VCard v-if="preview" variant="outlined" class="mb-4">
      <VCardText class="d-flex flex-column ga-1">
        <div class="font-weight-bold">{{ paperCitation(preview) }}</div>
        <div v-if="preview.journal"><i>{{ preview.journal }}</i></div>
        <div class="mt-2">
          Testo usato: {{ textUsed(preview).label }}<template v-if="textUsed(preview).license"> · licenza <a :href="textUsed(preview).license!.url" target="_blank" rel="noopener">{{ textUsed(preview).license!.name }}</a></template>
        </div>
        <div class="text-medium-emphasis">{{ preview.reason }}</div>
        <div>{{ passageCount(preview.passageCount) }}</div>
        <div class="text-medium-emphasis text-body-2">{{ FREE_INDEXING }}</div>
        <div class="d-flex flex-wrap ga-3 mt-3">
          <VBtn color="primary" class="action" min-height="44" :loading="busy" @click="confirm">Aggiungi alla libreria</VBtn>
          <VBtn variant="text" class="action" min-height="44" :disabled="busy" @click="preview = null">Annulla</VBtn>
        </div>
      </VCardText>
    </VCard>
    <p v-if="outcome" class="d-flex align-center ga-2 mb-4">
      <LineIcon v-if="outcomeLine.icon" :name="outcomeLine.icon" :size="18" />
      <span>{{ outcomeLine.text }}</span>
    </p>

    <ErrorNotice
      v-if="papers && !papers.ok"
      summary="Non riesco a leggere la libreria dal servizio del Coach. Il resto dell'app funziona ancora."
      :detail="papers.msg"
      class="mb-4"
    />
    <VAlert v-if="papers?.ok && papers.value.warning" type="warning" variant="tonal" class="mb-4">
      {{ papers.value.warning }}
    </VAlert>
    <p v-if="!papers" class="text-medium-emphasis">Carico la libreria…</p>
    <VExpansionPanels v-if="papers?.ok" variant="accordion" @update:model-value="(pmid) => open(pmid as string | undefined)">
      <VExpansionPanel v-for="p in papers.value.papers" :key="p.pmid" :value="p.pmid" elevation="0" class="paper">
        <VExpansionPanelTitle>
          <div class="paper-row">
            <div class="citation">{{ paperCitation(p) }}</div>
            <div class="d-flex flex-wrap align-center ga-2 mt-1 text-medium-emphasis text-body-2">
              <VChip size="small" variant="tonal">{{ originLabel(p) }}</VChip>
              <span>{{ passageCount(p.passageCount) }}</span>
            </div>
          </div>
        </VExpansionPanelTitle>
        <VExpansionPanelText>
          <div class="d-flex flex-wrap align-center ga-4 mb-2">
            <a :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener" class="link">PubMed</a>
            <a v-if="europePmcUrl(p)" :href="europePmcUrl(p)!" target="_blank" rel="noopener" class="link">Europe PMC</a>
          </div>
          <dl class="facts text-body-2 mb-3">
            <template v-if="p.journal"><dt>Rivista</dt><dd><i>{{ p.journal }}</i></dd></template>
            <dt>Testo usato</dt><dd>{{ textUsed(p).label }}</dd>
            <template v-if="textUsed(p).license">
              <dt>Licenza</dt>
              <dd><a :href="textUsed(p).license!.url" target="_blank" rel="noopener">{{ textUsed(p).license!.name }}</a></dd>
            </template>
          </dl>
          <div v-for="line in dependencyLines(p)" :key="line" class="text-body-2 mb-1">{{ line }}</div>
          <VBtn variant="text" color="error" class="action px-0 mb-3" min-height="44" @click="remove(p)">
            {{ p.origin === 'base' ? 'Togli' : 'Cancella' }}
          </VBtn>
          <h3 class="part">Passaggi</h3>
          <p v-if="!passages[p.pmid]" class="text-medium-emphasis">Carico i passaggi…</p>
          <ErrorNotice
            v-else-if="!passages[p.pmid].ok"
            summary="Non riesco a leggere i passaggi di questo studio. Gli altri studi restano consultabili."
            :detail="(passages[p.pmid] as { msg: string }).msg"
          />
          <template v-else>
            <div v-for="s in (passages[p.pmid] as { value: LibraryPassages }).value.passages" :key="s.label" class="passage">
              <div class="text-medium-emphasis text-caption">{{ s.label }}</div>
              <div>{{ s.text }}</div>
            </div>
          </template>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
    <section v-if="papers?.ok && papers.value.removed.length" class="mt-8">
      <h2 class="text-h6 mb-1">Paper di base tolti</h2>
      <p class="text-medium-emphasis mb-3">Il Coach non li cerca finché non li ripristini.</p>
      <div v-for="p in papers.value.removed" :key="p.pmid" class="d-flex flex-wrap align-center ga-2 mb-2">
        <span class="citation">{{ paperCitation(p) }}</span>
        <VBtn variant="tonal" class="action" min-height="44" @click="restore(p.pmid)">Ripristina</VBtn>
      </div>
    </section>
  </div>
</template>

<style scoped>
.library {
  max-width: 880px;
  margin: 0 auto;
}

.pmid {
  flex: 0 1 260px;
  min-width: 200px;
}

.paper {
  border-bottom: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}

.paper-row,
.citation {
  min-width: 0;
  overflow-wrap: anywhere;
}

.link {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
}

.facts {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.25rem 1rem;
}

.facts dt {
  color: rgba(var(--v-theme-on-surface), var(--v-medium-emphasis-opacity));
}

.part {
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  font-weight: 600;
}

.passage {
  margin-bottom: 0.75rem;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
