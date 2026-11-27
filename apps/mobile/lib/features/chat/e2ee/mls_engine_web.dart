import 'dart:convert';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:lawbid/features/chat/e2ee/e2ee_service.dart'
    show E2eePlaintextStore;
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';

/// web/js/mls.js (ts-mls 1.6.4, MIT), loaded the first time; an absolute
/// path, the app's code lives under v/<sha>/. All bytes cross as base64.
extension type _Module._(JSObject _) implements JSObject {
  external JSPromise<JSString> open(JSString userId);
  external JSPromise<JSAny?> setDeviceId(JSString id);
  external JSPromise<JSAny?> wipe();
  external JSPromise<JSString> newKeyPackages(JSNumber n);
  external JSPromise<JSString> newLastResortKeyPackage();
  external JSPromise<JSAny?> createGroup(JSString gid);
  external JSPromise<JSBoolean> hasGroup(JSString gid);
  external JSPromise<JSNumber> epoch(JSString gid);
  external JSPromise<JSString> commit(
    JSString gid,
    JSString keyPackages,
    JSString remove,
    JSBoolean withInfo,
  );
  external JSPromise<JSString> exportGroupInfo(JSString gid);
  external JSPromise<JSString> joinExternal(JSString info, JSBoolean resync);
  external JSPromise<JSString> exportSecret(
    JSString gid,
    JSString label,
    JSString context,
    JSNumber length,
  );
  external JSPromise<JSAny?> merge(JSString gid);
  external JSPromise<JSAny?> discard(JSString gid);
  external JSPromise<JSString> join(JSString welcome);
  external JSPromise<JSAny?> applyCommit(JSString gid, JSString commit);
  external JSPromise<JSString> encrypt(JSString gid, JSString plain);
  external JSPromise<JSString?> decrypt(JSString gid, JSString message);
  external JSPromise<JSString> members(JSString gid);
  external JSPromise<JSAny?> deleteGroup(JSString gid);
  external JSPromise<JSString?> ptGet(JSString id);
  external JSPromise<JSAny?> ptPut(
    JSString id,
    JSString conversationId,
    JSString payload,
  );
  external JSPromise<JSAny?> ptDel(JSString id);
  external JSPromise<JSString> ptAll();
}

_Module? _module;

Future<_Module> _load() async =>
    _module ??= (await importModule('/js/mls.js'.toJS).toDart) as _Module;

/// Item 25: the web app's MLS client (see web/js/mls.js).
Future<MlsEngine> openMlsEngine(String userId) async {
  final m = await _load();
  final opened = jsonDecode((await m.open(userId.toJS).toDart).toDart)
      as Map<String, dynamic>;
  return _WebMlsEngine(
    m,
    base64Decode(opened['publicKey'] as String),
    opened['deviceId'] as String?,
  );
}

E2eePlaintextStore? sealedPlaintextStore(String userId) =>
    WebE2eePlaintextStore(userId);

/// The decrypted messages in the browser: sealed in mls.js's IndexedDB
/// (AES-GCM under the non-extractable key), like the MLS state — not in
/// the plain cache database. Works offline: it only opens the account's
/// keys in mls.js (no registration).
class WebE2eePlaintextStore implements E2eePlaintextStore {
  WebE2eePlaintextStore(this._userId);

  final String _userId;
  Future<_Module>? _opened;

  Future<_Module> _m() => _opened ??= () async {
        final m = await _load();
        await m.open(_userId.toJS).toDart;
        return m;
      }();

  @override
  Future<String?> get(String id) async =>
      (await (await _m()).ptGet(id.toJS).toDart)?.toDart;

  @override
  Future<void> put(String id, String conversationId, String payload) async {
    await (await _m()).ptPut(id.toJS, conversationId.toJS, payload.toJS).toDart;
  }

  @override
  Future<void> remove(String id) async {
    await (await _m()).ptDel(id.toJS).toDart;
  }

  /// Every decrypted message: id → (conversationId, payload).
  @override
  Future<Map<String, (String, String)>> all() async {
    final out = (await (await _m()).ptAll().toDart).toDart;
    return {
      for (final e in (jsonDecode(out) as Map<String, dynamic>).entries)
        e.key: ((e.value as List)[0] as String, (e.value as List)[1] as String),
    };
  }
}

class _WebMlsEngine implements MlsEngine {
  _WebMlsEngine(this._m, this.signaturePublicKey, this._deviceId);

  final _Module _m;
  String? _deviceId;

  @override
  final Uint8List signaturePublicKey;

  @override
  String? get deviceId => _deviceId;

  /// The browser keeps keys and groups in one IndexedDB: they are lost
  /// together, never one without the other.
  @override
  String? get previousDeviceId => null;

  @override
  Future<void> forgetPreviousDevice() async {}

