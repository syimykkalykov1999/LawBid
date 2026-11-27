import 'dart:typed_data';

import 'package:lawbid/features/chat/e2ee/e2ee_service.dart'
    show E2eePlaintextStore;
import 'package:lawbid/features/chat/e2ee/mls_engine_stub.dart'
    if (dart.library.ffi) 'package:lawbid/features/chat/e2ee/mls_engine_io.dart'
    if (dart.library.js_interop) 'package:lawbid/features/chat/e2ee/mls_engine_web.dart'
    as impl;

/// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): one MLS client
/// (RFC 9420) per device. The phones and the Mac use OpenMLS (Rust, MIT)
/// through the `openmls` Dart package; the web app (built with `--wasm`,
/// where `openmls` cannot run) uses ts-mls (MIT) through `dart:js_interop`.
/// Both speak the same cipher suite and wire format, so a phone and a
/// browser are members of the same group.
///
/// Every MLS object crosses this API as the bytes of an encoded MLSMessage
/// (RFC 9420 §6) — KeyPackages included — exactly what the LawBid Delivery
/// Service stores and hands out.
abstract class MlsEngine {
  /// The device's MLS client for [userId]; its private keys never leave the
  /// device (Keychain / Keystore on the phones, IndexedDB with a
  /// non-extractable key in the browser).
  static Future<MlsEngine> open(String userId) => impl.openMlsEngine(userId);

  /// Where this platform keeps the decrypted messages when it seals them
  /// itself (the web: in mls.js's sealed IndexedDB); null = the cache
  /// database.
  static E2eePlaintextStore? sealedPlaintexts(String userId) =>
      impl.sealedPlaintextStore(userId);

  /// Ed25519 public key of this device (registered at POST /e2ee/devices).
  Uint8List get signaturePublicKey;

  /// The server's id of this device, once registered (null before).
  String? get deviceId;

  /// Remembers the server's id; the credential identity becomes
  /// "<userId>:<deviceId>".
  Future<void> setDeviceId(String deviceId);

  /// The server's id of the device these keys used to be, when the app's
  /// MLS data was lost but the keys survived (iOS: the Keychain outlives a
  /// reinstall, the database does not). That device's groups think it is
  /// still in them, so it is signed out and this one registers afresh
  /// (WhatsApp: a reinstalled phone is a new device). Null normally.
  String? get previousDeviceId;

  /// The previous device was signed out on the server.
  Future<void> forgetPreviousDevice();

  /// [count] one-time KeyPackages of this device.
  Future<List<Uint8List>> newKeyPackages(int count);

  /// The device's last-resort KeyPackage (RFC 9420 §16.8, the `last_resort`
  /// extension): handed out when the one-time ones run out, so it may be
  /// used by several Welcomes; its private half is kept after a join.
  Future<Uint8List> newLastResortKeyPackage();

  /// Signs this device out of end-to-end encryption here: its keys, groups
  /// and KeyPackages are deleted (the next sign-in is a new device).
  Future<void> wipe();

  /// Lets go of the state (the account's session ended); nothing deleted.
  Future<void> close();

  /// Creates [groupId] with only this device in it (epoch 0).
  Future<void> createGroup(Uint8List groupId);

  Future<bool> hasGroup(Uint8List groupId);

  Future<int> epoch(Uint8List groupId);

  /// A commit that adds the devices of [keyPackages] and removes the
  /// devices [removeDeviceIds]. Nothing changes until [mergeCommit]
  /// (after the server accepted it) or [discardCommit] (the server refused
  /// it, or took another commit for this epoch). The pending commit
  /// survives a restart: a send whose answer was lost is decided on the
  /// next catch-up (RFC 9420 §12.4).
  ///
  /// With [groupInfo] the commit also carries the GroupInfo of the epoch it
  /// makes (ratchet tree + external_pub inside, RFC 9420 §12.4.3): the
  /// Delivery Service of a group keeps the newest one, so a device joins by
  /// external commit without anyone online (Wire). Published only once the
  /// server took the commit.
  Future<MlsCommitOut> commit(
    Uint8List groupId, {
    List<Uint8List> keyPackages = const [],
    List<String> removeDeviceIds = const [],
    bool groupInfo = false,
  });

  Future<void> mergeCommit(Uint8List groupId);

  Future<void> discardCommit(Uint8List groupId);

