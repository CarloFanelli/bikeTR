<script setup lang="ts">
// Scelta di più giorni della settimana, come numeri ISO (1 = lunedì … 7 = domenica).
import { VBtn, VBtnToggle } from 'vuetify/components';
import { WEEKDAYS_ISO } from '../core/dates.ts';

const model = defineModel<number[]>({ required: true });
</script>

<template>
  <VBtnToggle v-model="model" multiple divided variant="outlined" color="primary" density="comfortable">
    <VBtn v-for="(day, i) in WEEKDAYS_ISO" :key="day" :value="i + 1">{{ day }}</VBtn>
  </VBtnToggle>
</template>
