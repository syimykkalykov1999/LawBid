import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';
import 'package:openmls/openmls.dart' as om;
import 'package:path_provider/path_provider.dart';

/// Item 25: the phones' and the Mac's MLS client — OpenMLS 0.9 (Rust, MIT)
/// through the `openmls` Dart package (MIT), used as its README shows. The
/// group state lives in the package's SQLCipher database under the app's
/// support folder; its key and the device's signature key pair are in the
/// Keychain / Keystore ([MlsKeyVault]).
Future<MlsEngine> openMlsEngine(String userId) async {
  final dir = await getApplicationSupportDirectory();
  return OpenMlsEngine.open(
    userId: userId,
    vault: const SecureMlsKeyVault(),
    dbPath: '${dir.path}${Platform.pathSeparator}mls_$userId.db',
  );
}

const _suite = om.MlsCiphersuite.mls128DhkemX25519Aes128GcmSha256Ed25519;

class OpenMlsEngine implements MlsEngine {
  OpenMlsEngine._(
    this._engine,
    this._vault,
    this._userId,
    this._signer,
    this.signaturePublicKey,
    this._deviceId,
  );

  /// [dbPath] ":memory:" keeps everything in memory (tests).
  static Future<OpenMlsEngine> open({
    required String userId,
    required MlsKeyVault vault,
    required String dbPath,
  }) async {
    await om.Openmls.init();
    final prefix = 'mls.$userId';
    var dbKey = await vault.read('$prefix.db_key');
    if (dbKey == null) {
      final rng = Random.secure();
      dbKey = base64Encode(List<int>.generate(32, (_) => rng.nextInt(256)));
      await vault.write('$prefix.db_key', dbKey);
    }
    var signer = await vault.read('$prefix.signer');
    var public = await vault.read('$prefix.public');
    if (signer == null || public == null) {
      final pair = om.MlsSignatureKeyPair.generate(ciphersuite: _suite);
      final pub = pair.publicKey();
      signer = base64Encode(
        om.serializeSigner(
          ciphersuite: _suite,
          privateKey: pair.privateKey(),
          publicKey: pub,
        ),
      );
      public = base64Encode(pub);
      await vault.write('$prefix.signer', signer);
      await vault.write('$prefix.public', public);
      // A new key is a new device: the server id of the old one is stale.
      await vault.delete('$prefix.device');
    }
    final engine = await om.MlsEngine.create(
      dbPath: dbPath,
      encryptionKey: base64Decode(dbKey),
    );
    return OpenMlsEngine._(
      engine,
      vault,
      userId,
      base64Decode(signer),
      base64Decode(public),
      await vault.read('$prefix.device'),
    );
  }

  final om.MlsEngine _engine;
  final MlsKeyVault _vault;
  final String _userId;
  final Uint8List _signer;
  String? _deviceId;

  @override
  final Uint8List signaturePublicKey;

  @override
  String? get deviceId => _deviceId;

  Uint8List get _identity =>
      Uint8List.fromList(utf8.encode('$_userId:${_deviceId ?? ''}'));

  static const _config = om.MlsGroupConfig(
    ciphersuite: _suite,
    // Commits as PublicMessage: the Delivery Service checks their adds
    // (application messages are always encrypted).
    wireFormatPolicy: om.MlsWireFormatPolicy.plaintext,
    // The Welcome carries the tree, so joining needs nothing else.
    useRatchetTreeExtension: true,
    // Forward secrecy: no message keys of past epochs are kept.
    maxPastEpochs: 0,
    paddingSize: 32,
    senderRatchetMaxOutOfOrder: 100,
    senderRatchetMaxForwardDistance: 1000,
    numberOfResumptionPsks: 0,
  );

  @override
  Future<void> setDeviceId(String deviceId) async {
    _deviceId = deviceId;
    await _vault.write('mls.$_userId.device', deviceId);
  }

  @override
  Future<List<Uint8List>> newKeyPackages(int count) async {
    final out = <Uint8List>[];
    for (var i = 0; i < count; i++) {
      final kp = await _engine.createKeyPackage(
        ciphersuite: _suite,
        signerBytes: _signer,
        credentialIdentity: _identity,
        signerPublicKey: signaturePublicKey,
      );
      out.add(wrapKeyPackage(kp.keyPackageBytes));
    }
    return out;
  }

