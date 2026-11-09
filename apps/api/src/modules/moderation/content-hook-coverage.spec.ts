import { HttpException } from '@nestjs/common';
import { ChannelsService } from '../channels/channels.service';
import { ClientReviewsService } from '../client-reviews/client-reviews.service';
import { LegalQaService } from '../legal-qa/legal-qa.service';
import { screenContent } from './content-screen';

/**
 * Feature reality audit 2026-11-08: the admin's moderation rules (blocked /
 * hold words, links, repeats, AI text check) now hold Q&A questions and
 * answers, client reviews and channel posts exactly as they hold posts and
 * comments: «block» is refused (422 CONTENT_BLOCKED), «hold» is saved hidden
 * and filed for the moderators, «allow» goes out as before.
 */
type Verdict = 'allow' | 'hold' | 'block';
const hookOf = (v: Verdict) => ({
  check: jest.fn(() => Promise.resolve(v)),
  record: jest.fn(() => Promise.resolve()),
});
const codeOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'RESOLVED';
  } catch (e) {
    const r = (e as HttpException).getResponse?.() as { code?: string };
    return r?.code ?? 'NO_CODE';
  }
};

describe('screenContent', () => {
  it('no hook or no text: allow; block throws CONTENT_BLOCKED', async () => {
    expect(
      await screenContent(undefined, 'x', { kind: 'review', authorId: 'u' }),
    ).toBe('allow');
    expect(
      await screenContent(hookOf('block'), '  ', {
        kind: 'review',
        authorId: 'u',
      }),
    ).toBe('allow');
    expect(
      await codeOf(
        screenContent(hookOf('block'), 'x', { kind: 'review', authorId: 'u' }),
      ),
    ).toBe('CONTENT_BLOCKED');
    expect(
      await screenContent(hookOf('hold'), 'x', {
        kind: 'review',
        authorId: 'u',
      }),
    ).toBe('hold');
  });
});

describe('Q&A question', () => {
  function qa(v: Verdict) {
    const hook = hookOf(v);
    const autoHold = { queue: jest.fn(() => Promise.resolve(true)) };
    const created: Record<string, unknown>[] = [];
    const svc = Object.create(LegalQaService.prototype) as LegalQaService;
    const later = jest.fn();
    Object.assign(svc, {
      moderationHook: hook,
      autoHold,
      settings: { boolean: jest.fn(() => Promise.resolve(true)) },
      safety: {
        screenQuestion: jest.fn((_u: string, t: string, b: string) =>
          Promise.resolve({
            texts: [t, b],
            flags: [],
            hash: 'h',
            warnings: [],
          }),
        ),
      },
      limits: { consume: jest.fn(() => Promise.resolve()) },
      prisma: {
        legalQuestion: {
          create: jest.fn((a: { data: Record<string, unknown> }) => {
            created.push(a.data);
            return Promise.resolve({ id: 'q1', ...a.data });
          }),
        },
      },
      assertEnabled: jest.fn(() => Promise.resolve()),
      later,
      presentQuestions: jest.fn(() => Promise.resolve([{ id: 'q1' }])),
    });
    const ask = () =>
      svc.ask({ sub: 'c1', role: 'client' } as never, {
        title: 'My landlord keeps the deposit',
        body: 'What can I do about it now?',
      });
    return { ask, hook, autoHold, created, later };
  }

  it('block: refused before anything is written', async () => {
    const h = qa('block');
    expect(await codeOf(h.ask())).toBe('CONTENT_BLOCKED');
    expect(h.created).toHaveLength(0);
  });

  it('hold: saved hidden, no attorney alert, filed for moderators', async () => {
    const h = qa('hold');
    await h.ask();
    expect(h.created[0]).toMatchObject({ status: 'hidden' });
    expect(h.later).not.toHaveBeenCalled();
    expect(h.autoHold.queue).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'legal_question', targetId: 'q1' }),
    );
  });

  it('allow: published and attorneys alerted as before', async () => {
    const h = qa('allow');
    await h.ask();
    expect(h.created[0].status).toBeUndefined();
    expect(h.later).toHaveBeenCalled();
    expect(h.hook.record).toHaveBeenCalled();
  });
});

