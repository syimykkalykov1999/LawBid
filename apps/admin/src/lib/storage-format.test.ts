import { describe, expect, it } from 'vitest';
import { formatBytes } from './storage-format';

describe('formatBytes', () => {
  it('reads like a person would say it', () => {
    expect(formatBytes(0)).toBe('0 Б');
    expect(formatBytes(1536)).toBe('1,5 КБ');
    expect(formatBytes(5 * 1024 ** 3)).toBe('5 ГБ');
    expect(formatBytes(250 * 1024 ** 2)).toBe('250 МБ');
  });
});
