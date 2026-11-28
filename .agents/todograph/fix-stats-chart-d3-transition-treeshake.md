---
id: fix-stats-chart-d3-transition-treeshake
description: "v1.4.2+ statistics stacked chart blank: d3@7.9.1+ barrel sideEffects:false lets bundlers drop d3-transition's selection.prototype patch (d3/d3#4151)"
status: open
priority: 0
type: task
tags: [regression, d3, rolldown, statistics]
created_at: 2026-11-28T13:49:29.1762155Z
updated_at: 2026-11-28T14:06:55.493258Z
---
## Context

Issue #61: stacked bar chart (StackedPlaytimeChart) blank since v1.4.2.

Root cause (confirmed against upstream d3/d3#4151): d3 7.9.1+ rebuilt the aggregate package (PR d3#4149, published 2026-11-03) and declared `"sideEffects": false` on the pure re-export barrel `dist/d3.mjs`. d3-transition installs `selection.prototype.transition/interrupt` purely as an import side effect and exports nothing the app uses, so bundlers (webpack 5 / rollup+node-resolve / rolldown) prune the unused `export * from 'd3-transition'` edge and never reach d3-transition at all — its own `sideEffects: true` is never consulted. At runtime the d3 join throws `TypeError: t.transition is not a function`, aborting the chart render effect.

Isolated probes (rolldown 1.2.19): fake barrel with `sideEffects: false` -> patch dropped; without the field -> patch kept. Explicit bare `import 'd3-transition'` from app code keeps the patch (the edge lives in a non-pure module). rolldown 1.3.4 still prunes. d3 maintainer refuses to fix (d3#4151); fix PR d3#4152 open, unmerged. Precedent: d3#3328 and d3-transition#100 rejected the same flag back in 2019.

Vector: renovate PR d56dd0c brought d3 7.9.2 into v1.4.2's lockfile (semver-compliant).

## Work

- [x] Root-cause analysis
- [x] Fix shipped: explicit `import 'd3-transition'` in StackedPlaytimeChart.tsx + `d3-transition` as a direct dependency (pnpm strict layout requires it), d3 restored to ^7.9.2. Validated via mock-Tauri headless harness: 0/8 runs with the transition error, chart renders with axes. Earlier conclusion "explicit import does not help" was a methodology artifact (build failed on unresolvable bare import, stale chunks were grepped).
- [ ] Once d3 ships a fixed release (d3#4152 or similar), the explicit import becomes a harmless redundancy; decide then whether to keep or remove it.

## Notes

Full investigation report: docs/issue61-d3-transition-regression.md. The Statistics chunk grows ~15.5 KB raw / ~4.8 KB gzip (d3-transition itself, required in any working configuration).