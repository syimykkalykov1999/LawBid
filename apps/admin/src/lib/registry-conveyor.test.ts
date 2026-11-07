import { describe, expect, it, vi } from 'vitest';
import { cardHref, copyChips, nextInQueue, openRegistry, queueFilterFrom, queueSearch, REGISTRY_TAB, registryButtonLabel, registryLinks } from './registry-conveyor';

/** Owner 2026-11-04 (R-400): the verification conveyor's pure rules. */
const lic = (stateCode: string, barNumber: string, lookupUrl: string | null, stateName?: string) => ({ stateCode, stateName: stateName ?? null, barNumber, lookupUrl });

describe('registry links per state (R-400)', () => {
  it('shows the API lookup address of each state once, a search page or a profile page alike', () => {
    const links = registryLinks([
      lic('CA', '123456', 'https://apps.calbar.ca.gov/attorney/Licensee/Detail/123456', 'California'),
      lic('NY', '4455667', 'https://iapps.courts.state.ny.us/attorneyservices/search?0=', 'New York'),
      lic('NY', '9988776', 'https://iapps.courts.state.ny.us/attorneyservices/search?0=', 'New York'),
    ]);
    expect(links.map((l) => l.stateCode)).toEqual(['CA', 'NY']);
    expect(links[0]!.url).toBe('https://apps.calbar.ca.gov/attorney/Licensee/Detail/123456');
    expect(links[0]!.stateName).toBe('California');
    expect(registryButtonLabel(links[0]!, 2)).toBe('Открыть реестр CA');
    expect(registryButtonLabel(links[0]!, 1)).toBe('Открыть реестр штата');
  });

  it('a state without a lookup page keeps its place with url = null (the button says «реестра нет»)', () => {
    const links = registryLinks([lic('ZZ', '1', null)]);
    expect(links).toEqual([{ stateCode: 'ZZ', stateName: 'ZZ', barNumber: '1', url: null }]);
  });
});

describe('one browser tab for the registry (R-400)', () => {
  it('opens every address into the same named tab and never passes noopener', () => {
    const focus = vi.fn();
    const open = vi.fn(() => ({ focus }) as unknown as Window);
    const w = openRegistry('https://www.floridabar.org/directories/find-mbr/', { open });
    openRegistry('https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch', { open });
    expect(open).toHaveBeenNthCalledWith(1, 'https://www.floridabar.org/directories/find-mbr/', REGISTRY_TAB);
    expect(open).toHaveBeenNthCalledWith(2, 'https://apps.calbar.ca.gov/attorney/LicenseeSearch/QuickSearch', REGISTRY_TAB);
    expect(REGISTRY_TAB).toBe('lawbid-registry');
    for (const call of open.mock.calls) expect(call).toHaveLength(2);
    expect(focus).toHaveBeenCalled();
    expect(w).toBeTruthy();
  });

  it('a popup blocker gives null back', () => {
    expect(openRegistry('https://example.org', { open: () => null })).toBeNull();
  });
});

describe('copy chips (R-400)', () => {
  it('ФИО as in the application, the bar number, the state; the date of birth only when known', () => {
    const chips = copyChips({ attorney: { firstName: 'Anna', lastName: 'Lawyer' }, licenses: [lic('IL', '6248201047', null, 'Illinois')] });
    expect(chips).toEqual([
      { id: 'name', label: 'ФИО', value: 'Anna Lawyer' },
      { id: 'bar', label: '№ лицензии', value: '6248201047' },
      { id: 'state', label: 'Штат', value: 'IL — Illinois' },
    ]);
    const withBirth = copyChips({ attorney: { firstName: 'Anna', lastName: 'Lawyer', birthDate: '1990-05-17T00:00:00.000Z' }, licenses: [lic('IL', '1', null)] });
    expect(withBirth.at(-1)).toEqual({ id: 'birth', label: 'Дата рождения', value: '1990-05-17' });
  });

  it('several licenses: one number chip per state, the chips name the state', () => {
    const chips = copyChips({ attorney: { firstName: 'A', lastName: 'B' }, licenses: [lic('NY', '111', null), lic('NJ', '222', null)] });
    expect(chips.filter((c) => c.id === 'bar').map((c) => `${c.label}=${c.value}`)).toEqual(['№ NY=111', '№ NJ=222']);
    expect(chips.filter((c) => c.id === 'state').map((c) => c.label)).toEqual(['Штат NY', 'Штат NJ']);
  });
});

describe('the next request of the same filter (R-400)', () => {
  const rows = [
    { id: 'cur', status: 'in_review', reviewerId: 'me' },
    { id: 'other', status: 'in_review', reviewerId: 'someone' },
    { id: 'wait', status: 'needs_more_info', reviewerId: null },
    { id: 'free', status: 'submitted', reviewerId: null },
    { id: 'mine', status: 'in_review', reviewerId: 'me' },
  ];
  it('skips the current one, another admin’s, those waiting for the attorney and those already left here', () => {
    expect(nextInQueue(rows, 'cur', { status: '', stateCode: '' }, 'me', new Set())).toBe('free');
    expect(nextInQueue(rows, 'cur', { status: '', stateCode: '' }, 'me', new Set(['free']))).toBe('mine');
    expect(nextInQueue(rows, 'cur', { status: '', stateCode: '' }, 'me', new Set(['free', 'mine']))).toBeNull();
  });
  it('inside the «needs_more_info» tab those requests are the queue', () => {
    expect(nextInQueue(rows, 'cur', { status: 'needs_more_info', stateCode: '' }, 'me', new Set())).toBe('wait');
  });
  it('the filter travels in the address and comes back clean', () => {
    expect(queueSearch({ status: '', stateCode: '' })).toBe('');
    expect(cardHref('req-2', { status: 'submitted', stateCode: 'NY' })).toBe('/verification/req-2?status=submitted&stateCode=NY');
    expect(queueFilterFrom(new URLSearchParams('status=submitted&stateCode=ny'))).toEqual({ status: 'submitted', stateCode: 'NY' });
    expect(queueFilterFrom(new URLSearchParams('status=hacked&stateCode=NEW'))).toEqual({ status: '', stateCode: '' });
  });
});