  @override
  Future<void> wipe() async {
    _deviceId = null;
    await _m.wipe().toDart;
  }

  /// IndexedDB needs no closing (every call opens its own transaction).
  @override
  Future<void> close() async {}

  static JSString _b(Uint8List bytes) => base64Encode(bytes).toJS;

  @override
  Future<void> setDeviceId(String deviceId) async {
    _deviceId = deviceId;
    await _m.setDeviceId(deviceId.toJS).toDart;
  }

  @override
  Future<List<Uint8List>> newKeyPackages(int count) async {
    final out = (await _m.newKeyPackages(count.toJS).toDart).toDart;
    return [for (final k in jsonDecode(out) as List) base64Decode(k as String)];
  }

  @override
  Future<Uint8List> newLastResortKeyPackage() async =>
      base64Decode((await _m.newLastResortKeyPackage().toDart).toDart);

  @override
  Future<void> createGroup(Uint8List groupId) =>
      _m.createGroup(_b(groupId)).toDart;

  @override
  Future<bool> hasGroup(Uint8List groupId) async =>
      (await _m.hasGroup(_b(groupId)).toDart).toDart;

  @override
  Future<int> epoch(Uint8List groupId) async =>
      (await _m.epoch(_b(groupId)).toDart).toDartInt;

  @override
  Future<MlsCommitOut> commit(
    Uint8List groupId, {
    List<Uint8List> keyPackages = const [],
    List<String> removeDeviceIds = const [],
    bool groupInfo = false,
  }) async {
    final out = (await _m
            .commit(
              _b(groupId),
              jsonEncode([for (final k in keyPackages) base64Encode(k)]).toJS,
              jsonEncode(removeDeviceIds).toJS,
              groupInfo.toJS,
            )
            .toDart)
        .toDart;
    final r = jsonDecode(out) as Map<String, dynamic>;
    final welcome = r['welcome'] as String?;
    final info = r['groupInfo'] as String?;
    return MlsCommitOut(
      commit: base64Decode(r['commit'] as String),
      epoch: (r['epoch'] as num).toInt(),
      welcome: welcome == null ? null : base64Decode(welcome),
      groupInfo: info == null ? null : base64Decode(info),
    );
  }

  @override
  Future<Uint8List> exportGroupInfo(Uint8List groupId) async =>
      base64Decode((await _m.exportGroupInfo(_b(groupId)).toDart).toDart);

  @override
  Future<MlsExternalJoinOut> joinExternal(
    Uint8List groupInfo, {
    bool resync = false,
  }) async {
    final out =
        (await _m.joinExternal(_b(groupInfo), resync.toJS).toDart).toDart;
    final r = jsonDecode(out) as Map<String, dynamic>;
    final info = r['groupInfo'] as String?;
    return MlsExternalJoinOut(
      groupId: base64Decode(r['groupId'] as String),
      commit: base64Decode(r['commit'] as String),
      epoch: (r['epoch'] as num).toInt(),
      groupInfo: info == null ? null : base64Decode(info),
    );
  }

  @override
  Future<Uint8List> exportSecret(
    Uint8List groupId,
    String label,
    Uint8List context,
    int length,
  ) async =>
      base64Decode(
        (await _m
                .exportSecret(_b(groupId), label.toJS, _b(context), length.toJS)
                .toDart)
            .toDart,
      );

  @override
  Future<void> mergeCommit(Uint8List groupId) => _m.merge(_b(groupId)).toDart;

  @override
  Future<void> discardCommit(Uint8List groupId) =>
      _m.discard(_b(groupId)).toDart;

  @override
  Future<Uint8List> join(Uint8List welcome) async =>
      base64Decode((await _m.join(_b(welcome)).toDart).toDart);

  @override
  Future<void> applyCommit(Uint8List groupId, Uint8List commit) =>
      _m.applyCommit(_b(groupId), _b(commit)).toDart;

  @override
  Future<Uint8List> encrypt(Uint8List groupId, Uint8List plaintext) async =>
      base64Decode(
        (await _m.encrypt(_b(groupId), _b(plaintext)).toDart).toDart,
      );

  @override
  Future<Uint8List?> decrypt(Uint8List groupId, Uint8List message) async {
    final out = await _m.decrypt(_b(groupId), _b(message)).toDart;
    return out == null ? null : base64Decode(out.toDart);
  }

  @override
  Future<List<MlsMemberKey>> members(Uint8List groupId) async {
    final out = (await _m.members(_b(groupId)).toDart).toDart;
    return [
      for (final m in jsonDecode(out) as List)
        MlsMemberKey(
          identity: (m as Map)['identity'] as String,
          signatureKey: base64Decode(m['key'] as String),
        ),
    ];
  }

  @override
  Future<void> deleteGroup(Uint8List groupId) =>
      _m.deleteGroup(_b(groupId)).toDart;
}
