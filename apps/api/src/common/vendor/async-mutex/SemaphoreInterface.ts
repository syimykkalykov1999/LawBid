/* eslint-disable */
/*
 * Vendored from async-mutex v0.5.0 (src/SemaphoreInterface.ts), MIT License,
 * Copyright (c) 2016 Christian Speckner — https://github.com/DirtyHairy/async-mutex
 * Copied whole (only reformatted); see apps/api/THIRD_PARTY_NOTICES.md.
 */
interface SemaphoreInterface {
  acquire(
    weight?: number,
    priority?: number,
  ): Promise<[number, SemaphoreInterface.Releaser]>;

  runExclusive<T>(
    callback: SemaphoreInterface.Worker<T>,
    weight?: number,
    priority?: number,
  ): Promise<T>;

  waitForUnlock(weight?: number, priority?: number): Promise<void>;

  isLocked(): boolean;

  getValue(): number;

  setValue(value: number): void;

  release(weight?: number): void;

  cancel(): void;
}

namespace SemaphoreInterface {
  export interface Releaser {
    (): void;
  }

  export interface Worker<T> {
    (value: number): Promise<T> | T;
  }
}

export default SemaphoreInterface;