  @override
  Future<void> createGroup(Uint8List groupId) async {
    await _engine.createGroup(
      config: _config,
      signerBytes: _signer,
      credentialIdentity: _identity,
      signerPublicKey: signaturePublicKey,
      groupId: groupId,
    );
  }

  @override
  Future<bool> hasGroup(Uint8List groupId) async {
    final ids = await _engine.groupIds();
    return ids.any((g) => _same(g, groupId));
  }

  @override
  Future<int> epoch(Uint8List groupId) async =>
      (await _engine.groupEpoch(groupIdBytes: groupId)).toInt();

  @override
  Future<MlsCommitOut> commit(
    Uint8List groupId, {
    List<Uint8List> keyPackages = const [],
    List<String> removeDeviceIds = const [],
  }) async {
    final members = removeDeviceIds.isEmpty
        ? const <om.MlsMemberInfo>[]
        : await _engine.groupMembers(groupIdBytes: groupId);
    final indices = <int>[
      for (final m in members)
        if (removeDeviceIds.contains(_deviceOf(m.credential))) m.index,
    ];
    // Kept pending: the Delivery Service decides (201 merge, 409 discard).
    final r = await _engine.flexibleCommit(
      groupIdBytes: groupId,
      signerBytes: _signer,
      options: om.FlexibleCommitOptions(
        addKeyPackages: [for (final k in keyPackages) unwrapKeyPackage(k)],
        removeIndices: Uint32List.fromList(indices),
        forceSelfUpdate: true,
        consumePendingProposals: false,
        createGroupInfo: false,
        useRatchetTreeExtension: true,
        keepPending: true,
      ),
    );
    return MlsCommitOut(commit: r.commit, welcome: r.welcome);
  }

  @override
  Future<void> mergeCommit(Uint8List groupId) =>
      _engine.mergePendingCommit(groupIdBytes: groupId);

  @override
  Future<void> discardCommit(Uint8List groupId) =>
      _engine.clearPendingCommit(groupIdBytes: groupId);

  @override
  Future<Uint8List> join(Uint8List welcome) async {
    final r = await _engine.joinGroupFromWelcome(
      config: _config,
      welcomeBytes: welcome,
      signerBytes: _signer,
    );
    return r.groupId;
  }

  @override
  Future<void> applyCommit(Uint8List groupId, Uint8List commit) async {
    final r = await _engine.processMessage(
      groupIdBytes: groupId,
      messageBytes: commit,
    );
    if (r.hasStagedCommit) {
      await _engine.mergePendingCommit(groupIdBytes: groupId);
    }
  }

  @override
  Future<Uint8List> encrypt(Uint8List groupId, Uint8List plaintext) async {
    final r = await _engine.createMessage(
      groupIdBytes: groupId,
      signerBytes: _signer,
      message: plaintext,
    );
    return r.ciphertext;
  }

  @override
  Future<Uint8List?> decrypt(Uint8List groupId, Uint8List message) async {
    final r = await _engine.processMessage(
      groupIdBytes: groupId,
      messageBytes: message,
    );
    if (r.messageType != om.ProcessedMessageType.application) return null;
    return r.applicationMessage;
  }

  @override
  Future<List<MlsMemberKey>> members(Uint8List groupId) async {
    final ms = await _engine.groupMembers(groupIdBytes: groupId);
    return [
      for (final m in ms)
        MlsMemberKey(
          identity: _identityOf(m.credential),
          signatureKey: m.signatureKey,
        ),
    ];
  }

  @override
  Future<void> deleteGroup(Uint8List groupId) =>
      _engine.deleteGroup(groupIdBytes: groupId);

  static String _identityOf(Uint8List credential) => utf8.decode(
        om.MlsCredential.deserialize(bytes: credential).identity(),
        allowMalformed: true,
      );

  static String _deviceOf(Uint8List credential) =>
      _identityOf(credential).split(':').last;

  static bool _same(Uint8List a, Uint8List b) {
    if (a.length != b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (a[i] != b[i]) return false;
    }
    return true;
  }
}