  /// Joins a group from a Welcome; returns its group id.
  Future<Uint8List> join(Uint8List welcome);

  /// The GroupInfo of the group's current epoch (MLSMessage, with the
  /// ratchet tree and external_pub extensions): what a device that is not
  /// in the group joins from by external commit.
  Future<Uint8List> exportGroupInfo(Uint8List groupId);

  /// Joins the group [groupInfo] describes by an external commit
  /// (RFC 9420 §12.4.3.2) — a person who came in by link, request or
  /// invite, a new device of a member, a device that lost track of the
  /// group. With [resync] this device's old leaf (the same signature key)
  /// is removed in the same commit and the stored group replaced.
  ///
  /// Like [commit] the join waits for the Delivery Service: [mergeCommit]
  /// once it took the commit (a no-op where the library stored it merged);
  /// when it refused, [deleteGroup] (the device is not in that epoch).
  ///
  /// Known limit (27.11): ts-mls 1.6.4 writes and reads the GroupInfo's
  /// external_pub as the bare key, OpenMLS as RFC 9420 §12.4.3.2 says
  /// (`HPKEPublicKey<V>`, length first), so a browser cannot join from a
  /// phone's GroupInfo or the other way round; such a device is added by a
  /// Welcome instead (GroupE2eeService).
  Future<MlsExternalJoinOut> joinExternal(
    Uint8List groupInfo, {
    bool resync = false,
  });

  /// RFC 9420 §8.5 MLS-Exporter of the current epoch (G4 push keys, call
  /// keys as SFrame RFC 9605 / Discord DAVE).
  Future<Uint8List> exportSecret(
    Uint8List groupId,
    String label,
    Uint8List context,
    int length,
  );

  /// Applies a commit of another member.
  Future<void> applyCommit(Uint8List groupId, Uint8List commit);

  Future<Uint8List> encrypt(Uint8List groupId, Uint8List plaintext);

  /// The plaintext of an application message, or null for anything else.
  /// An application message can be decrypted only once (forward secrecy).
  Future<Uint8List?> decrypt(Uint8List groupId, Uint8List message);

  /// Members of the group now: credential identity and signature key.
  Future<List<MlsMemberKey>> members(Uint8List groupId);

  /// Forgets a group (the chat was left / the device was removed).
  Future<void> deleteGroup(Uint8List groupId);
}

class MlsCommitOut {
  const MlsCommitOut({
    required this.commit,
    required this.epoch,
    this.welcome,
    this.groupInfo,
  });

  final Uint8List commit;

  /// The epoch the commit was made in (the group moves to epoch + 1).
  final int epoch;
  final Uint8List? welcome;

  /// The GroupInfo of epoch + 1 (asked for with `groupInfo: true`).
  final Uint8List? groupInfo;
}

/// An external join waiting for the Delivery Service
/// ([MlsEngine.joinExternal]).
class MlsExternalJoinOut {
  const MlsExternalJoinOut({
    required this.groupId,
    required this.commit,
    required this.epoch,
    this.groupInfo,
  });

  final Uint8List groupId;
  final Uint8List commit;

  /// The epoch of the GroupInfo the join was made from (the commit's).
  final int epoch;

  /// The GroupInfo of the epoch the join makes.
  final Uint8List? groupInfo;
}

class MlsMemberKey {
  const MlsMemberKey({required this.identity, required this.signatureKey});

  /// "<userId>:<deviceId>".
  final String identity;
  final Uint8List signatureKey;

  String get userId => identity.split(':').first;
  String get deviceId => identity.split(':').last;
}

/// RFC 9420 §6: an encoded MLSMessage starts with the protocol version
/// (mls10 = 1) and the wire format (mls_key_package = 5). OpenMLS hands a
/// KeyPackage out bare; the Delivery Service and ts-mls use the MLSMessage.
const _kpHeader = [0x00, 0x01, 0x00, 0x05];

Uint8List wrapKeyPackage(Uint8List bare) =>
    Uint8List.fromList([..._kpHeader, ...bare]);

Uint8List unwrapKeyPackage(Uint8List message) {
  for (var i = 0; i < _kpHeader.length; i++) {
    if (message.length <= i || message[i] != _kpHeader[i]) {
      throw const FormatException('not an MLS KeyPackage message');
    }
  }
  return Uint8List.sublistView(message, _kpHeader.length);
}
