// Item 25: a ts-mls peer (the web app's MLS library, the same bundle the
// browser loads) for the OpenMLS <-> ts-mls interop test. One JSON command
// per stdin line, one JSON answer per stdout line. Run by
// mls_interop_test.dart; needs only node.
import { createInterface } from 'node:readline';
import * as t from '../../../../../web/vendor/ts-mls-1.6.4/ts-mls.min.js';

const SUITE = 'MLS_128_DHKEMX25519_AES128GCM_SHA256_Ed25519';
const cs = await t.getCiphersuiteImpl(t.getCiphersuiteFromName(SUITE));
const b64 = (u8) => Buffer.from(u8).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));
let kp;
let state;

const handlers = {
  async keyPackage({ identity }) {
    const sign = await cs.signature.keygen();
    kp = await t.generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode(identity) },
      t.defaultCapabilities(),
      t.defaultLifetime,
      [],
      sign,
      cs,
    );
    return {
      keyPackage: b64(
        t.encodeMlsMessage({ keyPackage: kp.publicPackage, wireformat: 'mls_key_package', version: 'mls10' }),
      ),
    };
  },
  // The browser starts a group and adds a phone from its KeyPackage (the
  // phone's last-resort one included: ts-mls must accept its extension).
  async groupWith({ keyPackage, identity }) {
    const sign = await cs.signature.keygen();
    kp = await t.generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode(identity) },
      t.defaultCapabilities(),
      t.defaultLifetime,
      [],
      sign,
      cs,
    );
    state = await t.createGroup(new TextEncoder().encode('lawbid:web-first'), kp.publicPackage, kp.privatePackage, [], cs);
    const other = t.decodeMlsMessage(unb64(keyPackage), 0)[0].keyPackage;
    const out = await t.createCommit(
      { state, cipherSuite: cs },
      { extraProposals: [{ proposalType: 'add', add: { keyPackage: other } }], ratchetTreeExtension: true },
    );
    state = out.newState;
    return {
      welcome: b64(t.encodeMlsMessage({ welcome: out.welcome, wireformat: 'mls_welcome', version: 'mls10' })),
    };
  },
  async join({ welcome }) {
    const m = t.decodeMlsMessage(unb64(welcome), 0)[0];
    state = await t.joinGroup(m.welcome, kp.publicPackage, kp.privatePackage, t.emptyPskIndex, cs);
    return { epoch: Number(state.groupContext.epoch) };
  },
  async process({ message }) {
    const m = t.decodeMlsMessage(unb64(message), 0)[0];
    const r = await t.processMessage(m, state, t.emptyPskIndex, t.acceptAll, cs);
    state = r.newState;
    return r.kind === 'applicationMessage'
      ? { text: new TextDecoder().decode(r.message) }
      : { epoch: Number(state.groupContext.epoch) };
  },
  // G2: the browser joins the phone's group by external commit from the
  // GroupInfo the phone's commit carried (an invite link, a new device).
  async externalJoin({ groupInfo, identity }) {
    const sign = await cs.signature.keygen();
    kp = await t.generateKeyPackageWithKey(
      { credentialType: 'basic', identity: new TextEncoder().encode(identity) },
      t.defaultCapabilities(),
      t.defaultLifetime,
      [],
      sign,
      cs,
    );
    const gi = t.decodeMlsMessage(unb64(groupInfo), 0)[0].groupInfo;
    const out = await t.joinGroupExternal(gi, kp.publicPackage, kp.privatePackage, false, cs);
    state = out.newState;
    return {
      commit: b64(t.encodeMlsMessage({ publicMessage: out.publicMessage, wireformat: 'mls_public_message', version: 'mls10' })),
      epoch: Number(state.groupContext.epoch),
    };
  },
  // The browser's GroupInfo of its current epoch (the phone joins from it).
  async groupInfo() {
    const gi = await t.createGroupInfoWithExternalPubAndRatchetTree(state, [], cs);
    return { groupInfo: b64(t.encodeMlsMessage({ groupInfo: gi, wireformat: 'mls_group_info', version: 'mls10' })) };
  },
  async encrypt({ text }) {
    const out = await t.createApplicationMessage(state, new TextEncoder().encode(text), cs);
    state = out.newState;
    return {
      message: b64(
        t.encodeMlsMessage({ privateMessage: out.privateMessage, wireformat: 'mls_private_message', version: 'mls10' }),
      ),
    };
  },
};

const rl = createInterface({ input: process.stdin });
for await (const line of rl) {
  const cmd = JSON.parse(line);
  try {
    process.stdout.write(JSON.stringify(await handlers[cmd.op](cmd)) + '\n');
  } catch (e) {
    process.stdout.write(JSON.stringify({ error: String(e) }) + '\n');
  }
}
