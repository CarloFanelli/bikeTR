<script setup lang="ts">
// Libreria: i paper che il Coach cerca, con cosa ne dipende. Aprendo un paper si chiedono i suoi
// passaggi, come il Coach li legge e li cita.
import { onMounted, reactive, ref } from 'vue';
import {
  VCard, VCardText, VCardTitle, VChip, VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle,
} from 'vuetify/components';
import { paperCitation, pubmedUrl } from '../core/coach-view.ts';
import type { LibraryPaper, LibraryPassages } from '../core/library-types.ts';
import { dependencyLines, europePmcUrl, originLabel, passageCount, textUsed } from '../core/library-view.ts';
import { libraryPapers, libraryPassages, type CoachAnswer } from '../data/coach.ts';

const papers = ref<CoachAnswer<{ papers: LibraryPaper[] }> | null>(null);
// I passaggi dei paper già aperti, per PMID: si chiedono una volta sola.
const passages = reactive<Record<string, CoachAnswer<LibraryPassages>>>({});

onMounted(async () => {
  papers.value = await libraryPapers();
});

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
      <p v-if="papers && !papers.ok">{{ papers.msg }}</p>
      <VExpansionPanels v-else-if="papers?.ok" @update:model-value="(pmid) => open(pmid as string | undefined)">
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
      <p v-else class="text-medium-emphasis">Carico la libreria…</p>
    </VCardText>
  </VCard>
</template>

<style scoped>
.passage {
  margin-bottom: 0.75rem;
}

a {
  color: rgb(var(--v-theme-primary));
}
</style>
