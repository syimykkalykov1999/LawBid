/**
 * Adaptive concurrency limit: a TypeScript port of Netflix concurrency-limits
 * `Gradient2Limit` and `ExpAvgMeasurement`
 * (https://github.com/Netflix/concurrency-limits, concurrency-limits-core,
 * `limit/Gradient2Limit.java`, `limit/measurement/ExpAvgMeasurement.java`).
 *
 * Copyright 2018 Netflix, Inc.
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not
 * use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS, WITHOUT
 * WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 *
 * Changes from the original (apps/api/THIRD_PARTY_NOTICES.md): Java → TS;
 * metrics listeners and debug logging dropped; the bounds are settable at run
 * time (owner rule: every limit lives in the admin). The update math is the
 * original's line for line.
 *
 * The idea: compare the short-term RTT with the long-term (no-load) RTT. When
 * requests start queueing, the short RTT grows, the gradient falls under 1
 * and the limit shrinks; when latency is normal the limit grows by the queue
 * size (4) per sample, smoothed.
 */
export class ExpAvgMeasurement {
  private value = 0;
  private sum = 0;
  private count = 0;

  constructor(
    private readonly window: number,
    private readonly warmupWindow: number,
  ) {}

  add(sample: number): number {
    if (this.count < this.warmupWindow) {
      this.count++;
      this.sum += sample;
      this.value = this.sum / this.count;
    } else {
      const factor = 2.0 / (this.window + 1);
      this.value = this.value * (1 - factor) + sample * factor;
    }
    return this.value;
  }

  get(): number {
    return this.value;
  }

  reset(): void {
    this.value = 0;
    this.count = 0;
    this.sum = 0;
  }

  update(operation: (current: number) => number): void {
    this.value = operation(this.value);
  }
}

export interface Gradient2Options {
  /** Java default 20. */
  initialLimit?: number;
  /** Java default 20. */
  minLimit?: number;
  /** Java `maxConcurrency`, default 200. */
  maxLimit?: number;
  /** Java default 0.2. */
  smoothing?: number;
  /** Java default `concurrency -> 4`. */
  queueSize?: (concurrency: number) => number;
  /** Java default 600 samples. */
  longWindow?: number;
  /** Java default 1.5. */
  rttTolerance?: number;
}

export class Gradient2Limit {
  private estimatedLimit: number;
  private minLimit: number;
  private maxLimit: number;
  private readonly smoothing: number;
  private readonly queueSize: (concurrency: number) => number;
  private readonly tolerance: number;
  private readonly longRtt: ExpAvgMeasurement;
  lastRtt = 0;

  constructor(opts: Gradient2Options = {}) {
    this.estimatedLimit = opts.initialLimit ?? 20;
    this.minLimit = opts.minLimit ?? 20;
    this.maxLimit = opts.maxLimit ?? 200;
    this.smoothing = opts.smoothing ?? 0.2;
    this.queueSize = opts.queueSize ?? (() => 4);
    this.tolerance = opts.rttTolerance ?? 1.5;
    this.longRtt = new ExpAvgMeasurement(opts.longWindow ?? 600, 10);
  }

  /** Current limit (whole requests), as `AbstractLimit.getLimit()`. */
  get limit(): number {
    return Math.trunc(this.estimatedLimit);
  }

  /** Long-term (no-load) RTT estimate, same unit as the samples. */
  get rttNoLoad(): number {
    return this.longRtt.get();
  }

  /** Admin bounds, read live. The current estimate is clamped into them. */
  setBounds(minLimit: number, maxLimit: number): void {
    if (!(minLimit > 0) || !(maxLimit >= minLimit)) return;
    this.minLimit = minLimit;
    this.maxLimit = maxLimit;
    this.estimatedLimit = Math.max(
      minLimit,
      Math.min(maxLimit, this.estimatedLimit),
    );
  }

  /**
   * `Gradient2Limit._update(startTime, rtt, inflight, didDrop)`.
   * @param rtt round-trip time of one finished request (any unit, kept)
   * @param inflight requests in flight when it started
   */
  update(rtt: number, inflight: number): number {
    if (!(rtt > 0)) return this.limit;
    let estimatedLimit = this.estimatedLimit;
    const queueSize = this.queueSize(Math.trunc(estimatedLimit));

    this.lastRtt = rtt;
    const shortRtt = rtt;
    const longRtt = this.longRtt.add(rtt);

    // If the long RTT is substantially larger than the short RTT then reduce
    // the long RTT measurement. This can happen when latency returns to
    // normal after a prolonged prior of excessive load. Reducing the long RTT
    // without waiting for the exponential smoothing helps bring the system
    // back to steady state.
    if (longRtt / shortRtt > 2) {
      this.longRtt.update((current) => current * 0.95);
    }

    // Don't grow the limit if we are app limited
    if (inflight < estimatedLimit / 2) {
      return Math.trunc(estimatedLimit);
    }

    // Rtt could be higher than rtt_noload because of smoothing rtt noload
    // updates so set to 1.0 to indicate no queuing. Otherwise calculate the
    // slope and don't allow it to be reduced by more than half to avoid
    // aggressive load-shedding due to outliers.
    const gradient = Math.max(
      0.5,
      Math.min(1.0, (this.tolerance * longRtt) / shortRtt),
    );
    let newLimit = estimatedLimit * gradient + queueSize;
    newLimit =
      estimatedLimit * (1 - this.smoothing) + newLimit * this.smoothing;
    newLimit = Math.max(this.minLimit, Math.min(this.maxLimit, newLimit));

    estimatedLimit = newLimit;
    this.estimatedLimit = estimatedLimit;
    return Math.trunc(newLimit);
  }
}
