import 'dart:convert';
import 'dart:io';
import 'dart:math';
import 'dart:typed_data';

import 'package:lawbid/features/chat/e2ee/e2ee_service.dart'
    show E2eePlaintextStore;
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

/// The phones keep the decrypted messages in the cache database, a file the
/// OS protects (E2eePlaintexts); only the web seals them itself.
E2eePlaintextStore? sealedPlaintextStore(String userId) => null;

const _suite = om.MlsCiphersuite.mls128DhkemX25519Aes128GcmSha256Ed25519;

class OpenMlsEngine implements MlsEngine {
  OpenMlsEngine._(
    this._engine,
    this._vault,
    this._userId,
    this._dbPath,
    this._signer,
    this.signaturePublicKey,
    this._deviceId,
    this._previousDeviceId,
  );

  /// [dbPath] ":memory:" keeps everything in memory (tests).
  static Future<OpenMlsEngine> open({
    required String userId,
    required MlsKeyVault vault,
    required String dbPath,
  }) async {
    await om.Openmls.init();
    final prefix = 'mls.$userId';
    // iOS keeps the Keychain across a reinstall, the database goes with the
    // app: a vault that names a device but has no database = that device's
    // groups are gone here, its server id and key must not be used again.
    final freshDb = dbPath == ':memory:' || !File(dbPath).existsSync();
    final known = await vault.read('$prefix.device');
    if (freshDb && known != null) {
      await vault.write('$prefix.previous', known);
      await vault.delete('$prefix.device');
      await vault.delete('$prefix.signer');
      await vault.delete('$prefix.public');
    }
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
      dbPath,
      base64Decode(signer),
      base64Decode(public),
      await vault.read('$prefix.device'),
      await vault.read('$prefix.previous'),
    );
  }

  final om.MlsEngine _engine;
  final MlsKeyVault _vault;
  final String _userId;
  final String _dbPath;
  final Uint8List _signer;
  String? _deviceId;
  String? _previousDeviceId;

  @override
  final Uint8List signaturePublicKey;

  @override
  String? get deviceId => _deviceId;

  @override
  String? get previousDeviceId => _previousDeviceId;

  @override
  Future<void> forgetPreviousDevice() async {
    _previousDeviceId = null;
    await _vault.delete('mls.$_userId.previous');
  }

  @override
  Future<void> wipe() async {
    final prefix = 'mls.$_userId';
    for (final k in ['device', 'signer', 'public', 'previous', 'db_key']) {
      await _vault.delete('$prefix.$k');
    }
    _deviceId = null;
    await close();
    if (_dbPath == ':memory:') return;
    for (final suffix in ['', '-wal', '-shm', '-journal']) {
      final f = File('$_dbPath$suffix');
      if (f.existsSync()) await f.delete();
    }
  }

  @override
  Future<void> close() async {
    if (!_engine.isClosed()) await _engine.close();
  }

  Uint8List get _identity =>
      Uint8List.fromList(utf8.encode('$_userId:${_deviceId ?? ''}'));

  static const _config = om.MlsGroupConfig(
    ciphersuite: _suite,
    // Commits as PublicMessage: the Delivery Service checks their adds
    // (application messages are always encrypted).
    wireFormatPolicy: om.MlsWireFormatPolicy.plaintext,
    // The Welcome carries the tree, so joining needs nothing else.
    useRatchetTreeExtension: true,
    // RFC 9420 §15.2 / RFC 9750 §5.3: a message sent just before a commit
    // can arrive after it (another device's commit, an offline catch-up),
    // so the message secrets of the last 4 epochs are kept — the same
    // window as ts-mls on the web (retainKeysForEpochs 4). Older ones are
    // deleted (forward secrecy).
    maxPastEpochs: 4,
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
  Future<Uint8List> newLastResortKeyPackage() async {
    final kp = await _engine.createKeyPackageWithOptions(
      ciphersuite: _suite,
      signerBytes: _signer,
      credentialIdentity: _identity,
      signerPublicKey: signaturePublicKey,
      // The last_resort extension: OpenMLS keeps the private keys of such a
      // package after a join (one-time ones are deleted).
      options: const om.KeyPackageOptions(lastResort: true),
    );
    return wrapKeyPackage(kp.keyPackageBytes);
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
    bool groupInfo = false,
  }) async {
    final at = await epoch(groupId);
    final members = removeDeviceIds.isEmpty
        ? const <om.MlsMemberInfo>[]
        : await _engine.groupMembers(groupIdBytes: groupId);
    final indices = <int>[
      for (final m in members)
        if (removeDeviceIds.contains(_deviceOf(m.credential))) m.index,
    ];
    // Kept pending (in OpenMLS's database, so it survives a restart): the
    // Delivery Service decides (201 merge, refused / another commit discard).
    final r = await _engine.flexibleCommit(
      groupIdBytes: groupId,
      signerBytes: _signer,
      options: om.FlexibleCommitOptions(
        addKeyPackages: [for (final k in keyPackages) unwrapKeyPackage(k)],
        removeIndices: Uint32List.fromList(indices),
        forceSelfUpdate: true,
        consumePendingProposals: false,
        createGroupInfo: groupInfo,
        useRatchetTreeExtension: true,
        keepPending: true,
      ),
    );
    return MlsCommitOut(
      commit: r.commit,
      epoch: at,
      welcome: r.welcome,
      groupInfo: groupInfo ? r.groupInfo : null,
    );
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
  Future<Uint8List> exportGroupInfo(Uint8List groupId) =>
      _engine.exportGroupInfo(groupIdBytes: groupId, signerBytes: _signer);

  @override
  Future<MlsExternalJoinOut> joinExternal(
    Uint8List groupInfo, {
    bool resync = false,
  }) async {
    // OpenMLS's external commit removes the leaf with this device's
    // signature key itself (resync, RFC 9420 §12.4.3.2); the stored copy
    // of the group is replaced only for a GroupInfo from our Delivery
    // Service, which speaks for the group.
    final r = await _engine.joinGroupExternalCommit(
      config: _config,
      groupInfoBytes: groupInfo,
      signerBytes: _signer,
      credentialIdentity: _identity,
      signerPublicKey: signaturePublicKey,
      replaceStoredGroup: resync,
    );
    // OpenMLS stores the joined group with its external commit already
    // merged (the epoch after the GroupInfo's); mergeCommit is then a no-op
    // and a refusal deletes the group. The commit is made in the epoch
    // before.
    return MlsExternalJoinOut(
      groupId: r.groupId,
      commit: r.commit,
      epoch: await epoch(r.groupId) - 1,
      // The joined epoch's GroupInfo as an MLSMessage (what the Delivery
      // Service keeps; the join's own is a bare GroupInfo).
      groupInfo: await exportGroupInfo(r.groupId),
    );
  }

  @override
  Future<Uint8List> exportSecret(
    Uint8List groupId,
    String label,
    Uint8List context,
    int length,
  ) =>
      _engine.exportSecret(
        groupIdBytes: groupId,
        label: label,
        context: context,
        keyLength: length,
      );

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
