import { describe, expect, it } from 'vitest';
import { activeZones } from './translate-zones';

describe('activeZones', () => {
  it('every zone with «Везде», only the switched-on ones otherwise', () => {
    const values = { 'translate.posts': false, 'translate.reviews': false };
    expect(activeZones('all', values)).toHaveLength(5);
    expect(activeZones('zones', values)).toEqual(['translate.chat', 'translate.cases', 'translate.profiles']);
  });
});
