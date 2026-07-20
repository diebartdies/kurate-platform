#!/usr/bin/env node
/**
 * Parse docker build --progress=plain logs and report time per apk package
 * and per Docker build step/layer.
 *
 * Usage:
 *   node scripts/parse-docker-build-timings.js [.cache/docker-build.log]
 *   docker compose build app --progress=plain 2>&1 | node scripts/parse-docker-build-timings.js
 *
 * On server after deploy:
 *   node scripts/parse-docker-build-timings.js /root/KuraTe-platform/.cache/docker-build.log
 */

const fs = require('fs');

const APK_LINE = /^#(\d+)\s+([\d.]+)\s+\(\s*(\d+)\/(\d+)\)\s+Installing\s+(.+?)\s+\(([^)]+)\)\s*$/;
const STEP_START = /^#(\d+)\s+\[([^\]]+)\]\s+(.+)$/;
const STEP_DONE = /^#(\d+)\s+DONE\s+([\d.]+)s\s*$/;

function readInput(path) {
  if (path && path !== '-') {
    return fs.readFileSync(path, 'utf8');
  }
  if (!process.stdin.isTTY) {
    return fs.readFileSync(0, 'utf8');
  }
  const candidates = [
    '.cache/docker-build.log',
    '/root/KuraTe-platform/.cache/docker-build.log'
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return fs.readFileSync(c, 'utf8');
  }
  console.error('Usage: node scripts/parse-docker-build-timings.js [docker-build.log]');
  console.error('       Or pipe docker build output on stdin.');
  process.exit(1);
}

function fmtSec(sec) {
  if (sec < 60) return `${sec.toFixed(1)}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${s.toFixed(0)}s`;
}

function parseLog(text) {
  const lines = text.split(/\r?\n/);
  const apkByStep = new Map();
  const steps = new Map();

  for (const line of lines) {
    const apk = line.match(APK_LINE);
    if (apk) {
      const [, stepId, elapsed, index, total, name, version] = apk;
      if (!apkByStep.has(stepId)) {
        apkByStep.set(stepId, { total: Number(total), packages: [], firstElapsed: null });
      }
      const bucket = apkByStep.get(stepId);
      const t = Number(elapsed);
      if (bucket.firstElapsed === null) bucket.firstElapsed = t;
      bucket.packages.push({
        index: Number(index),
        name: name.trim(),
        version: version.trim(),
        elapsed: t
      });
      continue;
    }

    const done = line.match(STEP_DONE);
    if (done) {
      const [, stepId, seconds] = done;
      const s = steps.get(stepId) || { id: stepId };
      s.doneSeconds = Number(seconds);
      steps.set(stepId, s);
      continue;
    }

    const start = line.match(STEP_START);
    if (start) {
      const [, stepId, phase, label] = start;
      const s = steps.get(stepId) || { id: stepId };
      s.phase = phase;
      s.label = label.trim();
      steps.set(stepId, s);
    }
  }

  const apkReports = [];
  for (const [stepId, bucket] of apkByStep) {
    const pkgs = bucket.packages.sort((a, b) => a.index - b.index);
    const stepDone = steps.get(stepId)?.doneSeconds;
    const timings = [];
    for (let i = 0; i < pkgs.length; i++) {
      const nextElapsed = i < pkgs.length - 1
        ? pkgs[i + 1].elapsed
        : (stepDone != null ? bucket.firstElapsed + stepDone : null);
      const seconds = nextElapsed != null
        ? Math.max(0, nextElapsed - pkgs[i].elapsed)
        : null;
      timings.push({
        index: pkgs[i].index,
        name: pkgs[i].name,
        version: pkgs[i].version,
        elapsed: pkgs[i].elapsed,
        seconds,
        incomplete: seconds == null
      });
    }
    const last = pkgs[pkgs.length - 1];
    const totalSec = last && bucket.firstElapsed != null
      ? (stepDone != null ? stepDone : last.elapsed - bucket.firstElapsed)
      : 0;
    apkReports.push({ stepId, total: bucket.total, timings, totalSec, stepDone });
  }

  const layerTimings = [...steps.values()]
    .filter((s) => s.doneSeconds != null)
    .map((s) => ({
      id: s.id,
      phase: s.phase || '',
      label: s.label || '',
      seconds: s.doneSeconds
    }))
    .sort((a, b) => Number(a.id) - Number(b.id));

  return { apkReports, layerTimings };
}

function printReport({ apkReports, layerTimings }) {
  if (layerTimings.length) {
    console.log('\n=== Docker build steps (layer total time) ===\n');
    console.log('Step  Time      Label');
    console.log('----  --------  -----');
    let layerSum = 0;
    for (const row of layerTimings) {
      layerSum += row.seconds;
      const label = row.label.length > 70 ? `${row.label.slice(0, 67)}...` : row.label;
      console.log(
        `#${row.id.padStart(2)}  ${fmtSec(row.seconds).padEnd(8)}  ${label}`
      );
    }
    console.log(`\nLayers with DONE timing: ${layerTimings.length}, sum ${fmtSec(layerSum)}`);
  }

  for (const report of apkReports) {
    const { stepId, total, timings, totalSec } = report;
    if (!timings.length) continue;

    console.log(`\n=== apk packages — build step #${stepId} (${timings.length}/${total} packages, ~${fmtSec(totalSec)} install) ===\n`);
    console.log('(Each line timestamp = package start; duration = until next package starts.)\n');

    const sorted = [...timings].filter((p) => p.seconds != null).sort((a, b) => b.seconds - a.seconds);
    const incomplete = timings.filter((p) => p.incomplete);
    const top = sorted.slice(0, 25);
    console.log('Top slowest packages:\n');
    console.log('  #   Time      Package');
    console.log('  --  --------  -------');
    for (const p of top) {
      console.log(
        `  ${String(p.index).padStart(2)}  ${fmtSec(p.seconds).padEnd(8)}  ${p.name}`
      );
    }

    const buckets = [
      { label: '> 5 min', min: 300 },
      { label: '1–5 min', min: 60, max: 300 },
      { label: '10–60 s', min: 10, max: 60 },
      { label: '< 10 s', min: 0, max: 10 }
    ];
    console.log('\nTime distribution:\n');
    for (const b of buckets) {
      const count = sorted.filter((p) => {
        if (b.max == null) return p.seconds >= b.min;
        return p.seconds >= b.min && p.seconds < b.max;
      }).length;
      console.log(`  ${b.label.padEnd(10)} ${count} packages`);
    }

    if (incomplete.length) {
      console.log(`\n  (${incomplete.length} trailing package(s) omitted — log cut before step DONE)`);
    }

    if (sorted.length) {
      const mean = sorted.reduce((s, p) => s + p.seconds, 0) / sorted.length;
      const median = sorted[Math.floor(sorted.length / 2)]?.seconds ?? 0;
      console.log(`\n  Mean per package: ${fmtSec(mean)}`);
      console.log(`  Median per package: ${fmtSec(median)}`);
      console.log(`  Slowest: ${sorted[0].name} (${fmtSec(sorted[0].seconds)})`);
    }
  }

  if (!apkReports.length && !layerTimings.length) {
    console.log('No apk install or DONE step timings found in log.');
    console.log('Rebuild with: docker compose build app --progress=plain');
  }
}

const inputPath = process.argv[2];
const text = readInput(inputPath);
printReport(parseLog(text));
