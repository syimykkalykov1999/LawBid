/* eslint-disable @typescript-eslint/require-await */
import { DomainEventConsumers } from './domain-event-consumers';
import {
  DOMAIN_EVENT_TYPES,
  type DomainEventRecord,
  type DomainEventMap,
} from './domain-event.types';
import { DomainEvents } from './domain-events.service';
import { EventsMaintenance } from './events.maintenance';
import { EFFECTS } from '../../sharding/outbox/outbox-effects';

function bus(sink = 'db') {
  const emitted: Array<{
    type: string;
    payload: Record<string, unknown>;
    key: string;
  }> = [];
  const outbox = {
    emit: jest.fn(
      async (
        _tx: unknown,
        type: string,
        payload: Record<string, unknown>,
        key: string,
      ) => {
        emitted.push({ type, payload, key });
        return null;
      },
    ),
    flush: jest.fn(async () => undefined),
  };
  const consumers = new DomainEventConsumers();
  const settings = { string: jest.fn(async () => sink) };
  const events = new DomainEvents(
    {} as never,
    outbox as never,
    consumers,
    settings as never,
  );
  return { events, outbox, consumers, emitted };
}

describe('DomainEvents emitter typing', () => {
  it('forces the payload shape per event type (compile-time)', () => {
    const ok: DomainEventMap['bid.placed'] = {
      bidId: 'b',
      caseId: 'c',
      attorneyId: 'a',
      feeType: 'fixed',
    };
    // @ts-expect-error missing fields
    const bad: DomainEventMap['bid.placed'] = { bidId: 'b' };
    expect(ok.bidId).toBe('b');
    expect(bad).toBeDefined();
    expect(DOMAIN_EVENT_TYPES).toContain('case.created');
  });
});

