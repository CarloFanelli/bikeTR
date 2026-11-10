<script setup lang="ts">
// Il workout proposto dal Coach: avviso del ripiego, tentativi del modello e citazioni tolte, titolo,
// watt, passi, razionale, paper citati con i passaggi citati e la licenza di un testo completo, paper
// recuperati, da dove vengono le corse e la risposta grezza del modello. I testi del servizio e del
// modello si mostrano come testo.
import { ref } from 'vue';
import { VExpansionPanel, VExpansionPanels, VExpansionPanelText, VExpansionPanelTitle } from 'vuetify/components';
import type { CoachWorkout } from '../core/coach-types.ts';
import { citedPapers, draftsNotes, metaLine, paperCitation, pubmedUrl, ridesNotes } from '../core/coach-view.ts';

defineProps<{ workout: CoachWorkout }>();

// I paper citati sono aperti, quelli recuperati chiusi.
const papersOpen = ref(['cited']);
</script>

<template>
  <div v-if="workout.fallbackWarning" class="coach-warn">{{ workout.fallbackWarning }}</div>
  <div v-for="note in draftsNotes(workout)" :key="note" class="text-medium-emphasis text-body-2 mb-1">{{ note }}</div>
  <div class="coach-card">
    <div class="coach-title"><b>{{ workout.title }}</b></div>
    <div class="coach-watt">⚡ {{ workout.targetWatt }}</div>
    <ol class="coach-steps">
      <li v-for="(step, i) in workout.struttura" :key="i">{{ step }}</li>
    </ol>
    <div class="coach-rationale"><b>Razionale:</b> {{ workout.razionale }}</div>
    <VExpansionPanels
      v-if="workout.paperRefs.length || workout.retrievedPapers.length"
      v-model="papersOpen"
      multiple
      class="mt-2"
    >
      <VExpansionPanel v-if="workout.paperRefs.length" value="cited">
        <VExpansionPanelTitle>📚 Paper citati nel razionale ({{ workout.paperRefs.length }})</VExpansionPanelTitle>
        <VExpansionPanelText>
          <ul class="paper-list">
            <li v-for="{ paper: p, quotes, license } in citedPapers(workout.paperRefs)" :key="p.pmid">
              <a :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener">{{ paperCitation(p) }}</a><template v-if="license"> · <a :href="license.url" target="_blank" rel="noopener">{{ license.name }}</a></template><template v-if="p.journal"> · <i>{{ p.journal }}</i></template> · <span class="text-medium-emphasis">PMID:{{ p.pmid }}</span>
              <blockquote v-for="q in quotes" :key="q.label" class="paper-quote">
                «{{ q.text }}» <span class="text-medium-emphasis">[{{ q.label }}]</span>
              </blockquote>
            </li>
          </ul>
        </VExpansionPanelText>
      </VExpansionPanel>
      <VExpansionPanel v-if="workout.retrievedPapers.length" value="retrieved">
        <VExpansionPanelTitle class="text-medium-emphasis">
          🔍 Top paper recuperati per il tuo stato (RAG, top {{ workout.retrievedPapers.length }})
        </VExpansionPanelTitle>
        <VExpansionPanelText>
          <ul class="paper-list">
            <li v-for="p in workout.retrievedPapers" :key="p.pmid">
              <a :href="pubmedUrl(p.pmid)" target="_blank" rel="noopener">{{ paperCitation(p) }}</a>{{ ' ' }}<span class="text-medium-emphasis">· score {{ p.score.toFixed(3) }} · PMID:{{ p.pmid }}</span>
            </li>
          </ul>
        </VExpansionPanelText>
      </VExpansionPanel>
    </VExpansionPanels>
  </div>
  <div v-for="note in ridesNotes(workout.rides)" :key="note" class="text-medium-emphasis text-body-2 mt-1">{{ note }}</div>
  <div class="text-medium-emphasis text-caption mt-2">{{ metaLine(workout) }}</div>
  <VExpansionPanels class="mt-2">
    <VExpansionPanel>
      <VExpansionPanelTitle class="text-medium-emphasis">🛠 Output grezzo del modello</VExpansionPanelTitle>
      <VExpansionPanelText><pre class="coach-pre">{{ workout.modelRaw }}</pre></VExpansionPanelText>
    </VExpansionPanel>
  </VExpansionPanels>
</template>

<style scoped>
.coach-warn {
  margin-bottom: 0.75rem;
  padding: 0.5rem 0.75rem;
  border-radius: 6px;
  background: #2a2415;
  color: #fbd38d;
  font-size: 0.85rem;
}

.coach-card {
  padding: 1rem 1.25rem;
  border-left: 3px solid rgb(var(--v-theme-primary));
  border-radius: 8px;
  background: #14171d;
  line-height: 1.55;
}

.coach-card b {
  color: rgb(var(--v-theme-primary));
}

.coach-title {
  margin-bottom: 0.35rem;
  font-size: 1.05rem;
}

.coach-watt {
  display: inline-block;
  margin-bottom: 0.6rem;
  padding: 0.2rem 0.6rem;
  border-radius: 4px;
  background: #0f1115;
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.85rem;
}

.coach-steps {
  margin: 0.5rem 0 0.75rem;
  padding-left: 1.2rem;
}

.coach-steps li {
  margin: 0.2rem 0;
}

.coach-rationale {
  margin-top: 0.5rem;
  padding: 0.6rem 0.8rem;
  border-radius: 6px;
  background: #0f1115;
  font-size: 0.9rem;
}

.paper-list {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.85rem;
}

.paper-list li {
  margin: 0.3rem 0;
}

.paper-list a {
  color: rgb(var(--v-theme-primary));
}

.paper-quote {
  margin: 0.3rem 0 0.4rem;
  padding-left: 0.6rem;
  border-left: 2px solid rgba(var(--v-theme-on-surface), 0.25);
  font-size: 0.8rem;
}

.coach-pre {
  margin: 0;
  padding: 0.75rem;
  border-radius: 6px;
  background: #0f1115;
  font-size: 0.75rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
