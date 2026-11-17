import { describe, expect, it } from 'vitest';
import { tuningChanges, type TuningTarget } from './autoscale-tuning';

const T: TuningTarget = {
  target: 'redis',
  available: true,
  knobs: [
    { key: 'down_window_h', ru: 'Окно', min: 0.25, max: 72, kind: 'number', value: 2 },
    { key: 'night_start_h', ru: 'С часа', min: 0, max: 23, kind: 'integer', value: null },
    { key: 'single_node_up', ru: 'Рост одиночного', min: 0, max: 1, kind: 'flag', value: null },
  ],
};

describe('«Авто» numbers form (owner 14.11)', () => {
  it('sends only what changed; an emptied field goes back to the default', () => {
    expect(tuningChanges(T, { down_window_h: '', night_start_h: '19', single_node_up: '0' })).toEqual({
      values: { down_window_h: null, night_start_h: 19, single_node_up: 0 },
      errors: [],
    });
    expect(tuningChanges(T, { down_window_h: '2' })).toEqual({ values: {}, errors: [] });
    expect(tuningChanges(T, { down_window_h: '1,5' }).values).toEqual({ down_window_h: 1.5 });
  });

  it('names the field when a value is outside its bounds', () => {
    expect(tuningChanges(T, { night_start_h: '25', single_node_up: '0.5' }).errors).toEqual([
      'С часа: от 0 до 23, целое',
      'Рост одиночного: от 0 до 1, целое',
    ]);
  });
});
