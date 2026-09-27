import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

/**
 * docs/02_DATABASE.md §8, stage 2.5 acceptance (real CockroachDB):
 * client_message_id is unique per sender in a conversation;
 * stripe_webhook_events rejects a repeated event; a repeated like
 * doesn't create a duplicate. Plus follows self-CHECK.
 */
describe('DB schema — stage 2.5 acceptance', () => {
  const prisma = new PrismaClient();
  const UNIQUE_VIOLATION = { code: 'P2002' };

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function conversation() {
    await prisma.state.upsert({
      where: { code: 'NY' },
      create: { code: 'NY', name: 'New York' },
      update: {},
    });
    const area = await prisma.practiceArea.upsert({
      where: { code: 'general_practice.not_sure_or_other' },
      create: {
        code: 'general_practice.not_sure_or_other',
        name_en: 'Not Sure or Other',
        i18n_key: 'practice.general_practice.not_sure_or_other',
        sort: 1,
      },
      update: {},
    });
    const [client, attorney] = await Promise.all([
      prisma.user.create({ data: { role: 'client' } }),
      prisma.user.create({ data: { role: 'attorney' } }),
    ]);
    const c = await prisma.case.create({
      data: {
        client_id: client.id,
        title: 'Need advice',
        description: 'Details.',
        practice_area_id: area.id,
        primary_state_code: 'NY',
        budget_mode: 'clarify_later',
      },
    });
    const conv = await prisma.conversation.create({
      data: { case_id: c.id, client_id: client.id, attorney_id: attorney.id },
    });
    return { conv, client, attorney };
  }

  it('rejects a repeated client_message_id from the same sender', async () => {
    const { conv, client, attorney } = await conversation();
    const msg = {
      conversation_id: conv.id,
      sender_id: client.id,
      type: 'text' as const,
      body_original: 'hi',
      body_display: 'hi',
      client_message_id: 'm-1',
    };
    await prisma.message.create({ data: msg });
    await expect(prisma.message.create({ data: msg })).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
    // Same key from the other participant is a different message.
    await prisma.message.create({ data: { ...msg, sender_id: attorney.id } });
  });

  it('rejects a repeated Stripe webhook event', async () => {
    const event = {
      stripe_event_id: `evt_${randomUUID()}`,
      type: 'invoice.paid',
      payload: { id: 'in_1' },
    };
    await prisma.stripeWebhookEvent.create({ data: event });
    await expect(
      prisma.stripeWebhookEvent.create({ data: event }),
    ).rejects.toMatchObject(UNIQUE_VIOLATION);
  });

  it('a repeated like does not create a duplicate', async () => {
    const attorney = await prisma.user.create({ data: { role: 'attorney' } });
    const fan = await prisma.user.create({ data: { role: 'client' } });
    const post = await prisma.post.create({
      data: { author_id: attorney.id, body: 'Know your rights.' },
    });
    const like = { post_id: post.id, user_id: fan.id };
    // The service path: insert-if-absent, safe to repeat.
    for (let i = 0; i < 3; i++) {
      await prisma.postLike.createMany({ data: [like], skipDuplicates: true });
    }
    expect(await prisma.postLike.count({ where: { post_id: post.id } })).toBe(
      1,
    );
    await expect(prisma.postLike.create({ data: like })).rejects.toMatchObject(
      UNIQUE_VIOLATION,
    );
  });

  it('rejects following yourself', async () => {
    const u = await prisma.user.create({ data: { role: 'attorney' } });
    await expect(
      prisma.follow.create({ data: { follower_id: u.id, followee_id: u.id } }),
    ).rejects.toThrow(/23514/);
  });
});
