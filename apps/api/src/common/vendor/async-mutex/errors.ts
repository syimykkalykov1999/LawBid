/*
 * Vendored from async-mutex v0.5.0 (src/errors.ts), MIT License,
 * Copyright (c) 2016 Christian Speckner — https://github.com/DirtyHairy/async-mutex
 * Copied whole (only reformatted); see apps/api/THIRD_PARTY_NOTICES.md.
 */
export const E_TIMEOUT = new Error(
  'timeout while waiting for mutex to become available',
);
export const E_ALREADY_LOCKED = new Error('mutex already locked');
export const E_CANCELED = new Error('request for lock canceled');
