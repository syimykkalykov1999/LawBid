import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import {
  acceptAll,
  createCommit,
  createGroup,
  createGroupInfoWithExternalPubAndRatchetTree,
  decodeMlsMessage,
  emptyPskIndex,
  encodeMlsMessage,
  joinGroup,
  joinGroupExternal,
  processMessage,
  type ClientState,
  type Proposal,
} from 'ts-mls';
import { ratchetTreeFromExtension } from 'ts-mls/groupInfo.js';
import { MlsDeviceClient, b64, cs, leafOf, unb64 } from './mls-client';

type Res = { status: number; body: { data?: unknown; error?: unknown } };

export type GroupState = {
  state: 'off' | 'pending' | 'on';
  reason: string | null;
  groupId: string | null;
  epoch: number | null;
  devices: {
    deviceId: string;
    userId: string;
    inGroup: boolean;
    lastCommitAt: string | null;
  }[];
  removeDevices: string[];
  leaseHolderDeviceId: string | null;
  groupInfoEpoch: number | null;
  updateDays: number;
};

/**
 * Group E2EE G1 (e2e): a real MLS client (ts-mls, MIT) on a group chat — the
 * same device as MlsDeviceClient, driving /e2ee/groups/* and
 * POST /groups/:id/messages the way the app will (design §4): commits under
 * the lease, every commit with the next GroupInfo, external-commit joins.
 */
export class GroupMlsClient extends MlsDeviceClient {
  static mlsId(groupId: string): Uint8Array {
    return new TextEncoder().encode(`lawbid:g:${groupId}`);
  }

  async gstate(groupId: string): Promise<GroupState> {
    const res = await this.http.get(`/api/v1/e2ee/groups/${groupId}`);
    if (res.status !== 200) {
      throw new Error(`gstate ${res.status} ${JSON.stringify(res.body)}`);
    }
    return res.body.data as GroupState;
  }

  private static async groupInfoOf(state: ClientState): Promise<string> {
    const s = await cs();
    const info = await createGroupInfoWithExternalPubAndRatchetTree(
      state,
      [],
      s,
    );
    return b64(
      encodeMlsMessage({
        groupInfo: info,
        wireformat: 'mls_group_info',
        version: 'mls10',
      }),
    );
  }

  async gcreate(groupId: string): Promise<Res> {
    const s = await cs();
    const own = await this.makeKeyPackage();
    const state = await createGroup(
      GroupMlsClient.mlsId(groupId),
      own.pub,
      own.priv,
      [],
      s,
    );
    const res = await this.http.post(`/api/v1/e2ee/groups/${groupId}/group`, {
      deviceId: this.deviceId,
      groupId: b64(GroupMlsClient.mlsId(groupId)),
      groupInfo: await GroupMlsClient.groupInfoOf(state),
    });
    if (res.status === 201) this.groups.set(groupId, state);
    return res;
  }

  lease(groupId: string): Promise<Res> {
    return this.http.post(`/api/v1/e2ee/groups/${groupId}/lease`, {
      deviceId: this.deviceId,
    });
  }

  /** Adds / removes devices (or only updates my own keys) in one commit
   * sent as a PublicMessage, with the next GroupInfo. [takeLease] false:
   * try without asking for the right first. */
  async gcommit(
    groupId: string,
    add: string[],
    remove: string[] = [],
    takeLease = true,
  ): Promise<Res> {
    const s = await cs();
    const state = this.groups.get(groupId)!;
    if (takeLease) {
      const l = await this.lease(groupId);
      if (l.status !== 200 || !(l.body.data as { granted: boolean }).granted) {
        return { status: 409, body: l.body };
      }
    }
    const proposals: Proposal[] = [];
    if (add.length) {
      const claimed = await this.http.post(
        `/api/v1/e2ee/groups/${groupId}/key-packages/claim`,
        { deviceId: this.deviceId, deviceIds: add },
      );
      if (claimed.status !== 200) return claimed;
      for (const c of claimed.body.data as {
        deviceId: string;
        keyPackage: string | null;
      }[]) {
        if (!c.keyPackage) throw new Error(`no KeyPackage for ${c.deviceId}`);
        const m = decodeMlsMessage(unb64(c.keyPackage), 0)![0];
        if (m.wireformat !== 'mls_key_package') throw new Error('not a kp');
        proposals.push({
          proposalType: 'add',
          add: { keyPackage: m.keyPackage },
        });
      }
    }
    for (const d of remove) {
      proposals.push({
        proposalType: 'remove',
        remove: { removed: leafOf(state, d) },
      });
    }
    const out = await createCommit(
      { state, cipherSuite: s },
      { extraProposals: proposals, wireAsPublicMessage: true },
    );
    const res = await this.http.post(`/api/v1/e2ee/groups/${groupId}/commits`, {
      deviceId: this.deviceId,
      epoch: Number(state.groupContext.epoch),
      commit: b64(encodeMlsMessage(out.commit)),
      addedDevices: add,
      removedDevices: remove,
      groupInfo: await GroupMlsClient.groupInfoOf(out.newState),
      ...(out.welcome
        ? {
            welcome: b64(
              encodeMlsMessage({
                welcome: out.welcome,
                wireformat: 'mls_welcome',
                version: 'mls10',
              }),
            ),
          }
        : {}),
    });
    if (res.status === 201) this.groups.set(groupId, out.newState);
    return res;
  }

