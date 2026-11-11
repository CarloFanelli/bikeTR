<script setup lang="ts">
// Scelta di più giorni della settimana, come numeri ISO (1 = lunedì … 7 = domenica). Su uno
// schermo stretto i giorni vanno a capo.
import { VBtn, VBtnToggle } from 'vuetify/components';
import { WEEKDAYS_ISO } from '../core/dates.ts';

const model = defineModel<number[]>({ required: true });
</script>

<template>
  <VBtnToggle v-model="model" multiple divided variant="outlined" color="primary" class="days">
    <VBtn v-for="(day, i) in WEEKDAYS_ISO" :key="day" :value="i + 1">{{ day }}</VBtn>
  </VBtnToggle>
</template>

<style scoped>
.days {
  flex-wrap: wrap;
  height: auto;
}

.days :deep(.v-btn) {
  min-width: 48px;
  min-height: 44px;
}
</style>
