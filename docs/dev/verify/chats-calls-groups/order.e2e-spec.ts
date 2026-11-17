// Проба П1 (аудит 17.11): порядок сообщений created_at против seq.
// Повторяет путь отправки chat.service.ts send(): транзакция -> SELECT ... FOR UPDATE
// по чату -> message.create (created_at = @default(now())).
// Сценарий: транзакция A началась раньше B, но замок чата первой взяла B.
// Запуск: docs/dev/verify/chats-calls-groups/run.sh order
import { PrismaClient } from '../src/generated/prisma/client';
import { randomUUID } from 'node:crypto';
import { pgAdapter } from '../src/prisma/pg-adapter';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('audit P1: created_at vs seq order (e2e)', () => {
  jest.setTimeout(60_000);
  const prisma = new PrismaClient({
    adapter: pgAdapter(process.env.DATABASE_URL),
  });
  afterAll(() => prisma.$disconnect());

  it('a send that began earlier but locked later', async () => {
    const att = await prisma.user.create({
      data: { role: 'attorney', first_name: 'P', last_name: 'A' },
    });
    const cli = await prisma.user.create({
      data: { role: 'client', first_name: 'P', last_name: 'C' },
    });
    const conv = await prisma.conversation.create({
      data: {
        attorney_id: att.id,
        client_id: cli.id,
        status: 'active',
        participants: { create: [{ user_id: att.id }, { user_id: cli.id }] },
      },
    });
    const lock = (tx: any) =>
      tx.$queryRaw`SELECT id FROM conversations WHERE id = ${conv.id}::UUID FOR UPDATE`;
    const create = (tx: any, n: string) =>
      tx.message.create({
        data: {
          conversation_id: conv.id,
          sender_id: cli.id,
          type: 'text',
          body_original: n,
          body_display: n,
          client_message_id: `${n}-${randomUUID()}`,
        },
      });
    let bDone!: () => void;
    const bCommitted = new Promise<void>((r) => (bDone = r));
    const a = prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1`; // транзакция A уже идёт в базе
      await bCommitted; // пока запрос A «в пути», B успевает взять замок
      await lock(tx);
      return create(tx, 'A');
    });
    await sleep(100);
    await prisma.$transaction(async (tx) => {
      await lock(tx);
      await create(tx, 'B');
    });
    bDone();
    await a;
    const rows = await prisma.message.findMany({
      where: { conversation_id: conv.id },
    });
    const A = rows.find((r) => r.body_display === 'A')!;
    const B = rows.find((r) => r.body_display === 'B')!;
    // Тот же запрос, что messages(afterId=B) в chat.service.ts:760-777
    const after = await prisma.message.findMany({
      where: {
        conversation_id: conv.id,
        OR: [
          { created_at: { gt: B.created_at } },
          { created_at: B.created_at, id: { gt: B.id } },
        ],
      },
    });
    const afterBReturnsA = after.some((r) => r.id === A.id);
    // eslint-disable-next-line no-console
    console.log(
      'AUDIT_P1 ' +
        JSON.stringify({
          A: { seq: A.seq, created_at: A.created_at },
          B: { seq: B.seq, created_at: B.created_at },
          afterB_returns_A: afterBReturnsA,
        }),
    );
    expect(B.seq).toBe(1);
    expect(A.seq).toBe(2);
    // Красный = дыра: A (seq 2) «старше» B по created_at, догонялка afterId=B его не вернёт.
    expect(afterBReturnsA).toBe(true);
  });
});
