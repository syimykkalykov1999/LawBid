import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from '../../common/errors/error-code.enum';
import Semaphore from '../../common/vendor/async-mutex/Semaphore';

const MB = 1024 * 1024;

/** In-flight bytes of whole-file reads of `confirm` on one API process. */
export const CONFIRM_READ_BUDGET_MB = 128;
/** Confirms waiting for the budget before new ones get 429. */
export const CONFIRM_READ_MAX_WAITING = 100;
/** In-flight bytes of whole-file reads of the scan worker (one process). */
export const SCAN_READ_BUDGET_MB = 256;

/**
 * Security audit 2026-11-08 (L6): `confirm` and the scan job read a whole
 * object into memory (up to the purpose's size cap). Many confirms at once
 * from many accounts could take the process's memory. This is a byte
 * budget: a read waits until its megabytes fit, so at most [budgetMb] are
 * held at once; a file larger than the whole budget runs alone. With
 * [maxWaiting] a full line answers 429 RATE_LIMITED instead of growing.
 * The weighted semaphore is async-mutex's (MIT, vendored).
 */
export class ReadBudget {
  private readonly sem: Semaphore;
  private waiting = 0;

  constructor(
    private readonly budgetMb: number,
    private readonly maxWaiting = Number.POSITIVE_INFINITY,
  ) {
    this.sem = new Semaphore(budgetMb);
  }

  /** Megabytes free right now (tests, metrics). */
  freeMb(): number {
    return this.sem.getValue();
  }

  async run<T>(bytes: number, work: () => Promise<T>): Promise<T> {
    // An unknown size (a row without size_bytes) counts as one megabyte.
    const mb = Number.isFinite(bytes) ? Math.ceil(bytes / MB) : 1;
    const weight = Math.min(this.budgetMb, Math.max(1, mb));
    if (weight > this.sem.getValue() && this.waiting >= this.maxWaiting) {
      throw new HttpException(
        {
          code: ErrorCode.RATE_LIMITED,
          message: 'Too many uploads at once. Try again in a moment.',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    this.waiting++;
    let release: () => void;
    try {
      [, release] = await this.sem.acquire(weight);
    } finally {
      this.waiting--;
    }
    try {
      return await work();
    } finally {
      release();
    }
  }
}
