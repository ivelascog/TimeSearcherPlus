# TimeWidget performance benchmark

Reproducible numbers for the paper: TimeWidget vs. a naive Canvas, a naive SVG
and a Vega-Lite implementation of the same brushing task, measured the same way
on every machine. Design and rationale:
`docs/superpowers/specs/2026-10-07-performance-benchmark-design.md`.

## Run it

```bash
npm ci
npx playwright install chromium   # once per machine
npm run bench                     # full sweep, ~2–3 h
```

A Chromium window opens for every run. **Leave the machine alone until it
finishes:** plug in power, close other apps, don't cover or minimise the
window, don't switch to another app. The benchmark checks this and rejects
runs where the page lost visibility or focus; a rejected run is logged and the
run can be resumed.

Quick sanity check (TimeWidget only, a few minutes):

```bash
npm run bench -- --quick
```

In Windows PowerShell, quote the `--` separator so `npm.ps1` forwards all
options and their values to the runner. Also quote comma-separated lists,
which PowerShell otherwise treats as arrays:

```powershell
npm run bench '--' --quick
npm run bench '--' --quick --lines '1000,5000' --reps 2 --frames 100
```

Without the quoted separator, npm can consume options and pass their values
as unrelated positional arguments. The runner recognises
`npm_config_quick=true` for a bare `--quick`, but this cannot recover the
option/value pairs for the other arguments.

## What to send back

Everything lands in `bench/results/` (git-ignored):

| File                         | What                                                                                |
|------------------------------|-------------------------------------------------------------------------------------|
| `<host>-<date>.jsonl`        | the raw record: environment, every run with every frame. **Send this one.**         |
| `<host>-<date>.csv`          | one row per configuration; the first 21 columns match `rendimiento_TimeWidget.xlsx` |
| `<host>-<date>.summary.json` | per series: largest size under 16.7 / 33.3 / 100 ms (p95), ms per 100k points, R²   |

Datasets that go into the paper are copied to `bench/results/paper/`, which is
committed.

## If it stops

Interrupted (sleep, Ctrl-C, crash)? Resume the same file; finished runs are
not repeated:

```bash
npm run bench -- --resume bench/results/<host>-<date>.jsonl
```

## Why it refuses to run

Before measuring, it checks the environment and aborts if:

- **`2d_canvas` / `gpu_compositing` is not `enabled`.** Software rendering makes
  frame time measure the missing GPU, not TimeWidget (14 vs 60 FPS at 20k
  series in our tests). Check `chrome://gpu`; Remote Desktop and VMs often
  cause it. `--allow-software-raster` runs anyway and labels the results as a
  software-raster worst case.
- **The page is not visible and focused.** Chrome throttles hidden or
  background pages while they still report "visible".
- **The page is not cross-origin isolated.** Timers would be coarsened to
  100 µs.
- **The naive baselines select different series than TimeWidget.** A cheaper
  baseline must not be one that answers a smaller query.

## What is measured

- **FrameMs** (headline): the cost of each frame's slowest pipeline stage —
  the page's own clock (brush step → next `requestAnimationFrame`) or the busy
  time of the GPU process and compositors for that frame, read from a Chrome
  trace. Vsync and the frame-rate limit are off, so the monitor does not cap or
  quantise it, and frames are paced (a short busy-wait gap) so a fast main
  thread cannot starve the GPU. FPS columns are `1000 / FrameMs`.
- **MainThreadMs**, **GpuMs**, **Bottleneck**: the two main stages separately,
  and which one limited most frames.
- **PaceMs**, **Presented ratio**: the gap that let every stage finish (doubled
  automatically when needed) and presented/produced frames (should be ~1).
- Chrome traces explicitly disable unrelated categories and are collected in
  event batches, retaining only frame marks, swaps, task intervals and process/
  thread names. This avoids Node's whole-string size limit on large GPU traces.
  Unused event arguments are filtered in Chrome. Recording starts during the
  last five warm-up frames, retaining the complete measured interval without
  downloading traces of data loading or the earlier warm-up. All configured
  warm-up frames still run; tracing itself is warmed before measurement.
  GPU costs use top-level GPU thread tasks, without per-command GPU events.
  The trace buffer is 256 MiB; if it fills, that measurement is repeated once
  in a fresh browser with 512 MiB. A second loss rejects the measurement and
  remains retryable with `--resume`, including old trace-loss crash records.
- **CollisionMs, RenderMs, TotalCpuMs** (TimeWidget only): its internal
  breakdown. RenderMs is the time to *issue* canvas commands; rasterisation
  happens later on the GPU and is only visible in FrameMs. Internal monitoring
  records CPU work synchronously; it does not sample frame presentation or FPS.
- 60 warm-up + 300 measured frames, 5 fresh browser launches per
  configuration, randomised order, median across runs with a bootstrap 95% CI.
- After the last visible frame, Chrome still downloads its trace before Node
  analyses it and closes the browser. The runner prints these phases and their
  elapsed times (`runnerMs` in each successful JSONL record). Pacing retries are
  also announced: an insufficient gap repeats the whole measurement in a fresh
  browser before the next cell starts. These logs run outside measurement.

## Options

```
--quick                      TimeWidget only, 1k and 2.5k–25k in 2.5k steps, 2 reps
--adapters a,b               timewidget, canvas, svg, vegalite
--lines 1000,5000            series counts
--groups 1,3                 brush-group counts
--reps 5   --frames 300   --warmup 60   --seed 1
--channel chrome             use the installed Chrome instead of Playwright's Chromium
--monitor list               list available monitors and exit
--monitor 2                  open every benchmark window on monitor 2
--allow-software-raster      see above
--resume <file.jsonl>        continue an interrupted session
--out <dir>                  output directory (default bench/results)
```

Monitor selection uses Chrome's Window Management API and DevTools Protocol
on Windows, macOS and Linux, without additional OS utilities. A short-lived
Chrome window opens to discover the screens. Monitor numbers start at 1:
the primary screen first, then the others from left to right and top to bottom,
as printed by `--monitor list`. They may differ from OS settings numbering. Without
`--monitor`, Chromium chooses where to open its windows. The chosen display
is saved in the environment record. In PowerShell:

```powershell
npm run bench '--' --monitor list
npm run bench '--' --quick --monitor 2
```

Placement uses Chrome's CSS desktop coordinates, accounting for each monitor's
working area and DPI scale. The runner verifies the actual window is fully on
the selected display and its real content area fits the complete 1200×800
benchmark viewport before measuring; the viewport and DPR remain fixed.
If the desktop prevents positioning (for example, a Wayland compositor), it fails with an explicit error; use an
X11 session on Linux in that case. A recent Chrome/Chromium with the Window
Management API is required. To run the interactive placement regression
test locally (opens a Chromium window on each monitor):

```powershell
$env:BENCH_MONITOR_TEST = '1'
npm run test:e2e '--' tests/e2e/monitor.spec.js --workers=1
Remove-Item Env:BENCH_MONITOR_TEST
```

On macOS/Linux:

```bash
BENCH_MONITOR_TEST=1 npm run test:e2e -- tests/e2e/monitor.spec.js --workers=1
```