describe('DomainEvents outbox write', () => {
  it('writes through the existing outbox in the caller transaction', async () => {
    const { events, outbox, emitted } = bus('db');
    const tx = { marker: 'tx' };
    const t = await events.emit(
      tx as never,
      'post.published',
      {
        postId: 'p1',
        authorId: 'u1',
      },
      { key: 'k1', actorId: 'u1' },
    );
    expect(outbox.emit).toHaveBeenCalledTimes(1);
    expect(outbox.emit.mock.calls[0][0]).toBe(tx);
    expect(emitted[0].type).toBe('domain.event.record');
    expect(emitted[0].key).toBe('k1');
    expect(emitted[0].payload).toMatchObject({
      type: 'post.published',
      actorId: 'u1',
      stream: false,
    });
    expect(t?.event.type).toBe('post.published');
  });

  it('records nothing when the sink is off', async () => {
    const { events, outbox } = bus('off');
    const t = await events.emit({} as never, 'post.published', {
      postId: 'p',
      authorId: 'u',
    });
    expect(t).toBeNull();
    expect(outbox.emit).not.toHaveBeenCalled();
  });

  it('auto (the default) records nothing until a business consumer is registered (R-41)', async () => {
    const { events, consumers, emitted } = bus('auto');
    consumers.register({
      name: 'ops.daily-counter',
      types: '*',
      internal: true,
      handle: () => undefined,
    });
    expect(await events.sink()).toBe('off');
    expect(
      await events.emit({} as never, 'post.published', {
        postId: 'p',
        authorId: 'a',
      }),
    ).toBeNull();
    expect(emitted).toHaveLength(0);

    const live = bus('auto');
    live.consumers.register({
      name: 'experiments.exposure',
      types: ['case.created'],
      handle: () => undefined,
    });
    expect(await live.events.sink()).toBe('db');
  });

  it('a day past events.max_per_day records nothing more, in any mode', async () => {
    const consumers = new DomainEventConsumers();
    const redis = { get: jest.fn(async () => '1000') };
    const events = new DomainEvents(
      {} as never,
      { emit: jest.fn(), flush: jest.fn() } as never,
      consumers,
      {
        string: jest.fn(async () => 'db'),
        number: jest.fn(async () => 1000),
      } as never,
      redis as never,
    );
    expect(await events.sink()).toBe('off');
  });

  it('stream without a configured stream falls back to db', async () => {
    delete process.env.EVENTS_STREAM_NAME;
    const { events } = bus('stream');
    expect(await events.sink()).toBe('db');
  });

  it('the effect appends one idempotent domain_events row', async () => {
    const createMany = jest.fn(async () => ({ count: 1 }));
    await EFFECTS['domain.event.record'](
      {
        id: '11111111-1111-1111-1111-111111111111',
        type: 'case.created',
        key: 'k',
        actorId: null,
        payload: {},
        occurredAt: '2026-10-26T00:00:00.000Z',
        stream: false,
      } as never,
      { global: { domainEvent: { createMany } }, databases: [] } as never,
    );
    expect(createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it('flush hands the event to consumers after the commit', async () => {
    const { events, consumers } = bus('db');
    const seen: DomainEventRecord[] = [];
    consumers.register({
      name: 'spy',
      types: ['case.created'],
      handle: (e) => {
        seen.push(e);
      },
    });
    const t = await events.emit({} as never, 'case.created', {
      caseId: 'c',
      clientId: 'u',
      practiceAreaId: 'p',
    });
    await events.flush([t, null]);
    expect(seen).toHaveLength(1);
  });
});

describe('DomainEventConsumers registry', () => {
  it('rejects duplicate names, lists names, filters by type, isolates failures', async () => {
    const reg = new DomainEventConsumers();
    const calls: string[] = [];
    reg.register({
      name: 'b',
      types: '*',
      handle: () => {
        throw new Error('boom');
      },
    });
    reg.register({
      name: 'a',
      types: ['bid.placed'],
      handle: () => {
        calls.push('a');
      },
    });
    expect(() =>
      reg.register({ name: 'a', types: '*', handle: () => undefined }),
    ).toThrow(/already/);
    expect(reg.names()).toEqual(['a', 'b']);
    await reg.dispatch({
      id: '1',
      type: 'bid.placed',
      key: 'k',
      actorId: null,
      payload: {} as never,
      occurredAt: '',
    });
    await reg.dispatch({
      id: '2',
      type: 'case.created',
      key: 'k2',
      actorId: null,
      payload: {} as never,
      occurredAt: '',
    });
    expect(calls).toEqual(['a']);
  });
});

describe('EventsMaintenance retention', () => {
  it('prunes published rows older than events.retention_days', async () => {
    const findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'x' }, { id: 'y' }]);
    const deleteMany = jest.fn(async () => ({ count: 2 }));
    const prisma = { domainEvent: { findMany, deleteMany } };
    const settings = {
      number: jest.fn(async () => 30),
      string: jest.fn(async () => 'db'),
    };
    const m = new EventsMaintenance(
      prisma as never,
      { sink: async () => 'db' } as never,
      { available: () => false } as never,
      settings as never,
    );
    const now = new Date('2026-10-26T12:00:00Z');
    const n = await m.prune(now);
    expect(n).toBe(2);
    const where = (
      findMany.mock.calls[0] as unknown as [
        { where: { occurred_at: { lt: Date } } },
      ]
    )[0].where;
    expect(where.occurred_at.lt.toISOString()).toBe('2026-09-26T12:00:00.000Z');
  });

  it('auto switches to stream above the ceiling', async () => {
    const redis = {
      get: jest.fn(async (k: string) =>
        k.includes('2026-10-26') ? '5000' : null,
      ),
      set: jest.fn(async () => 'OK'),
    };
    const settings = {
      string: jest.fn(async () => 'auto'),
      number: jest.fn(async () => 1000),
    };
    const m = new EventsMaintenance(
      {} as never,
      {} as never,
      {} as never,
      settings as never,
      redis as never,
    );
    expect(await m.evaluateAuto(new Date('2026-10-26T12:00:00Z'))).toBe(
      'stream',
    );
  });

  it('relay ships unpublished rows and marks them', async () => {
    process.env.EVENTS_STREAM_NAME = 'x';
    const rows = [
      {
        id: 'i',
        type: 'case.created',
        idempotency_key: 'k',
        actor_user_id: null,
        payload: {},
        occurred_at: new Date(),
      },
    ];
    const findMany = jest.fn().mockResolvedValueOnce(rows);
    const updateMany = jest.fn(async () => ({ count: 1 }));
    const publish = jest.fn(async () => undefined);
    const m = new EventsMaintenance(
      { domainEvent: { findMany, updateMany } } as never,
      { sink: async () => 'stream' } as never,
      { available: () => true, publish },
    );
    expect(await m.relay()).toBe(1);
    expect(publish).toHaveBeenCalledTimes(1);
    expect(updateMany).toHaveBeenCalled();
    delete process.env.EVENTS_STREAM_NAME;
  });
});
