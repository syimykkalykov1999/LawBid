import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { caseTabFrom } from './case-tabs';
import { parseParam, replaceSearch, useUrlDraft, useUrlFlag, useUrlSearchText, useUrlState, withParams } from './url-state';

const go = (url: string) => window.history.replaceState(null, '', url);

beforeEach(() => go('/users'));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('url-state helpers', () => {
  it('withParams sets, replaces and removes keys', () => {
    expect(withParams('?a=1', { b: '2' })).toBe('?a=1&b=2');
    expect(withParams('?a=1&b=2', { a: null })).toBe('?b=2');
    expect(withParams('?a=1', { a: '' })).toBe('');
  });

  it('parseParam: missing or not allowed = the default', () => {
    expect(parseParam(null, 'open', ['open', 'closed'])).toBe('open');
    expect(parseParam('nope', 'open', ['open', 'closed'])).toBe('open');
    expect(parseParam('closed', 'open', ['open', 'closed'])).toBe('closed');
  });

  it('replaceSearch keeps the path and the hash and adds no history entry', () => {
    go('/cases?tab=disputes#x');
    const before = window.history.length;
    replaceSearch({ dstatus: 'resolved' });
    expect(window.location.pathname).toBe('/cases');
    expect(window.location.search).toBe('?tab=disputes&dstatus=resolved');
    expect(window.location.hash).toBe('#x');
    expect(window.history.length).toBe(before);
  });
});

describe('useUrlState', () => {
  it('reads the address, writes it, and drops the default from it', () => {
    go('/support?status=closed');
    const { result } = renderHook(() => useUrlState('status', 'open', ['open', 'closed', 'all'] as const));
    expect(result.current[0]).toBe('closed');
    act(() => result.current[1]('all'));
    expect(window.location.search).toBe('?status=all');
    expect(result.current[0]).toBe('all');
    act(() => result.current[1]('open'));
    expect(window.location.search).toBe('');
    expect(result.current[0]).toBe('open');
  });

  it('an unknown value in a hand-typed link reads as the default', () => {
    go('/support?status=hacked');
    const { result } = renderHook(() => useUrlState('status', 'open', ['open', 'closed'] as const));
    expect(result.current[0]).toBe('open');
  });

  it('«Назад» (popstate) re-reads the address', () => {
    const { result } = renderHook(() => useUrlState('status', 'open'));
    act(() => {
      go('/support?status=resolved');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current[0]).toBe('resolved');
  });

  it('a flag is ?key=1 when on and nothing when off', () => {
    const { result } = renderHook(() => useUrlFlag('unread'));
    expect(result.current[0]).toBe(false);
    act(() => result.current[1](true));
    expect(window.location.search).toBe('?unread=1');
    act(() => result.current[1](false));
    expect(window.location.search).toBe('');
  });
});

describe('useUrlSearchText (⌘K «Найти пользователя» → /users?q=…)', () => {
  it('starts from ?q= at once, so the list is filtered on arrival', () => {
    go('/users?q=jane');
    const { result } = renderHook(() => useUrlSearchText('q'));
    expect(result.current.text).toBe('jane');
    expect(result.current.value).toBe('jane');
  });

  it('typing reaches the address only after the pause, trimmed', () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useUrlSearchText('q', 300));
    act(() => result.current.setText('bob '));
    expect(window.location.search).toBe('');
    act(() => vi.advanceTimersByTime(300));
    expect(window.location.search).toBe('?q=bob');
    expect(result.current.value).toBe('bob');
    // what was typed is not rewritten while the address catches up
    expect(result.current.text).toBe('bob ');
  });

  it('a change from outside replaces the typed text', () => {
    const { result } = renderHook(() => useUrlSearchText('q'));
    act(() => {
      go('/users?q=alice');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.text).toBe('alice');
  });
});

describe('useUrlDraft (Enter to apply)', () => {
  it('the draft stays local until apply', () => {
    const { result } = renderHook(() => useUrlDraft('q'));
    act(() => result.current.setDraft('divorce'));
    expect(window.location.search).toBe('');
    act(() => result.current.apply('divorce'));
    expect(window.location.search).toBe('?q=divorce');
    expect(result.current.value).toBe('divorce');
    expect(result.current.draft).toBe('divorce');
  });
});

describe('caseTabFrom (overview links)', () => {
  it('opens the real tabs; the old ?tab=contact opens «Не могу связаться»', () => {
    expect(caseTabFrom('disputes')).toBe('disputes');
    expect(caseTabFrom('contact-issues')).toBe('contact-issues');
    expect(caseTabFrom('contact')).toBe('contact-issues');
    expect(caseTabFrom(null)).toBe('cases');
    expect(caseTabFrom('x')).toBe('cases');
  });
});
