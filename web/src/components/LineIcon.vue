<script setup lang="ts">
// Icona a linea al posto dell'emoji di un testo calcolato (vedi core/emoji.ts).
import {
  mdiAlertOutline, mdiArrowDown, mdiAutorenew, mdiBike, mdiChartBar, mdiCheckCircleOutline, mdiCircleOutline,
  mdiClipboardTextOutline, mdiDumbbell, mdiFire, mdiFlagCheckered, mdiHeartPulse, mdiHiking, mdiLeaf, mdiLightbulbOutline,
  mdiLightningBoltOutline, mdiPauseCircleOutline, mdiPulse, mdiRocketLaunchOutline, mdiRun, mdiShoeSneaker, mdiSleep,
  mdiSpeedometer, mdiSpeedometerMedium, mdiSpeedometerSlow, mdiSwim, mdiTarget, mdiTrendingDown, mdiTrendingNeutral,
  mdiTrendingUp, mdiTrophyOutline, mdiWalk, mdiWeatherRainy,
} from '@mdi/js';
import { VIcon } from 'vuetify/components';
import type { IconName } from '../core/emoji.ts';

withDefaults(defineProps<{ name: IconName; size?: number | string }>(), { size: 20 });

const PATHS: Record<IconName, string> = {
  hard: mdiFire, threshold: mdiSpeedometer, moderate: mdiSpeedometerMedium, easy: mdiSpeedometerSlow,
  build: mdiTrendingUp, rest: mdiCircleOutline, recovery: mdiLeaf, done: mdiCheckCircleOutline,
  skip: mdiPauseCircleOutline, rain: mdiWeatherRainy, ride: mdiBike, run: mdiRun, swim: mdiSwim,
  taper: mdiFlagCheckered, race: mdiTrophyOutline, 'recovery-week': mdiAutorenew, target: mdiTarget,
  'trend-up': mdiTrendingUp, 'trend-down': mdiTrendingDown, steady: mdiTrendingNeutral,
  power: mdiLightningBoltOutline, heart: mdiHeartPulse, warning: mdiAlertOutline, plan: mdiClipboardTextOutline,
  idea: mdiLightbulbOutline, boost: mdiRocketLaunchOutline, sleep: mdiSleep, legs: mdiShoeSneaker, down: mdiArrowDown,
  strength: mdiDumbbell, chart: mdiChartBar, walk: mdiWalk, hike: mdiHiking, activity: mdiPulse,
};
</script>

<template>
  <VIcon :icon="PATHS[name]" :size="size" aria-hidden="true" />
</template>
