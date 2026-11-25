import 'dart:convert';
import 'dart:js_interop';
import 'dart:typed_data';

import 'package:lawbid/features/chat/e2ee/mls_engine.dart';

/// web/js/mls.js (ts-mls 1.6.4, MIT), loaded the first time; an absolute
/// path, the app's code lives under v/<sha>/. All bytes cross as base64.
extension type _Module._(JSObject _) implements JSObject {
  external JSPromise<JSString> open(JSString userId);
  external JSPromise<JSAny?> setDeviceId(JSString id);
  external JSPromise<JSString> newKeyPackages(JSNumber n);
  external JSPromise<JSAny?> createGroup(JSString gid);
  external JSPromise<JSBoolean> hasGroup(JSString gid);
  external JSPromise<JSNumber> epoch(JSString gid);
  external JSPromise<JSString> commit(
    JSString gid,
    JSString keyPackages,
    JSString remove,
  );
  external JSPromise<JSAny?> merge(JSString gid);
  external JSPromise<JSAny?> discard(JSString gid);
  external JSPromise<JSString> join(JSString welcome);
  external JSPromise<JSAny?> applyCommit(JSString gid, JSString commit);
  external JSPromise<JSString> encrypt(JSString gid, JSString plain);
  external JSPromise<JSString?> decrypt(JSString gid, JSString message);
  external JSPromise<JSString> members(JSString gid);
  external JSPromise<JSAny?> deleteGroup(JSString gid);
}

_Module? _module;

/// Item 25: the web app's MLS client (see web/js/mls.js).
Future<MlsEngine> openMlsEngine(String userId) async {
  final m =
      _module ??= (await importModule('/js/mls.js'.toJS).toDart) as _Module;
  final opened = jsonDecode((await m.open(userId.toJS).toDart).toDart)
      as Map<String, dynamic>;
  return _WebMlsEngine(
    m,
    base64Decode(opened['publicKey'] as String),
    opened['deviceId'] as String?,
  );
}

class _WebMlsEngine implements MlsEngine {
  _WebMlsEngine(this._m, this.signaturePublicKey, this._deviceId);

  final _Module _m;
  String? _deviceId;

  @override
  final Uint8List signaturePublicKey;

  @override
  String? get deviceId => _deviceId;

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
  }) async {
    final out = (await _m
            .commit(
              _b(groupId),
              jsonEncode([for (final k in keyPackages) base64Encode(k)]).toJS,
              jsonEncode(removeDeviceIds).toJS,
            )
            .toDart)
        .toDart;
    final r = jsonDecode(out) as Map<String, dynamic>;
    final welcome = r['welcome'] as String?;
    return MlsCommitOut(
      commit: base64Decode(r['commit'] as String),
      welcome: welcome == null ? null : base64Decode(welcome),
    );
  }

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
