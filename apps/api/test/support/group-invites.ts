import type TestAgent from 'supertest/lib/agent';

/**
 * Owner 2026-10-21: creating a group only invites the people. Tests that
 * need a ready group let every invited person press «Accept».
 */
export async function acceptInvites(
  api: () => TestAgent,
  auth: (id: string) => Record<string, string>,
  groupId: string,
  userIds: string[],
): Promise<void> {
  for (const userId of userIds) {
    const list = await api()
      .get('/api/v1/groups/invites')
      .set(auth(userId))
      .expect(200);
    const invite = (list.body.data as { id: string; groupId: string }[]).find(
      (i) => i.groupId === groupId,
    );
    if (!invite) throw new Error(`no invitation for ${userId}`);
    await api()
      .post(`/api/v1/groups/invites/${invite.id}/accept`)
      .set(auth(userId))
      .expect(200);
  }
}
