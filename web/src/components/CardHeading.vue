<script setup lang="ts">
// Il titolo di una card: l'icona in un quadratino tinto e il titolo, tutti e due nel colore
// della sezione (`--section`, vedi fonts.css). Il titolo può essere un testo o un'etichetta
// con la spiegazione.
import { VIcon } from 'vuetify/components';

defineProps<{ icon: string }>();
</script>

<template>
  <div class="card-heading">
    <span class="badge" aria-hidden="true"><VIcon :icon="icon" size="20" /></span>
    <div class="title"><slot /></div>
  </div>
</template>

<style scoped>
.card-heading {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-width: 0;
}

.badge {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border-radius: var(--radius-control);
  background: rgba(var(--section), 0.12);
  color: rgb(var(--section));
}

.title {
  min-width: 0;
  color: rgb(var(--section));
  font-family: var(--v-font-heading);
  font-size: 1.125rem;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
}
</style>