  /** Joins from the Welcomes of groups waiting for this device (the tree
   * comes from the stored GroupInfo, design §4.3). */
  async takeGroupWelcomes(): Promise<string[]> {
    const s = await cs();
    const res = await this.http.get(
      `/api/v1/e2ee/groups/welcomes?deviceId=${this.deviceId}`,
    );
    const joined: string[] = [];
    for (const w of res.body.data as {
      id: string;
      groupId: string;
      welcome: string;
    }[]) {
      const m = decodeMlsMessage(unb64(w.welcome), 0)![0];
      if (m.wireformat !== 'mls_welcome') throw new Error('not a welcome');
      const tree = await this.storedTree(w.groupId);
      let state: ClientState | undefined;
      for (const p of this.packages) {
        try {
          state = await joinGroup(
            m.welcome,
            p.pub,
            p.priv,
            emptyPskIndex,
            s,
            tree,
          );
          break;
        } catch {
          // Not the KeyPackage this Welcome was made for.
        }
      }
      if (!state) throw new Error('no KeyPackage fits the Welcome');
      this.groups.set(w.groupId, state);
      await this.http.del(`/api/v1/e2ee/welcomes/${w.id}`);
      joined.push(w.groupId);
    }
    return joined;
  }

  private async storedInfo(groupId: string) {
    const res = await this.http.get(
      `/api/v1/e2ee/groups/${groupId}/group-info`,
    );
    if (res.status !== 200) {
      throw new Error(`group-info ${res.status} ${JSON.stringify(res.body)}`);
    }
    const d = res.body.data as { epoch: number; groupInfo: string };
    const m = decodeMlsMessage(unb64(d.groupInfo), 0)![0];
    if (m.wireformat !== 'mls_group_info') throw new Error('not a GroupInfo');
    return { epoch: d.epoch, info: m.groupInfo };
  }

  private async storedTree(groupId: string) {
    const { info } = await this.storedInfo(groupId);
    return ratchetTreeFromExtension(info);
  }

  /** RFC 9420 §12.4.3.2: my device joins (or resyncs) by itself. */
  async joinExternal(
    groupId: string,
    opts: { resync?: boolean; identity?: string } = {},
  ): Promise<Res> {
    const s = await cs();
    const l = await this.lease(groupId);
    if (l.status !== 200 || !(l.body.data as { granted: boolean }).granted) {
      return { status: 409, body: l.body };
    }
    const { epoch, info } = await this.storedInfo(groupId);
    const own = await this.makeKeyPackage(opts.identity);
    const out = await joinGroupExternal(
      info,
      own.pub,
      own.priv,
      opts.resync === true,
      s,
    );
    const res = await this.http.post(
      `/api/v1/e2ee/groups/${groupId}/external-commit`,
      {
        deviceId: this.deviceId,
        epoch,
        commit: b64(
          encodeMlsMessage({
            publicMessage: out.publicMessage,
            wireformat: 'mls_public_message',
            version: 'mls10',
          }),
        ),
        groupInfo: await GroupMlsClient.groupInfoOf(out.newState),
        ...(opts.resync ? { resync: true } : {}),
      },
    );
    if (res.status === 201) this.groups.set(groupId, out.newState);
    return res;
  }

  async gcatchUp(groupId: string): Promise<void> {
    const s = await cs();
    let state = this.groups.get(groupId)!;
    const res = await this.http.get(
      `/api/v1/e2ee/groups/${groupId}/commits?after=${Number(state.groupContext.epoch)}`,
    );
    for (const c of res.body.data as { epoch: number; commit: string }[]) {
      if (c.epoch !== Number(state.groupContext.epoch)) continue;
      const m = decodeMlsMessage(unb64(c.commit), 0)![0];
      if (
        m.wireformat !== 'mls_public_message' &&
        m.wireformat !== 'mls_private_message'
      ) {
        throw new Error('not a commit');
      }
      const r = await processMessage(m, state, emptyPskIndex, acceptAll, s);
      state = r.newState;
    }
    this.groups.set(groupId, state);
  }

  async gsend(
    groupId: string,
    text: string,
    extra: {
      topicId?: string;
      mentionIds?: string[];
      replyToId?: string;
      control?: boolean;
    } = {},
  ): Promise<Res> {
    const { ciphertext, epoch } = await this.encrypt(groupId, text);
    return this.http.post(`/api/v1/groups/${groupId}/messages`, {
      clientMessageId: randomUUID(),
      type: 'mls',
      ciphertext,
      mlsEpoch: epoch,
      mlsDeviceId: this.deviceId,
      frankingTag: b64(
        createHmac('sha256', randomBytes(32)).update(text).digest(),
      ),
      ...extra,
    });
  }
}
