import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { RegistryResult } from './registry-result';

const base = { provider: 'ny', found: true, licenseStatus: 'active', registryStatus: 'Currently registered', name: 'Jane Doe', admittedAt: '2010-05-01', firm: 'Doe LLP', registryExpiresAt: '2027-01-31', sourceUrl: 'https://reg.example/1' };
afterEach(cleanup);

describe('RegistryResult', () => {
  it('found + name match', () => {
    render(<RegistryResult result={{ result: 'pass', ...base }} profileName="Jane Doe" />);
    expect(screen.getByText('найден')).toBeTruthy();
    expect(screen.getByText('совпадает')).toBeTruthy();
    expect(screen.getByText('действующая')).toBeTruthy();
    expect(screen.getByText(/Doe LLP/)).toBeTruthy();
    expect(screen.getByText(/2027-01-31/)).toBeTruthy();
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
    expect(screen.getByText(/как в реестре: Retired/)).toBeTruthy();
    expect(screen.queryByText('совпадает')).toBeNull();
  });
});
