<script setup lang="ts">
// Analisi: previsioni sui segmenti, carico, forma, curva di potenza, zone FC, power
// profile, FTP nel tempo, calcolo di FTP e LTHR e workout sui segmenti. Le card Forma e
// Zone FC usano soglia e FTP senza le stime dalle attività, come i risultati registrati
// dei test; le altre le includono. A fine caricamento dei segmenti tutto si ricalcola:
// cambiano le stime dai segmenti.
import { computed } from 'vue';
import { segmentsJob } from '../app/jobs.ts';
import { session } from '../app/session.ts';
import FormTrendCard from '../components/FormTrendCard.vue';
import FtpLthrCard from '../components/FtpLthrCard.vue';
import FtpTrendCard from '../components/FtpTrendCard.vue';
import HrZonesCard from '../components/HrZonesCard.vue';
import LoadChartCard from '../components/LoadChartCard.vue';
import PowerCurveCard from '../components/PowerCurveCard.vue';
import PowerProfileCard from '../components/PowerProfileCard.vue';
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
import { loadFtpHistory, loadMesocycle, loadSegmentCache, loadSettings } from '../data/storage.ts';

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
  <div class="d-flex flex-column ga-4">
    <SegmentPredictions :form-ctx="view.formCtx" />
    <LoadChartCard :chart="view.chart" />
    <FormTrendCard :form="view.form" :view="view.formView" :insights="view.insights" />
    <PowerCurveCard :curve="view.curve" :ftp="view.ftpCard" />
    <HrZonesCard :view="view.zones" />
    <PowerProfileCard :view="view.profile" />
    <FtpTrendCard :trend="view.ftpTrend" :rows="view.ftpTrendRows" />
    <FtpLthrCard :view="view.breakdown" />
    <SegmentWorkouts v-if="segmentsJob.list?.length" :cards="view.workouts" />
  </div>
</template>