describe('channel post', () => {
  function channel(v: Verdict) {
    const hook = hookOf(v);
    const autoHold = { queue: jest.fn(() => Promise.resolve(true)) };
    const fanout = { start: jest.fn(() => Promise.resolve()) };
    const realtime = { toRoom: jest.fn() };
    const created: Record<string, unknown>[] = [];
    const channelUpdate = jest.fn(() => Promise.resolve());
    const tx = {
      channelPost: {
        create: jest.fn((a: { data: Record<string, unknown> }) => {
          created.push(a.data);
          return Promise.resolve({
            id: 'p1',
            author_id: 'a1',
            created_at: new Date(),
            ...a.data,
          });
        }),
      },
      channel: { update: channelUpdate },
    };
    const svc = Object.create(ChannelsService.prototype) as ChannelsService;
    Object.assign(svc, {
      moderationHook: hook,
      autoHold,
      fanout,
      realtime,
      logger: { warn: jest.fn() },
      settings: { number: jest.fn(() => Promise.resolve(10)) },
      limits: { consume: jest.fn(() => Promise.resolve()) },
      files: { assertAttachable: jest.fn() },
      videos: { takeReady: jest.fn() },
      prisma: {
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
      },
      assertEnabled: jest.fn(() => Promise.resolve()),
      asAdmin: jest.fn(() =>
        Promise.resolve({
          channel: { id: 'ch1', status: 'active', title: 'T', username: 't' },
        }),
      ),
      assertCanPublish: jest.fn(() => Promise.resolve()),
      presentPosts: jest.fn(() => Promise.resolve([{ id: 'p1' }])),
    });
    const post = () =>
      (
        svc as unknown as {
          createPost(u: unknown, id: string, dto: unknown): Promise<unknown>;
        }
      ).createPost({ sub: 'a1' }, 'ch1', { body: 'A post for the channel' });
    return { post, created, autoHold, fanout, realtime, channelUpdate };
  }

  it('block: refused, nothing written', async () => {
    const h = channel('block');
    expect(await codeOf(h.post())).toBe('CONTENT_BLOCKED');
    expect(h.created).toHaveLength(0);
  });

  it('hold: saved hidden, no fan-out, no live push, not counted, filed for moderators', async () => {
    const h = channel('hold');
    await h.post();
    expect(h.created[0]).toMatchObject({ status: 'hidden' });
    expect(h.fanout.start).not.toHaveBeenCalled();
    expect(h.realtime.toRoom).not.toHaveBeenCalled();
    expect(h.channelUpdate).not.toHaveBeenCalled();
    expect(h.autoHold.queue).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'channel_post', targetId: 'p1' }),
    );
  });

  it('allow: published, fanned out and counted as before', async () => {
    const h = channel('allow');
    await h.post();
    expect(h.created[0].status).toBeUndefined();
    expect(h.fanout.start).toHaveBeenCalled();
    expect(h.realtime.toRoom).toHaveBeenCalled();
    expect(h.channelUpdate).toHaveBeenCalled();
  });
});

describe('client review (open)', () => {
  function review(v: Verdict, existing: { id: string } | null = null) {
    const hook = hookOf(v);
    const autoHold = { queue: jest.fn(() => Promise.resolve(true)) };
    const notifications = { emit: jest.fn(() => Promise.resolve()) };
    const writes: Record<string, unknown>[] = [];
    const tx = {
      clientReview: {
        findFirst: jest.fn(() => Promise.resolve(existing)),
        create: jest.fn((a: { data: Record<string, unknown> }) => {
          writes.push(a.data);
          return Promise.resolve({ id: 'cr1' });
        }),
        update: jest.fn((a: { data: Record<string, unknown> }) => {
          writes.push(a.data);
          return Promise.resolve({ id: existing?.id ?? 'cr1' });
        }),
      },
    };
    const svc = Object.create(
      ClientReviewsService.prototype,
    ) as ClientReviewsService;
    Object.assign(svc, {
      moderationHook: hook,
      autoHold,
      notifications,
      prisma: {
        $transaction: jest.fn((fn: (t: typeof tx) => unknown) => fn(tx)),
        userBlock: { findFirst: jest.fn(() => Promise.resolve(null)) },
        block: { findFirst: jest.fn(() => Promise.resolve(null)) },
      },
      assertCanWrite: jest.fn(() => Promise.resolve()),
      assertCanSee: jest.fn(() => Promise.resolve()),
      checkPhotos: jest.fn(() => Promise.resolve([])),
      recalc: jest.fn(() => Promise.resolve()),
      present: jest.fn(() => Promise.resolve([{ id: 'cr1' }])),
    });
    const write = () =>
      svc.upsertOpen({ sub: 'a1', role: 'attorney' } as never, 'client-1', {
        rating: 4,
        body: 'Paid on time and was polite.',
      });
    return { write, writes, autoHold, notifications };
  }

  it('block: refused before the write', async () => {
    const h = review('block');
    expect(await codeOf(h.write())).toBe('CONTENT_BLOCKED');
    expect(h.writes).toHaveLength(0);
  });

  it('hold: a new review is saved hidden, no notice, filed for moderators', async () => {
    const h = review('hold');
    await h.write();
    expect(h.writes[0]).toMatchObject({ status: 'hidden' });
    expect(h.notifications.emit).not.toHaveBeenCalled();
    expect(h.autoHold.queue).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'client_review' }),
    );
  });

  it('hold on an edit: hidden and filed for moderators (a clean review cannot be edited into held text)', async () => {
    const h = review('hold', { id: 'cr0' });
    await h.write();
    expect(h.writes[0]).toMatchObject({ status: 'hidden' });
    expect(h.autoHold.queue).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'client_review', targetId: 'cr0' }),
    );
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it('allow on an edit: status untouched, no new notice', async () => {
    const h = review('allow', { id: 'cr0' });
    await h.write();
    expect(h.writes[0].status).toBeUndefined();
    expect(h.autoHold.queue).not.toHaveBeenCalled();
    expect(h.notifications.emit).not.toHaveBeenCalled();
  });

  it('allow: published and the client told, as before', async () => {
    const h = review('allow');
    await h.write();
    expect(h.writes[0].status).toBeUndefined();
    expect(h.notifications.emit).toHaveBeenCalled();
  });
});
