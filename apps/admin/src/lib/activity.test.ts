import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/api/client', () => ({ api: { GET: vi.fn() }, ApiError: class extends Error {} }));

import {
  BACKGROUND_AFTER_MS,
  IDLE_STOP_MS,
  __setLastInput,
  idleMs,
  isBackgroundNow,
  startActivityTracking,
} from './activity';
import { livePoll } from './live';

const query = { state: { error: null } };

describe('idle tracking (S18-1)', () => {
  beforeEach(() => {
    __setLastInput(Date.now());
    // jsdom has no focused window; a focused one polls at the base rate.
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
  });

  it('a request right after input is the admin, not the tab', () => {
    expect(isBackgroundNow()).toBe(false);
    expect(livePoll(60_000)(query)).toBe(60_000);
  });

  it('after 2 minutes without input a request counts as background', () => {
    __setLastInput(Date.now() - BACKGROUND_AFTER_MS - 1_000);
    expect(isBackgroundNow()).toBe(true);
    expect(livePoll(60_000)(query)).toBe(60_000);
  });

  it('after 15 minutes without input the polls stop', () => {
    __setLastInput(Date.now() - IDLE_STOP_MS - 1_000);
    expect(livePoll(60_000)(query)).toBe(false);
  });

  it('real input restarts the clock', () => {
    __setLastInput(Date.now() - IDLE_STOP_MS - 1_000);
    startActivityTracking();
    window.dispatchEvent(new Event('keydown'));
    expect(idleMs()).toBeLessThan(1_000);
    expect(livePoll(60_000)(query)).toBe(60_000);
  });
});
