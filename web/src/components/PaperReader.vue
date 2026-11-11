<script setup lang="ts">
// Un paper della Libreria letto per intero: citazione e origine, link, rivista e testo usato, cosa
// ne dipende, il pulsante per toglierlo e i suoi passaggi, come il Coach li legge e li cita.
import { VBtn, VChip } from 'vuetify/components';
import { paperCitation, pubmedUrl } from '../core/coach-view.ts';
import type { LibraryPaper, LibraryPassages } from '../core/library-types.ts';
import { dependencyLines, europePmcUrl, originLabel, textUsed } from '../core/library-view.ts';
import type { CoachAnswer } from '../data/coach.ts';
import ErrorNotice from './ErrorNotice.vue';

// passages: assente finché il servizio non risponde.
defineProps<{ paper: LibraryPaper; passages: CoachAnswer<LibraryPassages> | undefined }>();
const emit = defineEmits<{ remove: [] }>();
</script>

<template>
  <article>
    <h2 class="text-h6 citation">{{ paperCitation(paper) }}</h2>
    <VChip size="small" variant="tonal" class="mt-2">{{ originLabel(paper) }}</VChip>
    <div class="d-flex flex-wrap align-center ga-4 my-2">
      <a :href="pubmedUrl(paper.pmid)" target="_blank" rel="noopener" class="link">PubMed</a>
      <a v-if="europePmcUrl(paper)" :href="europePmcUrl(paper)!" target="_blank" rel="noopener" class="link">Europe PMC</a>
    </div>
    <dl class="facts text-body-2 mb-3">
      <template v-if="paper.journal"><dt>Rivista</dt><dd><i>{{ paper.journal }}</i></dd></template>
      <dt>Testo usato</dt><dd>{{ textUsed(paper).label }}</dd>
      <template v-if="textUsed(paper).license">
        <dt>Licenza</dt>
        <dd><a :href="textUsed(paper).license!.url" target="_blank" rel="noopener">{{ textUsed(paper).license!.name }}</a></dd>
      </template>
    </dl>
    <div v-for="line in dependencyLines(paper)" :key="line" class="text-body-2 mb-1">{{ line }}</div>
    <VBtn variant="text" color="error" class="action px-0 mb-3" min-height="44" @click="emit('remove')">
      {{ paper.origin === 'base' ? 'Togli' : 'Cancella' }}
    </VBtn>
    <h3 class="part">Passaggi</h3>
    <p v-if="!passages" class="text-medium-emphasis">Carico i passaggi…</p>
    <ErrorNotice
      v-else-if="!passages.ok"
      summary="Non riesco a leggere i passaggi di questo studio. Gli altri studi restano consultabili."
      :detail="passages.msg"
    />
    <div v-for="s in passages.value.passages" v-else :key="s.label" class="passage">
      <div class="text-medium-emphasis text-caption">{{ s.label }}</div>
      <div>{{ s.text }}</div>
    </div>
  </article>
</template>

<style scoped>
.citation {
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
