# Third-party notices (apps/api)

Owner rule #1 (2026-10-28): proven open-source logic is copied as is; this
file lists what was taken and under which licence.

## Kubernetes — Horizontal Pod Autoscaler stabilization

- Source: `pkg/controller/podautoscaler/horizontal.go`
  (`stabilizeRecommendationWithBehaviors`) and the metric `tolerance`
  check in `pkg/controller/podautoscaler/replica_calculator.go`,
  https://github.com/kubernetes/kubernetes
- Licence: Apache License 2.0, Copyright The Kubernetes Authors
- Where: `apps/api/src/common/economy/economy.rules.ts`
  (`stabilizeCeiling`, `pruneSamples`) — ported from Go to TypeScript, the
  algorithm unchanged: an increase is the smallest recommendation of the
  scale-up window, a decrease the largest of the scale-down window, a
  recommendation within the tolerance keeps the current value.
- Change: 2026-11-09, PR «Потолок контейнеров без дёрганья».
