<script setup lang="ts">
// Campo numerico delle impostazioni: nome e limiti dalle regole delle impostazioni,
// con il messaggio d'errore quando il valore è fuori limite. Con un aiuto, il nome sta
// sopra il campo e apre la spiegazione.
import { VTextField } from 'vuetify/components';
import type { Explanation } from '../core/explanations/types.ts';
import { NUMBER_FIELDS, type NumberField } from '../core/settings.ts';
import InfoLabel from './InfoLabel.vue';

const props = defineProps<{ field: NumberField; error?: string; placeholder?: string; help?: Explanation }>();
const model = defineModel<string>({ required: true });
const spec = NUMBER_FIELDS[props.field];
</script>

<template>
  <div>
    <div v-if="help" class="text-body-2 mb-1"><InfoLabel :topic="help" :label="spec.label" /></div>
    <VTextField
      v-model="model"
      type="number"
      :label="help ? undefined : spec.label"
      :aria-label="spec.label"
      :min="spec.min"
      :max="spec.max"
      :step="spec.step"
      :placeholder="placeholder"
      :error-messages="error"
    />
  </div>
</template>
