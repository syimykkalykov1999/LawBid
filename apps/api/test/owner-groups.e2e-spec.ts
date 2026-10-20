/* eslint-disable @typescript-eslint/no-unsafe-call -- supertest bodies are untyped */
import type { AddressInfo, Server } from 'node:net';
import { randomUUID } from 'node:crypto';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TokenService } from '../src/modules/auth/services/token.service';
import { GroupsService } from '../src/modules/groups/groups.service';

/**
 * Owner 2026-10-20: group chats and polls — create with people, roles,
 * rules (only admins write), the join link, replies / @mentions / edit /
 * delete for everyone / pin, polls (one or several answers, anonymous or
 * open, revote, close), and the "member removed" event for group calls.
 */
jest.setTimeout(120_000);

describe('Group chats and polls (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let tokens: TokenService;
  let groupsSvc: GroupsService;
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
    groupsSvc = app.get(GroupsService);
  });

  afterAll(async () => {
    await app.close();
  });

  const api = () => request(base);
  const bearer = (id: string) => ({
    Authorization: `Bearer ${tokens.signAccessToken({
      sub: id,
      role: 'client',
      sid: randomUUID(),
      verified: false,
      subscriptionStatus: 'none',
    })}`,
  });
  const person = (first: string) =>
    prisma.user.create({
      data: { role: 'client', first_name: first, last_name: 'Group' },
    });
  const cmid = () => randomUUID();

  async function makeGroup() {
    const [owner, ann, bob, cy] = await Promise.all([
      person('Olga'),
      person('Ann'),
      person('Bob'),
      person('Cy'),
    ]);
    const res = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({
        title: '  Team  ',
        type: 'closed',
        memberIds: [ann.id, bob.id],
      })
      .expect(201);
    return { owner, ann, bob, cy, id: res.body.data.id as string, res };
  }

  it('creates a group: owner + members, system lines, list and detail', async () => {
    const { owner, ann, id, res } = await makeGroup();
    expect(res.body.data.title).toBe('Team');
    expect(res.body.data.memberCount).toBe(3);
    expect(res.body.data.myRole).toBe('owner');
    expect(res.body.data.members.map((m: { role: string }) => m.role)).toEqual([
      'owner',
      'member',
      'member',
    ]);
    const msgs = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .expect(200);
    expect(
      msgs.body.data.map((m: { systemKind: string }) => m.systemKind),
    ).toEqual(['added', 'created']);
    const list = await api()
      .get('/api/v1/groups')
      .set(bearer(ann.id))
      .expect(200);
    expect(list.body.data.map((g: { id: string }) => g.id)).toContain(id);
    expect(list.body.data[0].myRole).toBe('member');
    // The creator needs someone to add.
    await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Solo', memberIds: [owner.id] })
      .expect(400);
  });

  it('strangers see nothing; members write, reply, @mention, edit, delete, pin', async () => {
    const { owner, ann, bob, cy, id } = await makeGroup();
    await api().get(`/api/v1/groups/${id}`).set(bearer(cy.id)).expect(404);
    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(cy.id))
      .send({ clientMessageId: cmid(), type: 'text', body: 'hi' })
      .expect(404);

    const key = cmid();
    const first = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({
        clientMessageId: key,
        type: 'text',
        body: 'Hello @Bob',
        mentionIds: [bob.id, cy.id],
      })
      .expect(201);
    expect(
      first.body.data.mentions.map((p: { userId: string }) => p.userId),
    ).toEqual([bob.id]);
    // Idempotent on clientMessageId.
    const again = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({ clientMessageId: key, type: 'text', body: 'Hello @Bob' })
      .expect(201);
    expect(again.body.data.id).toBe(first.body.data.id);

    const asBob = await api()
      .get('/api/v1/groups')
      .set(bearer(bob.id))
      .expect(200);
    const row = asBob.body.data.find((g: { id: string }) => g.id === id);
    expect(row.unreadCount).toBe(1);
    expect(row.unreadMentions).toBe(1);

    const reply = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(bob.id))
      .send({
        clientMessageId: cmid(),
        type: 'text',
        body: 'yes',
        replyToId: first.body.data.id,
      })
      .expect(201);
    expect(reply.body.data.replyTo.snippet).toBe('Hello @Bob');

    await api()
      .post(`/api/v1/groups/${id}/read`)
      .set(bearer(bob.id))
      .send({ lastReadMessageId: reply.body.data.id })
      .expect(200);
    const read = await api().get('/api/v1/groups').set(bearer(bob.id));
    expect(
      read.body.data.find((g: { id: string }) => g.id === id).unreadCount,
    ).toBe(0);

    // Edit: only the author's own text.
    await api()
      .patch(`/api/v1/groups/${id}/messages/${first.body.data.id}`)
      .set(bearer(bob.id))
      .send({ body: 'hijack' })
      .expect(403);
    const edited = await api()
      .patch(`/api/v1/groups/${id}/messages/${first.body.data.id}`)
      .set(bearer(ann.id))
      .send({ body: 'Hello all' })
      .expect(200);
    expect(edited.body.data.editedAt).not.toBeNull();

    // Pin: admins only.
    await api()
      .put(`/api/v1/groups/${id}/pin`)
      .set(bearer(ann.id))
      .send({ messageId: first.body.data.id })
      .expect(403);
    const pinned = await api()
      .put(`/api/v1/groups/${id}/pin`)
      .set(bearer(owner.id))
      .send({ messageId: first.body.data.id })
      .expect(200);
    expect(pinned.body.data.pinnedMessage.id).toBe(first.body.data.id);

    // Delete for everyone: the author or an admin, not a bystander.
    await api()
      .delete(`/api/v1/groups/${id}/messages/${reply.body.data.id}`)
      .set(bearer(ann.id))
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${id}/messages/${first.body.data.id}`)
      .set(bearer(owner.id))
      .expect(204);
    const detail = await api().get(`/api/v1/groups/${id}`).set(bearer(ann.id));
    expect(detail.body.data.pinnedMessage).toBeNull();
    const msgs = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id));
    const gone = msgs.body.data.find(
      (m: { id: string }) => m.id === first.body.data.id,
    );
    expect(gone.deleted).toBe(true);
    expect(gone.body).toBe('');
  });

  it('roles: admins add / remove, only the owner promotes; removal is announced', async () => {
    const { owner, ann, bob, cy, id } = await makeGroup();
    const removed: unknown[] = [];
    const sub = groupsSvc.membershipEnded$.subscribe((e) => removed.push(e));

    // A plain member cannot add or kick (default rules).
    await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(ann.id))
      .send({ userIds: [cy.id] })
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${id}/members/${bob.id}`)
      .set(bearer(ann.id))
      .expect(403);
    await api()
      .put(`/api/v1/groups/${id}/members/${ann.id}/role`)
      .set(bearer(ann.id))
      .send({ role: 'admin' })
      .expect(403);

    await api()
      .put(`/api/v1/groups/${id}/members/${ann.id}/role`)
      .set(bearer(owner.id))
      .send({ role: 'admin' })
      .expect(200);
    const added = await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(ann.id))
      .send({ userIds: [cy.id] })
      .expect(200);
    expect(added.body.data.memberCount).toBe(4);
    // An admin cannot remove the owner or another admin.
    await api()
      .delete(`/api/v1/groups/${id}/members/${owner.id}`)
      .set(bearer(ann.id))
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${id}/members/${bob.id}`)
      .set(bearer(ann.id))
      .expect(200);
    expect(removed).toContainEqual({
      groupId: id,
      userId: bob.id,
      reason: 'removed',
    });
    await api().get(`/api/v1/groups/${id}`).set(bearer(bob.id)).expect(404);
    expect(await groupsSvc.activeMemberIds(id)).not.toContain(bob.id);
    expect(await groupsSvc.canStartCall(ann.id, id)).toBe(true);
    expect(await groupsSvc.canStartCall(cy.id, id)).toBe(false);
    sub.unsubscribe();
  });

  it('rules: only admins write; the call right follows the setting; the link', async () => {
    const { owner, ann, cy, id } = await makeGroup();
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .send({ whoCanPost: 'admins' })
      .expect(403);
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .send({ title: 'Mine now' })
      .expect(403);
    const changed = await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .send({ whoCanPost: 'admins', whoCanCall: 'all', title: 'Renamed' })
      .expect(200);
    expect(changed.body.data.title).toBe('Renamed');
    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({ clientMessageId: cmid(), type: 'text', body: 'no' })
      .expect(403);
    expect(await groupsSvc.canStartCall(ann.id, id)).toBe(true);

    const link = changed.body.data.inviteLink as string;
    const code = link.split('/g/')[1];
    const preview = await api()
      .get(`/api/v1/groups/join/${code}`)
      .set(bearer(cy.id))
      .expect(200);
    expect(preview.body.data.alreadyMember).toBe(false);
    const joined = await api()
      .post(`/api/v1/groups/join/${code}`)
      .set(bearer(cy.id))
      .expect(200);
    expect(joined.body.data.status).toBe('joined');
    expect(joined.body.data.group.memberCount).toBe(4);
    // A reset link kills the old one.
    await api()
      .post(`/api/v1/groups/${id}/invite/reset`)
      .set(bearer(owner.id))
      .expect(200);
    await api()
      .get(`/api/v1/groups/join/${code}`)
      .set(bearer(cy.id))
      .expect(404);

    // The person who left may come back; the owner leaving hands over.
    await api()
      .post(`/api/v1/groups/${id}/leave`)
      .set(bearer(owner.id))
      .expect(204);
    const d = await api().get(`/api/v1/groups/${id}`).set(bearer(ann.id));
    expect(
      d.body.data.members.filter((m: { role: string }) => m.role === 'owner'),
    ).toHaveLength(1);
  });

  it('polls: one answer, several answers, revote, open voters, close', async () => {
    const { owner, ann, bob, cy, id } = await makeGroup();
    await api()
      .post(`/api/v1/groups/${id}/polls`)
      .set(bearer(ann.id))
      .send({
        clientMessageId: cmid(),
        question: 'Lunch?',
        options: ['Pizza'],
        multiple: false,
        anonymous: true,
      })
      .expect(400);
    const made = await api()
      .post(`/api/v1/groups/${id}/polls`)
      .set(bearer(ann.id))
      .send({
        clientMessageId: cmid(),
        question: 'Lunch?',
        options: ['Pizza', 'Sushi', 'Soup'],
        multiple: false,
        anonymous: false,
      })
      .expect(201);
    expect(made.body.data.type).toBe('poll');
    const poll = made.body.data.poll;
    const [pizza, sushi] = poll.options;

    await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(bob.id))
      .send({ optionIds: [pizza.id, sushi.id] })
      .expect(400);
    await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(bob.id))
      .send({ optionIds: [pizza.id] })
      .expect(200);
    const v2 = await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(owner.id))
      .send({ optionIds: [pizza.id] })
      .expect(200);
    expect(v2.body.data.totalVoters).toBe(2);
    expect(v2.body.data.options[0].percent).toBe(100);
    expect(v2.body.data.myOptionIds).toEqual([pizza.id]);
    // Revote moves the vote.
    const v3 = await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(owner.id))
      .send({ optionIds: [sushi.id] })
      .expect(200);
    expect(v3.body.data.options.map((o: { votes: number }) => o.votes)).toEqual(
      [1, 1, 0],
    );
    expect(v3.body.data.options[0].percent).toBe(50);

    // Open poll: who voted.
    const voters = await api()
      .get(`/api/v1/groups/${id}/polls/${poll.id}/voters`)
      .set(bearer(ann.id))
      .expect(200);
    expect(voters.body.data[0].voters[0].userId).toBe(bob.id);
    expect(voters.body.data[1].voters[0].userId).toBe(owner.id);

    // The message list shows my picks.
    const list = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .set(bearer(bob.id));
    expect(list.body.data[0].poll.myOptionIds).toEqual([pizza.id]);

    // Retract; a stranger cannot close; the author can.
    const v4 = await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(bob.id))
      .send({ optionIds: [] })
      .expect(200);
    expect(v4.body.data.totalVoters).toBe(1);
    await api()
      .post(`/api/v1/groups/${id}/polls/${poll.id}/close`)
      .set(bearer(bob.id))
      .expect(403);
    const closed = await api()
      .post(`/api/v1/groups/${id}/polls/${poll.id}/close`)
      .set(bearer(ann.id))
      .expect(200);
    expect(closed.body.data.closed).toBe(true);
    await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(bob.id))
      .send({ optionIds: [pizza.id] })
      .expect(409);
    await api()
      .get(`/api/v1/groups/${id}/polls/${poll.id}/voters`)
      .set(bearer(cy.id))
      .expect(404);
  });

  it('adding people respects their «who can add me» setting and reports who was skipped', async () => {
    const { owner, ann, cy, id } = await makeGroup();
    await api()
      .put('/api/v1/users/me/privacy')
      .set(bearer(cy.id))
      .send({ groupAddFrom: 'nobody' })
      .expect(200);
    const added = await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [cy.id] })
      .expect(200);
    expect(added.body.data.notAdded).toEqual([cy.id]);
    expect(added.body.data.memberCount).toBe(3);
    // By link they can still come in on their own.
    const open = await api()
      .get(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .expect(200);
    expect(
      open.body.data.members.map((m: { userId: string }) => m.userId),
    ).not.toContain(cy.id);
    await api()
      .put('/api/v1/users/me/privacy')
      .set(bearer(cy.id))
      .send({ groupAddFrom: 'everyone' })
      .expect(200);
    const again = await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(owner.id))
      .send({ userIds: [cy.id] })
      .expect(200);
    expect(again.body.data.notAdded).toEqual([]);
    expect(again.body.data.memberCount).toBe(4);
  });

  it('service lines can be switched off by an admin: hidden for everyone, on by default', async () => {
    const { owner, ann, id, res } = await makeGroup();
    expect(res.body.data.showServiceMessages).toBe(true);
    const lines = async (uid: string): Promise<number> => {
      const r = await api()
        .get(`/api/v1/groups/${id}/messages`)
        .set(bearer(uid))
        .expect(200);
      const items = r.body.data as { systemKind: string | null }[];
      return items.filter((m) => m.systemKind).length;
    };
    expect(await lines(ann.id)).toBeGreaterThan(0);
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .send({ showServiceMessages: false })
      .expect(403);
    const off = await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .send({ showServiceMessages: false })
      .expect(200);
    expect(off.body.data.showServiceMessages).toBe(false);
    expect(await lines(ann.id)).toBe(0);
    expect(await lines(owner.id)).toBe(0);
  });

  it('admin checkboxes and member permissions: every right is checked (403), the owner is safe, ownership can be handed over', async () => {
    const { owner, ann, bob, cy, id } = await makeGroup();
    const role = (who: string, uid: string, body: object) =>
      api()
        .put(`/api/v1/groups/${id}/members/${uid}/role`)
        .set(bearer(who))
        .send(body);
    // Ann: admin who may only pin; Bob stays a member.
    const r = await role(owner.id, ann.id, {
      role: 'admin',
      rights: ['pin'],
    }).expect(200);
    const annRow = r.body.data.members.find(
      (m: { userId: string }) => m.userId === ann.id,
    );
    expect(annRow.rights).toEqual(['pin']);
    const mine = await api()
      .get(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .expect(200);
    expect(mine.body.data.myRights).toEqual(['pin']);
    // No «invite», «ban», «info», «admins» right.
    await api()
      .post(`/api/v1/groups/${id}/members`)
      .set(bearer(ann.id))
      .send({ userIds: [cy.id] })
      .expect(403);
    await api()
      .delete(`/api/v1/groups/${id}/members/${bob.id}`)
      .set(bearer(ann.id))
      .expect(403);
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .send({ whoCanPoll: 'admins' })
      .expect(403);
    await role(ann.id, bob.id, { role: 'admin' }).expect(403);
    // The pin right works for her; a plain member cannot pin.
    const msg = await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(bob.id))
      .send({ type: 'text', body: 'hi', clientMessageId: cmid() })
      .expect(201);
    await api()
      .put(`/api/v1/groups/${id}/pin`)
      .set(bearer(bob.id))
      .send({ messageId: msg.body.data.id })
      .expect(403);
    await api()
      .put(`/api/v1/groups/${id}/pin`)
      .set(bearer(ann.id))
      .send({ messageId: msg.body.data.id })
      .expect(200);
    // Ann cannot delete Bob's message (no «delete»); the owner can.
    await api()
      .delete(`/api/v1/groups/${id}/messages/${msg.body.data.id}`)
      .set(bearer(ann.id))
      .expect(403);
    // Member permissions: polls only for admins.
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .send({ whoCanPoll: 'admins', whoCanPin: 'all' })
      .expect(200);
    await api()
      .post(`/api/v1/groups/${id}/polls`)
      .set(bearer(bob.id))
      .send({
        clientMessageId: cmid(),
        question: 'Q?',
        options: ['a', 'b'],
        multiple: false,
        anonymous: false,
      })
      .expect(403);
    await api()
      .put(`/api/v1/groups/${id}/pin`)
      .set(bearer(bob.id))
      .send({ messageId: null })
      .expect(200);
    // The owner cannot be demoted; only the owner hands the group over.
    await role(owner.id, owner.id, { role: 'member' }).expect(404);
    await api()
      .put(`/api/v1/groups/${id}/owner`)
      .set(bearer(ann.id))
      .send({ userId: ann.id })
      .expect(403);
    const t = await api()
      .put(`/api/v1/groups/${id}/owner`)
      .set(bearer(owner.id))
      .send({ userId: bob.id })
      .expect(200);
    const roles = Object.fromEntries(
      t.body.data.members.map((m: { userId: string; role: string }) => [
        m.userId,
        m.role,
      ]),
    );
    expect(roles[bob.id]).toBe('owner');
    expect(roles[owner.id]).toBe('admin');
  });

  it('anonymous multi-answer polls hide the voters', async () => {
    const { ann, bob, id } = await makeGroup();
    const made = await api()
      .post(`/api/v1/groups/${id}/polls`)
      .set(bearer(ann.id))
      .send({
        clientMessageId: cmid(),
        question: 'Days?',
        options: ['Mon', 'Tue', 'Wed'],
        multiple: true,
        anonymous: true,
      })
      .expect(201);
    const poll = made.body.data.poll;
    const res = await api()
      .put(`/api/v1/groups/${id}/polls/${poll.id}/vote`)
      .set(bearer(bob.id))
      .send({ optionIds: [poll.options[0].id, poll.options[2].id] })
      .expect(200);
    expect(res.body.data.myOptionIds).toHaveLength(2);
    expect(res.body.data.options[0].recentVoters).toEqual([]);
    await api()
      .get(`/api/v1/groups/${id}/polls/${poll.id}/voters`)
      .set(bearer(ann.id))
      .expect(403);
  });

  it('group types: public @username + search, closed with approval, private has no link', async () => {
    const { owner, ann, bob, cy } = await makeGroup();
    const handle = `pub_${randomUUID().slice(0, 8)}`;
    // A public group needs a @username; it is findable and anyone joins.
    await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Open', type: 'public', memberIds: [] })
      .expect(400);
    const pub = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({
        title: 'Open house',
        type: 'public',
        username: handle,
        memberIds: [],
      })
      .expect(201);
    expect(pub.body.data.username).toBe(handle);
    expect(pub.body.data.inviteLink).toContain(`/g/${handle}`);
    await api()
      .post('/api/v1/groups')
      .set(bearer(ann.id))
      .send({
        title: 'Clone',
        type: 'public',
        username: handle.toUpperCase(),
        memberIds: [],
      })
      .expect(409);
    const found = await api()
      .get('/api/v1/groups/search')
      .query({ q: handle.slice(0, 6) })
      .set(bearer(cy.id))
      .expect(200);
    expect(found.body.data.map((g: { id: string }) => g.id)).toContain(
      pub.body.data.id,
    );
    const j = await api()
      .post(`/api/v1/groups/join/${handle}`)
      .set(bearer(cy.id))
      .expect(200);
    expect(j.body.data.status).toBe('joined');

    // Closed + approval: a request an admin decides.
    const closed = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({
        title: 'Vetted',
        type: 'closed',
        joinApproval: true,
        memberIds: [],
      })
      .expect(201);
    const code = (closed.body.data.inviteLink as string).split('/g/')[1];
    const asked = await api()
      .post(`/api/v1/groups/join/${code}`)
      .set(bearer(bob.id))
      .expect(200);
    expect(asked.body.data.status).toBe('pending');
    await api()
      .get(`/api/v1/groups/${closed.body.data.id}`)
      .set(bearer(bob.id))
      .expect(404);
    const reqs = await api()
      .get(`/api/v1/groups/${closed.body.data.id}/requests`)
      .set(bearer(owner.id))
      .expect(200);
    expect(reqs.body.data[0].user.userId).toBe(bob.id);
    await api()
      .get(`/api/v1/groups/${closed.body.data.id}/requests`)
      .set(bearer(bob.id))
      .expect(404);
    await api()
      .post(`/api/v1/groups/${closed.body.data.id}/requests/${bob.id}/approve`)
      .set(bearer(owner.id))
      .expect(200);
    await api()
      .get(`/api/v1/groups/${closed.body.data.id}`)
      .set(bearer(bob.id))
      .expect(200);

    // Private: no link at all; switching types moves the rules.
    const priv = await api()
      .post('/api/v1/groups')
      .set(bearer(owner.id))
      .send({ title: 'Secret', memberIds: [ann.id] })
      .expect(201);
    expect(priv.body.data.type).toBe('private');
    expect(priv.body.data.inviteLink).toBeNull();
    await api()
      .patch(`/api/v1/groups/${priv.body.data.id}`)
      .set(bearer(ann.id))
      .send({ type: 'public', username: `x_${handle}` })
      .expect(403);
    const toClosed = await api()
      .patch(`/api/v1/groups/${priv.body.data.id}`)
      .set(bearer(owner.id))
      .send({ type: 'closed' })
      .expect(200);
    expect(toClosed.body.data.inviteLink).toContain('/g/');
  });

  it('topics: forum mode, General, topic messages, unread per topic, closed topic', async () => {
    const { owner, ann, bob, id } = await makeGroup();
    await api()
      .post(`/api/v1/groups/${id}/topics`)
      .set(bearer(owner.id))
      .send({ title: 'Nope' })
      .expect(400);
    // Old chat from before topics stays in General.
    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({ clientMessageId: cmid(), type: 'text', body: 'before topics' })
      .expect(201);
    await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(ann.id))
      .send({ topicsEnabled: true })
      .expect(403);
    const on = await api()
      .patch(`/api/v1/groups/${id}`)
      .set(bearer(owner.id))
      .send({ topicsEnabled: true })
      .expect(200);
    expect(on.body.data.topicsEnabled).toBe(true);
    const general = on.body.data.generalTopicId as string;
    const made = await api()
      .post(`/api/v1/groups/${id}/topics`)
      .set(bearer(owner.id))
      .send({ title: 'Billing', iconEmoji: '💳', color: 3 })
      .expect(201);
    const topicId = made.body.data.id as string;
    await api()
      .post(`/api/v1/groups/${id}/topics`)
      .set(bearer(ann.id))
      .send({ title: 'Mine' })
      .expect(403);

    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({
        clientMessageId: cmid(),
        type: 'text',
        body: 'invoice question',
        topicId,
      })
      .expect(201);
    const inTopic = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .query({ topicId })
      .set(bearer(bob.id))
      .expect(200);
    expect(inTopic.body.data.map((m: { body: string }) => m.body)).toEqual([
      'invoice question',
    ]);
    const inGeneral = await api()
      .get(`/api/v1/groups/${id}/messages`)
      .query({ topicId: general })
      .set(bearer(bob.id))
      .expect(200);
    expect(inGeneral.body.data.map((m: { body: string }) => m.body)).toContain(
      'before topics',
    );
    expect(
      inGeneral.body.data.map((m: { body: string }) => m.body),
    ).not.toContain('invoice question');

    // Unread per topic; reading one topic leaves the other.
    const topics = await api()
      .get(`/api/v1/groups/${id}/topics`)
      .set(bearer(bob.id))
      .expect(200);
    const byId = new Map<string, { unreadCount: number }>(
      topics.body.data.map((t: { id: string; unreadCount: number }) => [
        t.id,
        t,
      ]),
    );
    expect(topics.body.data[0].isGeneral).toBe(true);
    expect(byId.get(topicId)!.unreadCount).toBe(1);
    await api()
      .post(`/api/v1/groups/${id}/read`)
      .set(bearer(bob.id))
      .send({ lastReadMessageId: inTopic.body.data[0].id })
      .expect(200);
    const after = await api()
      .get(`/api/v1/groups/${id}/topics`)
      .set(bearer(bob.id));
    const afterBy = new Map<string, { unreadCount: number }>(
      after.body.data.map((t: { id: string; unreadCount: number }) => [
        t.id,
        t,
      ]),
    );
    expect(afterBy.get(topicId)!.unreadCount).toBe(0);
    expect(afterBy.get(general)!.unreadCount).toBe(1);
    const list = await api().get('/api/v1/groups').set(bearer(bob.id));
    expect(
      list.body.data.find((g: { id: string }) => g.id === id).unreadCount,
    ).toBe(1);

    // A closed topic takes messages from admins only.
    await api()
      .patch(`/api/v1/groups/${id}/topics/${topicId}`)
      .set(bearer(owner.id))
      .send({ closed: true, pinned: true })
      .expect(200);
    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(ann.id))
      .send({ clientMessageId: cmid(), type: 'text', body: 'late', topicId })
      .expect(403);
    await api()
      .post(`/api/v1/groups/${id}/messages`)
      .set(bearer(owner.id))
      .send({ clientMessageId: cmid(), type: 'text', body: 'final', topicId })
      .expect(201);
    // General cannot be renamed or closed.
    await api()
      .patch(`/api/v1/groups/${id}/topics/${general}`)
      .set(bearer(owner.id))
      .send({ closed: true, title: 'x' })
      .expect(200);
    const again = await api()
      .get(`/api/v1/groups/${id}/topics`)
      .set(bearer(ann.id));
    expect(again.body.data[0].closed).toBe(false);
    expect(again.body.data[0].title).toBe('General');
  });
});
