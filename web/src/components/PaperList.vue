<script setup lang="ts">
// L'elenco della Libreria: una riga per paper (autori, anno, titolo, origine) che apre il paper
// nell'area di lettura; il paper aperto è evidenziato. In fondo i paper di base tolti, da ripristinare.
import { VBtn, VChip, VList, VListItem } from 'vuetify/components';
import { paperCitation } from '../core/coach-view.ts';
import type { Library } from '../core/library-types.ts';
import { originLabel } from '../core/library-view.ts';

defineProps<{ library: Library; open: string | undefined }>();
const emit = defineEmits<{ restore: [pmid: string] }>();
</script>

<template>
  <VList class="py-0" bg-color="transparent">
    <VListItem
      v-for="p in library.papers"
      :key="p.pmid"
      :to="`/libreria/${p.pmid}`"
      :active="p.pmid === open"
      :aria-current="p.pmid === open ? 'page' : undefined"
      color="primary"
      min-height="44"
      rounded="lg"
      class="row"
    >
      <div class="citation">{{ paperCitation(p) }}</div>
      <VChip size="small" variant="tonal" class="mt-1">{{ originLabel(p) }}</VChip>
    </VListItem>
  </VList>

  <section v-if="library.removed.length" class="mt-6">
    <h2 class="text-subtitle-1 font-weight-bold mb-1">Tolti</h2>
    <p class="text-medium-emphasis text-body-2 mb-2">Il Coach non li cerca finché non li ripristini.</p>
    <div v-for="p in library.removed" :key="p.pmid" class="d-flex flex-column align-start ga-1 mb-3">
      <span class="citation text-body-2">{{ paperCitation(p) }}</span>
      <VBtn variant="tonal" class="action" min-height="44" @click="emit('restore', p.pmid)">Ripristina</VBtn>
    </div>
  </section>
</template>

<style scoped>
.row {
  padding-block: 0.5rem;
}

/* Un titolo o un elenco di autori lungo va a capo nella riga, senza scorrere di lato. */
.citation {
  min-width: 0;
  overflow-wrap: anywhere;
}
</style>
