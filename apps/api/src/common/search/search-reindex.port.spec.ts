import { parseSearchAutoLog } from './search-reindex.port';

describe('search «Авто» step log', () => {
  it('reads the entries, newest first, and skips broken lines', () => {
    const lines = [
      JSON.stringify({
        at: '2026-11-09T10:40:00Z',
        step: 'search:set_mode:engine',
        reason: 'готово',
      }),
      'not json',
      JSON.stringify({ step: 'no time' }),
      JSON.stringify({
        at: '2026-11-09T10:00:00Z',
        step: 'search:set_mode:shadow',
      }),
    ];
    expect(parseSearchAutoLog(lines)).toEqual([
      {
        at: '2026-11-09T10:40:00Z',
        step: 'search:set_mode:engine',
        reason: 'готово',
      },
      {
        at: '2026-11-09T10:00:00Z',
        step: 'search:set_mode:shadow',
        reason: '',
      },
    ]);
  });
});
