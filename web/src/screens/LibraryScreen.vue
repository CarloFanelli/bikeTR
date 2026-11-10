<script setup lang="ts">
// Libreria: i paper che il Coach cerca, con cosa ne dipende. Aprendo un paper si chiedono i suoi
// passaggi, come il Coach li legge e li cita. Un paper si aggiunge per PMID: prima l'anteprima,
// poi la conferma, che lo scarica di nuovo, lo indicizza e lo salva. Un paper si toglie dopo una
// conferma che nomina chi lo perde; un paper di base tolto si ripristina dal suo elenco.
import { computed, onMounted, reactive, ref } from 'vue';
import {
  VAlert, VBtn, VCard, VCardText, VCardTitle, VChip, VExpansionPanel, VExpansionPanels, VExpansionPanelText,
  VExpansionPanelTitle, VTextField,
} from 'vuetify/components';
import { paperCitation, pubmedUrl } from '../core/coach-view.ts';
import type { Library, LibraryPaper, LibraryPassages, PaperPreview } from '../core/library-types.ts';
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

async function open(pmid: string | undefined) {
  if (!pmid || passages[pmid]?.ok) return;
  passages[pmid] = await libraryPassages(pmid);
}
</script>

<template>
  <VCard>
    <VCardTitle>📚 Libreria</VCardTitle>
    <VCardText>
      <p class="text-medium-emphasis mb-4">
        I paper in cui il Coach cerca i passaggi da dare al modello. Apri un paper per leggerne i passaggi.
      </p>
      <div class="d-flex flex-wrap align-center ga-3 mb-2">
        <VTextField v-model="pmid" label="PMID del paper da aggiungere" hide-details class="pmid" @keyup.enter="lookUp" />
        <VBtn color="primary" :loading="busy && !preview" :disabled="busy" @click="lookUp">Cerca su PubMed</VBtn>
      </div>
      <p v-if="removedTyped" class="mb-4">
        È un paper di base che hai tolto: {{ paperCitation(removedTyped) }}
        <VBtn size="small" variant="tonal" class="ml-2" @click="restore(removedTyped.pmid)">Ripristina</VBtn>
      </p>
      <VCard v-if="preview" variant="outlined" class="mb-4">
        <VCardText>
          <div class="font-weight-bold">{{ paperCitation(preview) }}</div>
          <div v-if="preview.journal"><i>{{ preview.journal }}</i></div>
          <div class="mt-2">
            Testo usato: {{ textUsed(preview).label }}<template v-if="textUsed(preview).license"> · licenza <a :href="textUsed(preview).license!.url" target="_blank" rel="noopener">{{ textUsed(preview).license!.name }}</a></template>
          </div>
          <div class="text-medium-emphasis">{{ preview.reason }}</div>
          <div>{{ passageCount(preview.passageCount) }}</div>
          <div class="text-medium-emphasis">{{ FREE_INDEXING }}</div>
          <div class="d-flex ga-3 mt-3">
            <VBtn color="primary" :loading="busy" @click="confirm">Aggiungi alla libreria</VBtn>
            <VBtn variant="text" :disabled="busy" @click="preview = null">Annulla</VBtn>
          </div>
        </VCardText>
      </VCard>
      <p v-if="outcome" class="mb-4">{{ outcome }}</p>

      <p v-if="papers && !papers.ok">{{ papers.msg }}</p>
      <VAlert v-if="papers?.ok && papers.value.warning" type="warning" variant="tonal" class="mb-4">
        {{ papers.value.warning }}
      </VAlert>
      <VExpansionPanels v-if="papers?.ok" @update:model-value="(pmid) => open(pmid as string | undefined)">
        <VExpansionPanel v-for="p in papers.value.papers" :key="p.pmid" :value="p.pmid">
          <VExpansionPanelTitle>
            <div>
              <div>{{ paperCitation(p) }}</div>
              <div class="text-medium-emphasis text-body-2 mt-1">
                <VChip size="x-small" class="mr-2">{{ originLabel(p) }}</VChip>
                <i v-if="p.journal">{{ p.journal }}</i>
                · {{ passageCount(p.passageCount) }}
                · {{ textUsed(p).label }}<template v-if="textUsed(p).license"> ({{ textUsed(p).license?.name }})</template>
              </div>
              <div v-for="line in dependencyLines(p)" :key="line" class="text-body-2 mt-1">{{ line }}</div>
            </div>
          </VExpansionPanelTitle>
          <VExpansionPanelText>
            <div class="mb-3">
              <a :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener">PubMed</a>
              <template v-if="europePmcUrl(p)"> · <a :href="europePmcUrl(p)!" target="_blank" rel="noopener">Europe PMC</a></template>
              <template v-if="textUsed(p).license"> · licenza <a :href="textUsed(p).license!.url" target="_blank" rel="noopener">{{ textUsed(p).license!.name }}</a></template>
              <VBtn size="small" variant="text" color="error" class="ml-2" @click="remove(p)">
                {{ p.origin === 'base' ? 'Togli' : 'Cancella' }}
              </VBtn>
            </div>
            <p v-if="!passages[p.pmid]" class="text-medium-emphasis">Carico i passaggi…</p>
            <p v-else-if="!passages[p.pmid].ok">{{ (passages[p.pmid] as { msg: string }).msg }}</p>
            <template v-else>
              <div v-for="s in (passages[p.pmid] as { value: LibraryPassages }).value.passages" :key="s.label" class="passage">
                <div class="text-medium-emphasis text-caption">{{ s.label }}</div>
                <div>{{ s.text }}</div>
              </div>
            </template>
          </VExpansionPanelText>
        </VExpansionPanel>
      </VExpansionPanels>
      <template v-if="papers?.ok && papers.value.removed.length">
        <div class="text-subtitle-1 mt-6 mb-2">Paper di base tolti</div>
        <p class="text-medium-emphasis mb-2">Il Coach non li cerca finché non li ripristini.</p>
        <div v-for="p in papers.value.removed" :key="p.pmid" class="d-flex align-center ga-2 mb-1">
          <span>{{ paperCitation(p) }}</span>
          <VBtn size="small" variant="tonal" @click="restore(p.pmid)">Ripristina</VBtn>
        </div>
      </template>
      <p v-if="!papers" class="text-medium-emphasis">Carico la libreria…</p>
    </VCardText>
  </VCard>
</template>

<style scoped>
.pmid {
  flex: 0 0 260px;
}

.passage {
  margin-bottom: 0.75rem;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
