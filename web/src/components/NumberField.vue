<script setup lang="ts">
// Campo numerico delle impostazioni: nome e limiti dalle regole delle impostazioni,
// con il messaggio d'errore quando il valore è fuori limite.
import { VTextField } from 'vuetify/components';
import { NUMBER_FIELDS, type NumberField } from '../core/settings.ts';

const props = defineProps<{ field: NumberField; error?: string; placeholder?: string; hint?: string }>();
const model = defineModel<string>({ required: true });
const spec = NUMBER_FIELDS[props.field];
</script>

<template>
  <VTextField
    v-model="model"
    type="number"
    :label="spec.label"
    :min="spec.min"
    :max="spec.max"
    :step="spec.step"
    :placeholder="placeholder"
    :hint="hint"
    :persistent-hint="!!hint"
    :error-messages="error"
  />
</template>
