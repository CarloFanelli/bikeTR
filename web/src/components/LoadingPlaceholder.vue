<script setup lang="ts">
// Mentre l'app scarica i dati da Strava: card grigie con la forma della schermata che si sta
// aprendo (Home, Allenamento, Analisi, Attività), nelle sue colonne, così la pagina non salta
// quando arrivano i dati. Le altre schermate hanno la riga "Carico i dati da Strava…".
// La schermata si legge dall'indirizzo: finché il codice della prima schermata non è
// scaricato, il router dice ancora "/".
import { VProgressCircular, VSkeletonLoader } from 'vuetify/components';

type Shape = 'home' | 'allenamento' | 'analisi' | 'attivita';
const SHAPES: readonly string[] = ['home', 'allenamento', 'analisi', 'attivita'];

// "/analisi" → "analisi"; l'indirizzo vuoto apre Home. Il dettaglio di un'attività ("/attivita/123") non è la lista.
const section = window.location.pathname.replace(/^\//, '') || 'home';
const shape = SHAPES.includes(section) ? section as Shape : null;
</script>

<template>
  <div v-if="shape" class="page-wide card-grid">
    <VSkeletonLoader type="heading" class="span-all bg-transparent" max-width="320" />

    <template v-if="shape === 'home'">
      <VSkeletonLoader v-for="n in 3" :key="`tile-${n}`" type="text, heading, text" />
      <VSkeletonLoader v-for="n in 6" :key="`card-${n}`" type="paragraph, button" />
    </template>

    <template v-else-if="shape === 'allenamento'">
      <VSkeletonLoader type="heading, paragraph, button" class="span-2" />
      <VSkeletonLoader type="heading, paragraph" />
      <VSkeletonLoader type="heading, paragraph, paragraph" class="span-2" />
      <VSkeletonLoader type="heading, image" />
      <VSkeletonLoader type="heading, image" class="span-all" />
    </template>

    <template v-else-if="shape === 'analisi'">
      <VSkeletonLoader type="chip@4" class="span-all bg-transparent" />
      <VSkeletonLoader v-for="n in 3" :key="`chart-${n}`" type="heading, image" class="span-all" />
    </template>

    <template v-else>
      <VSkeletonLoader type="chip@4" class="span-all bg-transparent" />
      <VSkeletonLoader v-for="n in 6" :key="`activity-${n}`" type="image, list-item-two-line" />
    </template>
  </div>

  <div v-else class="d-flex align-center ga-3">
    <VProgressCircular indeterminate size="24" color="primary" />
    Carico i dati da Strava…
  </div>
</template>
