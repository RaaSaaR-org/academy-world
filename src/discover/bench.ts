/**
 * The benchmark (WP-D0, plan §2.4): „Messen“ runs the tour on its own — every stop (5 s dwell), then
 * the viewer with 3 robots (when D2's viewer is registered), then the film's stills version (D3) —
 * and shows a table with „Kopieren“: JSON for the founder to paste into a message. Nothing is sent.
 */
import type { CardSpec, DiscoverHandle, FilmEnterArg, PerfWindow, TourStop, ViewerEnterArg } from './types';
import type { PerfMonitorImpl } from './perf';
import { S } from './strings';

const wait = (ms: number): Promise<void> => new Promise((r) => window.setTimeout(r, ms));

export interface BenchRow extends PerfWindow {
  id: string;
  /** ms from the call to arrival (pre-roll + flight) */
  arriveMs: number;
  draws: number;
  tris: number;
  programs: number;
  gpuMB: number;
  heapMB: number | null;
}

export interface BenchResult {
  v: 1;
  ua: string;
  renderer: string;
  tier: string;
  dpr: number;
  buffer: [number, number];
  screen: [number, number, number];
  crash: unknown;
  probe: unknown;
  stops: BenchRow[];
  viewer: BenchRow[];
  film: BenchRow | null;
  ms: number;
}

let running: Promise<BenchResult> | null = null;

export function runBench(h: DiscoverHandle, perf: PerfMonitorImpl, stops: () => readonly TourStop[], goto: (id: string) => Promise<void>): Promise<BenchResult> {
  running ??= bench(h, perf, stops, goto).finally(() => (running = null));
  return running;
}

async function bench(h: DiscoverHandle, perf: PerfMonitorImpl, stops: () => readonly TourStop[], goto: (id: string) => Promise<void>): Promise<BenchResult> {
  const t0 = performance.now();
  const s0 = perf.stats();
  const out: BenchResult = {
    v: 1,
    ua: navigator.userAgent,
    renderer: s0.renderer,
    tier: s0.tier,
    dpr: window.devicePixelRatio,
    buffer: s0.buffer,
    screen: [window.innerWidth, window.innerHeight, window.devicePixelRatio],
    crash: s0.crash,
    probe: perf.probe,
    stops: [],
    viewer: [],
    film: null,
    ms: 0,
  };
  const row = (id: string, arriveMs: number, dwell: number): BenchRow => {
    const w = perf.window(dwell);
    const s = perf.stats();
    return { id, arriveMs: Math.round(arriveMs), ...w, draws: s.draws, tris: s.tris, programs: s.programs, gpuMB: s.gpuMB, heapMB: s.heapMB };
  };
  h.ui.toast(S.benchRunning);
  if (h.modes.current !== 'tour') await h.modes.enter('tour', {});
  for (const st of stops()) {
    const a = performance.now();
    perf.mark(`stop:${st.id}`);
    await goto(st.id);
    const arrive = performance.now() - a;
    await wait(5000);
    out.stops.push(row(st.id, arrive, 5000));
  }
  if (h.robots && h.modes.has('viewer')) {
    for (const id of h.robots.ids().slice(0, 3)) {
      const a = performance.now();
      perf.mark(`viewer:${id}`);
      await h.modes.enter('viewer', { robot: id } satisfies ViewerEnterArg);
      const arrive = performance.now() - a;
      await wait(4000);
      out.viewer.push(row(`viewer:${id}`, arrive, 4000));
    }
  }
  if (h.modes.has('film')) {
    const a = performance.now();
    perf.mark('film');
    await Promise.race([h.modes.enter('film', { stills: true, bench: true } satisfies FilmEnterArg), wait(120000)]);
    out.film = row('film', performance.now() - a, Math.min(30000, performance.now() - a));
  }
  out.ms = Math.round(performance.now() - t0);
  show(h, out);
  return out;
}

function show(h: DiscoverHandle, r: BenchResult): void {
  const json = JSON.stringify(r);
  const fmt = (x: BenchRow): string => `${x.id}: p50 ${x.p50} · p90 ${x.p90} · >50 ${x.over50} · ${x.fps} fps · ${x.draws} dr · ${Math.round(x.tris / 1000)} k · ${x.gpuMB} MB`;
  const lines = [...r.stops, ...r.viewer, ...(r.film ? [r.film] : [])].map(fmt);
  const area = document.createElement('textarea');
  area.className = 'dsc-bench';
  area.readOnly = true;
  area.value = json;
  const card: CardSpec = {
    id: 'bench',
    eyebrow: S.perfTitle,
    title: S.benchDone,
    blocks: lines.map((l) => ({ kind: 'p' as const, text: l })),
    actions: [
      {
        id: 'copy',
        primary: true,
        label: S.copy,
        onSelect: () => {
          const done = (): void => h.ui.toast(S.copied);
          try {
            void navigator.clipboard.writeText(json).then(done, () => {
              area.select();
              document.execCommand?.('copy');
              done();
            });
          } catch {
            area.select();
          }
        },
      },
    ],
  };
  h.sheet.show(card, 'full');
  // the raw JSON, selectable, under the table
  h.sheet.el.querySelector('.dsc-card')?.append(area);
  h.ui.announce(S.benchDone);
}
