<script setup lang="ts">
// Analisi in cinque schede: Forma e carico (carico, forma, zone FC), Potenza (curva e power
// profile), Soglie (FTP nel tempo, calcolo di FTP e LTHR), Segmenti (previsioni e workout),
// Profilo e dati (livello, totali e record, precisione dei dati con "Aggiorna con streams").
// Riapre la scheda scelta per ultima. Le card Forma e
// Zone FC usano soglia e FTP senza le stime dalle attività, come i risultati registrati
// dei test; le altre le includono. A fine caricamento dei segmenti tutto si ricalcola:
// cambiano le stime dai segmenti.
import { computed, ref } from 'vue';
import { VTab, VTabs, VTabsWindow, VTabsWindowItem } from 'vuetify/components';
import { segmentsJob } from '../app/jobs.ts';
import { session } from '../app/session.ts';
import DataPrecisionCard from '../components/DataPrecisionCard.vue';
import FormTrendCard from '../components/FormTrendCard.vue';
import FtpLthrCard from '../components/FtpLthrCard.vue';
import FtpTrendCard from '../components/FtpTrendCard.vue';
import HrZonesCard from '../components/HrZonesCard.vue';
import LoadChartCard from '../components/LoadChartCard.vue';
import PowerCurveCard from '../components/PowerCurveCard.vue';
import PowerProfileCard from '../components/PowerProfileCard.vue';
import ProfileCard from '../components/ProfileCard.vue';
import SegmentPredictions from '../components/SegmentPredictions.vue';
import SegmentWorkouts from '../components/SegmentWorkouts.vue';
import {
  formView, ftpCard, ftpLthrView, ftpTrendRows, hrZonesView, powerCurveView, powerProfileView,
} from '../core/analysis-view.ts';
import { buildFormTrend, formInsights } from '../core/form.ts';
import { buildFtpBreakdown, buildFtpTrend, buildLthrBreakdown } from '../core/ftp.ts';
import { buildHrZones, resolveHr } from '../core/hr.ts';
import { athleteResponseCheck, mesoSummary } from '../core/meso.ts';
import { loadChartDays } from '../core/plan/load-chart.ts';
import { buildPowerCurve, buildPowerProfile } from '../core/power.ts';
import { estimatesFromSegments, generateSegmentWorkouts } from '../core/segments.ts';
import { workoutCards } from '../core/segments-view.ts';
import { loadChartView } from '../core/training-view.ts';
import {
  type AnalysisTab, loadAnalysisTab, loadFtpHistory, loadMesocycle, loadSegmentCache, loadSettings, saveAnalysisTab,
} from '../data/storage.ts';

const TABS: { value: AnalysisTab; title: string }[] = [
  { value: 'forma', title: 'Forma e carico' },
  { value: 'potenza', title: 'Potenza' },
  { value: 'soglie', title: 'Soglie' },
  { value: 'segmenti', title: 'Segmenti' },
  { value: 'profilo', title: 'Profilo e dati' },
];
const tab = ref<AnalysisTab>(loadAnalysisTab());
function chooseTab(value: unknown): void {
  tab.value = value as AnalysisTab;
  saveAnalysisTab(tab.value);
}

const view = computed(() => {
  void segmentsJob.list;
  const now = new Date();
  const activities = session.activities;
  const settings = loadSettings();
  const segEst = estimatesFromSegments(loadSegmentCache(), now);
  const hr = resolveHr(settings, activities, segEst, now);
  const declared = resolveHr(settings, undefined, segEst, now);
  const form = buildFormTrend(activities, hr, now);
  const meso = loadMesocycle();
  const ftpTrend = buildFtpTrend(loadFtpHistory());
  const curve = buildPowerCurve(activities, settings.weight);
  const profile = buildPowerProfile(activities, settings.weight);
  return {
    chart: loadChartView(loadChartDays(activities, hr, now)),
    form,
    formView: formView(form, now),
    insights: formInsights(form, activities, {
      hrLthr: declared.hrLthr, ftp: declared.ftp, now, ftpTrend, meso: mesoSummary(meso),
      response: athleteResponseCheck(form, meso),
    }),
    formCtx: { ctl: form.ctl[form.DAYS - 1], tsb: form.tsb[form.DAYS - 1] },
    curve: curve && powerCurveView(curve, settings.weight),
    ftpCard: ftpCard(hr, settings.weight),
    zones: hrZonesView(buildHrZones(activities, declared.hrLthr, now)),
    profile: profile && powerProfileView(profile),
    ftpTrend,
    ftpTrendRows: ftpTrend ? ftpTrendRows(ftpTrend) : [],
    breakdown: ftpLthrView(buildFtpBreakdown(activities, now), buildLthrBreakdown(activities), segEst, hr),
    workouts: workoutCards(generateSegmentWorkouts(segmentsJob.list, hr.ftp, hr.hrLthr)),
  };
});
</script>

<template>
  <div class="page-wide d-flex flex-column ga-4">
    <header>
      <h1 class="text-h4">Analisi</h1>
    </header>
    <VTabs :model-value="tab" color="primary" show-arrows aria-label="Sezioni di Analisi" @update:model-value="chooseTab">
      <VTab v-for="t in TABS" :key="t.value" :value="t.value" class="action" min-height="48">{{ t.title }}</VTab>
    </VTabs>
    <VTabsWindow :model-value="tab">
      <VTabsWindowItem value="forma">
        <div class="card-grid">
          <LoadChartCard :chart="view.chart" class="span-all" />
          <FormTrendCard :form="view.form" :view="view.formView" :insights="view.insights" class="span-all" />
          <HrZonesCard :view="view.zones" class="span-all" />
        </div>
      </VTabsWindowItem>
      <VTabsWindowItem value="potenza">
        <div class="card-grid">
          <PowerCurveCard :curve="view.curve" :ftp="view.ftpCard" class="span-all" />
          <PowerProfileCard :view="view.profile" class="span-all" />
        </div>
      </VTabsWindowItem>
      <VTabsWindowItem value="soglie">
        <div class="card-grid">
          <FtpTrendCard :trend="view.ftpTrend" :rows="view.ftpTrendRows" class="span-all" />
          <FtpLthrCard :view="view.breakdown" class="span-all" />
        </div>
      </VTabsWindowItem>
      <VTabsWindowItem value="segmenti">
        <div class="card-grid">
          <SegmentPredictions :form-ctx="view.formCtx" class="span-all" />
          <SegmentWorkouts v-if="segmentsJob.list?.length" :cards="view.workouts" class="span-all" />
        </div>
      </VTabsWindowItem>
      <VTabsWindowItem value="profilo">
        <div class="card-grid">
          <ProfileCard />
          <DataPrecisionCard />
        </div>
      </VTabsWindowItem>
    </VTabsWindow>
  </div>
</template>
