import { ConflictException, NotFoundException } from '@nestjs/common';
import { broadcastAudienceWhere } from './broadcast-audience';
import { eachId } from './bulk.util';

describe('eachId (bulk moderation)', () => {
  it('runs each distinct id once and sorts the failures', async () => {
    const seen: string[] = [];
    const r = await eachId(['a', 'b', 'a', 'c', 'd'], (id) => {
      seen.push(id);
      if (id === 'b') return Promise.reject(new NotFoundException());
      if (id === 'c') return Promise.reject(new ConflictException());
      if (id === 'd') return Promise.reject(new Error('boom'));
      return Promise.resolve();
    });
    expect(seen).toEqual(['a', 'b', 'c', 'd']);
    expect(r).toEqual({
      done: ['a'],
      skipped: [
        { id: 'b', reason: 'not_found' },
        { id: 'c', reason: 'invalid_state' },
        { id: 'd', reason: 'failed' },
      ],
    });
  });
});

describe('broadcastAudienceWhere with several states', () => {
  it('matches any of the chosen states; none = every state', () => {
    const where = broadcastAudienceWhere('clients', ['IL', 'NY', 'IL']);
    expect(where.OR).toContainEqual({
      client_profile: { state_code: { in: ['IL', 'NY'] } },
    });
    expect(broadcastAudienceWhere('all', []).OR).toBeUndefined();
    expect(broadcastAudienceWhere('all', null).OR).toBeUndefined();
  });
});
