import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { hasRegistryResult, RegistryResult } from './registry-result';

const base = { provider: 'ny', found: true, licenseStatus: 'active', registryStatus: 'Currently registered', name: 'Jane Doe', admittedAt: '2010-05-01', firm: 'Doe LLP', registryExpiresAt: '2027-01-31', sourceUrl: 'https://reg.example/1' };
afterEach(cleanup);

describe('RegistryResult', () => {
  it('found + name match', () => {
    render(<RegistryResult result={{ result: 'pass', ...base }} profileName="Jane Doe" />);
    expect(screen.getByText('найден')).toBeTruthy();
    expect(screen.getByText('совпадает')).toBeTruthy();
    expect(screen.getByText('действующая')).toBeTruthy();
    expect(screen.getByText(/Действует до: 2027-01-31/)).toBeTruthy();
    // «Допущен», «Фирма» and the raw answer live in the collapsed «Подробнее».
    const more = screen.getByTestId('registry-more');
    expect(more.hasAttribute('open')).toBe(false);
    expect(more.textContent).toContain('Фирма: Doe LLP');
    expect(more.textContent).toContain('Допущен: 2010-05-01');
    expect(more.textContent).toContain('"provider": "ny"');
    const top = screen.getByTestId('registry-result');
    const outside = Array.from(top.children).filter((c) => c !== more).map((c) => c.textContent).join(' ');
    expect(outside).not.toContain('Фирма');
    expect(outside).not.toContain('Допущен');
    expect(screen.getByText('Открыть запись в реестре').getAttribute('href')).toBe('https://reg.example/1');
  });

  it('name mismatch', () => {
    render(<RegistryResult result={{ result: 'manual_review', reason: 'name_mismatch', ...base, name: 'John Roe' }} profileName="Jane Doe" />);
    expect(screen.getByText('НЕ совпадает')).toBeTruthy();
    expect(screen.getByText('John Roe')).toBeTruthy();
  });

  it('not found', () => {
    render(<RegistryResult result={{ result: 'fail', reason: 'not_found', provider: 'ny', found: false, sourceUrl: null }} profileName="Jane Doe" />);
    expect(screen.getByText('не найден')).toBeTruthy();
    expect(screen.queryByText(/Имя в реестре/)).toBeNull();
    expect(screen.queryByText('Открыть запись в реестре')).toBeNull();
  });

  it('not active', () => {
    render(<RegistryResult result={{ result: 'fail', reason: 'not_active', ...base, licenseStatus: 'inactive', registryStatus: 'Retired' }} profileName="Jane Doe" />);
    expect(screen.getByText('недействующая')).toBeTruthy();
    expect(screen.getByTestId('registry-more').textContent).toContain('Статус как в реестре: Retired');
    expect(screen.queryByText('совпадает')).toBeNull();
  });

  it('hasRegistryResult tells a readable answer apart', () => {
    expect(hasRegistryResult({ result: 'pass', ...base })).toBe(true);
    expect(hasRegistryResult({ result: 'manual_review', reason: 'no_adapter_for_state' })).toBe(false);
    expect(hasRegistryResult(null)).toBe(false);
  });
});
