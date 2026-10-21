import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { acceptInvites } from './support/group-invites';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';

/**
 * Owner 2026-10-20: calls from a group chat (video / phone buttons in the
 * group header): the host rings chosen members, the rest of the group joins
 * from the chat, leaving the group drops a person out of the call.
 */
jest.setTimeout(120_000);

describe('Group chat calls (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let base = '';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(0, '127.0.0.1');
    const { port } = (app.getHttpServer() as Server).address() as AddressInfo;
    base = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);
    tokens = app.get(TokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const token = (id: string) =>
    tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    });
  const auth = (id: string) => ({ Authorization: `Bearer ${token(id)}` });
  // Owner 2026-10-21: only people with an accepted chat or in each other's
  // phone book may be rung into a call — the test people know each other.
  const made: string[] = [];
  let queue: Promise<unknown> = Promise.resolve();
  const person = (first: string, { known = true } = {}) => {
    const job = queue.then(async () => {
      const u = await prisma.user.create({
        data: { role: 'client', first_name: first, last_name: 'Chat' },
      });
      if (known) {
        await prisma.contactMatch.createMany({
          data: made.map((other) => ({ owner_id: u.id, matched_id: other })),
          skipDuplicates: true,
        });
        made.push(u.id);
      }
      return u;
    });
    queue = job.catch(() => undefined);
    return job;
  };

  it('starts from the group, rings chosen members, others join, leaving drops out', async () => {
    const [owner, ann, bob, cy, out] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Bob'),
      person('Cy'),
      person('Out', { known: false }),
    ]);
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Team',
        type: 'closed',
        memberIds: [ann.id, bob.id, cy.id],
      })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [
      ann.id,
      bob.id,
      cy.id,
    ]);
    const gid = g.body.data.id as string;

    // Nobody in the group: 404. A plain member may not start (admins only).
    await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(out.id))
      .send({})
      .expect(404);
    await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(ann.id))
      .send({})
      .expect(403);

    // Nothing running yet.
    await api().get(`/api/v1/groups/${gid}/call`).set(auth(bob.id)).expect(404);

    // The owner rings Ann (and the outsider is ignored).
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({ video: false, userIds: [ann.id, out.id] })
      .expect(201);
    const call = started.body.data as {
      id: string;
      groupId: string;
      conversationId: string | null;
      status: string;
      group: boolean;
      participants: { userId: string; status: string }[];
    };
    expect(call.groupId).toBe(gid);
    expect(call.conversationId).toBeNull();
    expect(call.status).toBe('active');
    expect(call.group).toBe(true);
    expect(call.participants.map((p) => [p.userId, p.status]).sort()).toEqual(
      [
        [owner.id, 'joined'],
        [ann.id, 'invited'],
      ].sort(),
    );

    // Ann picks up; Bob (not rung) sees the call and joins; the outsider cannot.
    await api()
      .post(`/api/v1/calls/${call.id}/accept`)
      .set(auth(ann.id))
      .expect(200);
    const seen = await api()
      .get(`/api/v1/groups/${gid}/call`)
      .set(auth(bob.id))
      .expect(200);
    expect(seen.body.data.id).toBe(call.id);
    await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(out.id))
      .expect(404);
    const joined = await api()
      .post(`/api/v1/calls/${call.id}/join`)
      .set(auth(bob.id))
      .expect(200);
    expect(
      (
        joined.body as { data: { participants: { status: string }[] } }
      ).data.participants.filter(
        (p: { status: string }) => p.status === 'joined',
      ),
    ).toHaveLength(3);

    // A second start in the same group joins the running call.
    const again = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    expect(again.body.data.id).toBe(call.id);

    // Bob leaves the group: he is out of the call, the call goes on.
    await api()
      .post(`/api/v1/groups/${gid}/leave`)
      .set(auth(bob.id))
      .expect(204);
    await new Promise((r) => setTimeout(r, 300));
    const row = await prisma.callParticipant.findUniqueOrThrow({
      where: { call_id_user_id: { call_id: call.id, user_id: bob.id } },
    });
    expect(row.status).toBe('removed');
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).status,
    ).toBe('active');

    // Hanging up: Ann leaves, the owner is alone -> the call ends.
    await api()
      .post(`/api/v1/calls/${call.id}/end`)
      .set(auth(ann.id))
      .send({})
      .expect(200);
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: call.id } })).status,
    ).toBe('ended');
    await api().get(`/api/v1/groups/${gid}/call`).set(auth(cy.id)).expect(404);
  });

  it('rings only the group members the starter is connected to (strangers wait for Requests)', async () => {
    const owner = await person('GOwn');
    const friend = await person('GFriend');
    const stranger = await person('GStranger', { known: false });
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Mixed',
        type: 'closed',
        memberIds: [friend.id, stranger.id],
      })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [
      friend.id,
      stranger.id,
    ]);
    const started = await api()
      .post(`/api/v1/groups/${g.body.data.id as string}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const ids = (
      started.body as { data: { participants: { userId: string }[] } }
    ).data.participants.map((p) => p.userId);
    expect(ids).toContain(friend.id);
    expect(ids).not.toContain(stranger.id);
  });

  it('limits the size, drops a removed member, lets the call outlive its host', async () => {
    const owner = await person('Host');
    const crowd = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'].map((n) => person(`M${n}`)),
    );
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Crowd',
        type: 'closed',
        memberIds: crowd.map((c) => c.id),
      })
      .expect(201);
    await acceptInvites(
      api,
      auth,
      g.body.data.id as string,
      crowd.map((c) => c.id),
    );
    const gid = g.body.data.id as string;
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const callId = started.body.data.id as string;

    // Audio holds nine: the host + eight join, the tenth is told it is full.
    for (const c of crowd.slice(0, 8)) {
      await api()
        .post(`/api/v1/calls/${callId}/join`)
        .set(auth(c.id))
        .expect(200);
    }
    const full = await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(crowd[8].id))
      .expect(409);
    expect((full.body as { error: { code: string } }).error.code).toBe(
      'CALL_STATE_CONFLICT',
    );

    // An admin removing a member from the group takes them out of the call.
    await api()
      .delete(`/api/v1/groups/${gid}/members/${crowd[0].id}`)
      .set(auth(owner.id))
      .expect(200);
    await new Promise((r) => setTimeout(r, 300));
    const gone = await prisma.callParticipant.findUniqueOrThrow({
      where: { call_id_user_id: { call_id: callId, user_id: crowd[0].id } },
    });
    expect(gone.status).toBe('removed');
    // ...and the freed place can be taken.
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(crowd[8].id))
      .expect(200);

    // The host hangs up: the call goes on while two or more are in it.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(owner.id))
      .send({})
      .expect(200);
    const status = async () =>
      (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status;
    expect(await status()).toBe('active');
    for (const c of crowd.slice(1, 8)) {
      await api()
        .post(`/api/v1/calls/${callId}/end`)
        .set(auth(c.id))
        .send({})
        .expect(200);
    }
    // One person left in it: over.
    expect(await status()).toBe('ended');
  });

  it('drops a member whose app went silent (swiped away) so they are not stuck in the call', async () => {
    const [owner, ann, bob] = await Promise.all([
      person('Own'),
      person('Ann'),
      person('Bob'),
    ]);
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({ title: 'Silent', type: 'closed', memberIds: [ann.id, bob.id] })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [ann.id, bob.id]);
    const gid = g.body.data.id as string;
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const callId = started.body.data.id as string;
    for (const u of [ann, bob]) {
      await api()
        .post(`/api/v1/calls/${callId}/join`)
        .set(auth(u.id))
        .expect(200);
    }
    // Bob's app is killed: no heartbeat for a minute. The others keep theirs.
    await prisma.callParticipant.updateMany({
      where: { call_id: callId, user_id: bob.id },
      data: { updated_at: new Date(Date.now() - 240_000) },
    });
    await api().get(`/api/v1/calls/${callId}`).set(auth(owner.id)).expect(200);
    const bobRow = await prisma.callParticipant.findUniqueOrThrow({
      where: { call_id_user_id: { call_id: callId, user_id: bob.id } },
    });
    expect(bobRow.status).toBe('left');
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status,
    ).toBe('active');
    // Bob is free again: a call of his own starts (no 409).
    await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(bob.id))
      .send({})
      .expect(403); // a plain member may not start; not "already in a call"
    // The last other person silent too: the call is over.
    await prisma.callParticipant.updateMany({
      where: { call_id: callId, user_id: { in: [ann.id, owner.id] } },
      data: { updated_at: new Date(Date.now() - 240_000) },
    });
    await api().get(`/api/v1/groups/${gid}/call`).set(auth(ann.id)).expect(404);
    expect(
      (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status,
    ).toBe('ended');
  });

  it('red button of one person: the others go on; a decline, a late join and a re-join change nobody else', async () => {
    const [owner, ann, bob, cy] = await Promise.all([
      person('Own'),
      person('Ann'),
      person('Bob'),
      person('Cy'),
    ]);
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Exits',
        type: 'closed',
        memberIds: [ann.id, bob.id, cy.id],
      })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [
      ann.id,
      bob.id,
      cy.id,
    ]);
    const gid = g.body.data.id as string;
    const started = await api()
      .post(`/api/v1/groups/${gid}/calls`)
      .set(auth(owner.id))
      .send({ userIds: [ann.id, bob.id] })
      .expect(201);
    const callId = started.body.data.id as string;
    const status = async () =>
      (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status;
    const row = async (id: string) =>
      (
        await prisma.callParticipant.findUniqueOrThrow({
          where: { call_id_user_id: { call_id: callId, user_id: id } },
        })
      ).status;

    // Ann declines the ring: the call and Bob's ring are untouched.
    await api()
      .post(`/api/v1/calls/${callId}/decline`)
      .set(auth(ann.id))
      .expect(200);
    expect(await status()).toBe('active');
    expect(await row(bob.id)).toBe('invited');
    await api()
      .post(`/api/v1/calls/${callId}/accept`)
      .set(auth(bob.id))
      .expect(200);

    // Cy joins late, three are in; Bob presses red: owner and Cy go on.
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(cy.id))
      .expect(200);
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(bob.id))
      .send({})
      .expect(200);
    expect(await status()).toBe('active');
    expect(await row(bob.id)).toBe('left');
    expect(await row(owner.id)).toBe('joined');
    expect(await row(cy.id)).toBe('joined');

    // Bob (and Ann, who declined) come back to the running call.
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(bob.id))
      .expect(200);
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(ann.id))
      .expect(200);
    expect(await row(bob.id)).toBe('joined');
    expect(await row(ann.id)).toBe('joined');

    // Telegram: the host leaves — the call goes on, the next member hosts.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(owner.id))
      .send({})
      .expect(200);
    expect(await status()).toBe('active');
    const after = await api()
      .get(`/api/v1/calls/${callId}`)
      .set(auth(ann.id))
      .expect(200);
    const hostId = (after.body as { data: { hostId: string } }).data.hostId;
    expect([cy.id, bob.id, ann.id]).toContain(hostId);
    // Only the host may end it for everyone.
    const other = [cy, bob, ann].find((u) => u.id !== hostId)!;
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(other.id))
      .send({ forAll: true })
      .expect(403);
    expect(await status()).toBe('active');
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(hostId))
      .send({ forAll: true })
      .expect(200);
    expect(await status()).toBe('ended');
    expect(await row(other.id)).toBe('left');
  });

  it('everyone leaves one by one: the last press ends the call', async () => {
    const owner = await person('Own2');
    const ann = await person('Ann2');
    const bob = await person('Bob2');
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({ title: 'Seq', type: 'closed', memberIds: [ann.id, bob.id] })
      .expect(201);
    await acceptInvites(api, auth, g.body.data.id as string, [ann.id, bob.id]);
    const started = await api()
      .post(`/api/v1/groups/${g.body.data.id as string}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const callId = started.body.data.id as string;
    const status = async () =>
      (await prisma.call.findUniqueOrThrow({ where: { id: callId } })).status;
    for (const u of [ann, bob]) {
      await api()
        .post(`/api/v1/calls/${callId}/accept`)
        .set(auth(u.id))
        .expect(200);
    }
    for (const u of [owner, ann, bob]) {
      await api()
        .post(`/api/v1/calls/${callId}/end`)
        .set(auth(u.id))
        .send({})
        .expect(200);
    }
    expect(await status()).toBe('ended');
  });

  it('no list = the whole group rings (up to the size of the call)', async () => {
    const owner = await person('Own');
    const crowd = await Promise.all(
      ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'].map((n) =>
        person(`R${n}`),
      ),
    );
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({
        title: 'Ring',
        type: 'closed',
        memberIds: crowd.map((c) => c.id),
      })
      .expect(201);
    await acceptInvites(
      api,
      auth,
      g.body.data.id as string,
      crowd.map((c) => c.id),
    );
    const started = await api()
      .post(`/api/v1/groups/${g.body.data.id as string}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const invited = (
      started.body as { data: { participants: { status: string }[] } }
    ).data.participants.filter((p) => p.status === 'invited');
    // Audio holds nine: the host + eight ring.
    expect(invited).toHaveLength(8);
  });

  it('vote to remove: only when nobody runs the call; strictly more "for"; barred for good', async () => {
    const owner = await person('VOwn');
    const m = await Promise.all(
      ['1', '2', '3', '4', '5'].map((n) => person(`V${n}`)),
    );
    const g = await api()
      .post('/api/v1/groups')
      .set(auth(owner.id))
      .send({ title: 'Vote', type: 'closed', memberIds: m.map((x) => x.id) })
      .expect(201);
    await acceptInvites(
      api,
      auth,
      g.body.data.id as string,
      m.map((x) => x.id),
    );
    const started = await api()
      .post(`/api/v1/groups/${g.body.data.id as string}/calls`)
      .set(auth(owner.id))
      .send({})
      .expect(201);
    const callId = started.body.data.id as string;
    for (const u of m) {
      await api()
        .post(`/api/v1/calls/${callId}/accept`)
        .set(auth(u.id))
        .expect(200);
    }
    const [a, b, c, d, x] = m;
    const vote = (who: { id: string }, target: { id: string }) =>
      api()
        .post(`/api/v1/calls/${callId}/votes`)
        .set(auth(who.id))
        .send({ targetId: target.id });
    const ballot = (who: { id: string }, voteId: string, favor: boolean) =>
      api()
        .post(`/api/v1/calls/${callId}/votes/${voteId}`)
        .set(auth(who.id))
        .send({ favor })
        .expect(200);
    const rowOf = async (id: string) =>
      (
        await prisma.callParticipant.findUniqueOrThrow({
          where: { call_id_user_id: { call_id: callId, user_id: id } },
        })
      ).status;
    const openVote = async (viewer: { id: string }) =>
      (
        (
          await api()
            .get(`/api/v1/calls/${callId}`)
            .set(auth(viewer.id))
            .expect(200)
        ).body as {
          data: {
            moderated: boolean;
            vote: { id: string; forCount: number } | null;
          };
        }
      ).data;

    // Owner 2026-10-21: a vote is open to everyone, the starter (and group
    // owner) being in the call too — the members may outvote the proposal.
    expect((await openVote(a)).moderated).toBe(true);
    await vote(a, x).expect(200);
    const idHost = (await openVote(b)).vote!.id;
    await ballot(b, idHost, false);
    await ballot(c, idHost, false);
    await ballot(d, idHost, false);
    expect(await rowOf(x.id)).toBe('joined');
    expect((await openVote(a)).vote).toBeNull();

    // The starter leaves, no admin is left: the members decide.
    await api()
      .post(`/api/v1/calls/${callId}/end`)
      .set(auth(owner.id))
      .send({})
      .expect(200);
    expect((await openVote(a)).moderated).toBe(false);

    // 2 for, 2 against: a tie keeps the member.
    const v1 = await vote(a, x).expect(200);
    expect(
      (v1.body as { data: { vote: { forCount: number } } }).data.vote.forCount,
    ).toBe(1);
    const id1 = (await openVote(b)).vote!.id;
    // The candidate cannot vote.
    await api()
      .post(`/api/v1/calls/${callId}/votes/${id1}`)
      .set(auth(x.id))
      .send({ favor: false })
      .expect(403);
    await ballot(b, id1, false);
    await ballot(c, id1, true);
    await ballot(d, id1, false);
    expect(await rowOf(x.id)).toBe('joined');
    expect((await openVote(a)).vote).toBeNull();

    // 3 for, 1 against: out — and barred from this call for good.
    await vote(a, x).expect(200);
    const id2 = (await openVote(b)).vote!.id;
    await ballot(b, id2, true);
    await ballot(c, id2, true);
    expect(await rowOf(x.id)).toBe('removed');
    await api()
      .post(`/api/v1/calls/${callId}/join`)
      .set(auth(x.id))
      .expect(403);
    await api()
      .post(`/api/v1/calls/${callId}/participants`)
      .set(auth(a.id))
      .send({ userId: x.id })
      .expect(403);

    // At the deadline the count decides: 1 for, 0 against passes.
    await vote(a, d).expect(200);
    await prisma.callVote.updateMany({
      where: { call_id: callId, status: 'open' },
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    await api().get(`/api/v1/calls/${callId}`).set(auth(a.id)).expect(200);
    expect(await rowOf(d.id)).toBe('removed');
  });
});
