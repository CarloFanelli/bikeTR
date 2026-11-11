<script setup lang="ts">
// Aggiungere un paper alla Libreria, nell'area di lettura: il PMID, o parole del titolo o degli
// autori da cui scegliere tra i paper che PubMed trova; poi l'anteprima del paper come entrerebbe
// (testo usato e perché, passaggi), poi la conferma. Un paper già in libreria si apre; un paper di
// base tolto non si aggiunge di nuovo: si ripristina. Le richieste al servizio le fa la schermata.
import { computed } from 'vue';
import { VBtn, VCard, VCardText, VChip, VList, VListItem, VTextField } from 'vuetify/components';
import { paperCitation } from '../core/coach-view.ts';
import type { Library, LibraryPaper, PaperMatch, PaperPreview } from '../core/library-types.ts';
import { FREE_INDEXING, matchState, noMatchLine, passageCount, textUsed } from '../core/library-view.ts';
import type { CoachAnswer } from '../data/coach.ts';
import ErrorNotice from './ErrorNotice.vue';

// found: l'ultima ricerca per parole, con il testo cercato; library: per dire quali risultati ha già.
const props = defineProps<{
  preview: PaperPreview | null; removed: LibraryPaper | null; busy: boolean;
  found: { query: string; answer: CoachAnswer<PaperMatch[]> } | null; library: Library | null;
}>();
const text = defineModel<string>({ required: true });
const emit = defineEmits<{ search: []; confirm: []; cancel: []; restore: [pmid: string]; pick: [pmid: string]; retry: [] }>();

const matches = computed(() => (props.found?.answer.ok ? props.found.answer.value : [])
  .map((m) => ({ ...m, state: props.library ? matchState(m.pmid, props.library) : 'addable' })));

// Toccare un risultato da aggiungere mostra la sua anteprima; gli altri hanno il loro link o pulsante.
function choose(m: (typeof matches.value)[number]) {
  if (m.state === 'addable') emit('pick', m.pmid);
}
</script>

<template>
  <section>
    <h2 class="text-h6 mb-3">Aggiungi un paper</h2>
    <div class="d-flex flex-wrap align-center ga-3 mb-3">
      <VTextField v-model="text" label="PMID, o parole del titolo o degli autori" hide-details class="box" @keyup.enter="emit('search')" />
      <VBtn color="primary" class="action" min-height="44" :loading="busy && !preview" :disabled="busy" @click="emit('search')">
        Cerca
      </VBtn>
    </div>
    <div v-if="removed" class="d-flex flex-wrap align-center ga-2 mb-4">
      <span class="citation">È un paper di base che hai tolto: {{ paperCitation(removed) }}</span>
      <VBtn variant="tonal" class="action" min-height="44" @click="emit('restore', removed.pmid)">Ripristina</VBtn>
    </div>
    <VCard v-if="preview" variant="outlined">
      <VCardText class="d-flex flex-column ga-1">
        <div class="font-weight-bold citation">{{ paperCitation(preview) }}</div>
        <div v-if="preview.journal"><i>{{ preview.journal }}</i></div>
        <div class="mt-2">
          Testo usato: {{ textUsed(preview).label }}<template v-if="textUsed(preview).license"> · licenza <a :href="textUsed(preview).license!.url" target="_blank" rel="noopener">{{ textUsed(preview).license!.name }}</a></template>
        </div>
        <div class="text-medium-emphasis">{{ preview.reason }}</div>
        <div>{{ passageCount(preview.passageCount) }}</div>
        <div class="text-medium-emphasis text-body-2">{{ FREE_INDEXING }}</div>
        <div class="d-flex flex-wrap ga-3 mt-3">
          <VBtn color="primary" class="action" min-height="44" :loading="busy" @click="emit('confirm')">Aggiungi alla libreria</VBtn>
          <VBtn variant="text" class="action" min-height="44" :disabled="busy" @click="emit('cancel')">Annulla</VBtn>
        </div>
      </VCardText>
    </VCard>

    <template v-else-if="found">
      <ErrorNotice
        v-if="!found.answer.ok"
        summary="Non riesco a cercare su PubMed. La libreria non è cambiata."
        :detail="found.answer.msg"
        retry
        :busy="busy"
        @retry="emit('retry')"
      />
      <p v-else-if="!found.answer.value.length" class="text-medium-emphasis">{{ noMatchLine(found.query) }}</p>
      <VList v-else class="py-0" bg-color="transparent">
        <VListItem
          v-for="m in matches"
          :key="m.pmid"
          :to="m.state === 'inLibrary' ? `/libreria/${m.pmid}` : undefined"
          :link="m.state !== 'removed'"
          :disabled="busy && m.state === 'addable'"
          min-height="44"
          rounded="lg"
          class="match"
          @click="choose(m)"
        >
          <div class="citation">{{ paperCitation(m) }}</div>
          <div v-if="m.journal" class="text-medium-emphasis text-body-2"><i>{{ m.journal }}</i></div>
          <VChip v-if="m.state === 'inLibrary'" size="small" variant="tonal" color="primary" class="mt-1">In libreria</VChip>
          <VBtn v-else-if="m.state === 'removed'" variant="tonal" class="action mt-1" min-height="44" @click="emit('restore', m.pmid)">
            Ripristina
          </VBtn>
        </VListItem>
      </VList>
    </template>
  </section>
</template>

<style scoped>
.box {
  flex: 0 1 320px;
  min-width: 200px;
}

.citation {
  overflow-wrap: anywhere;
}

.match {
  padding-block: 0.5rem;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
