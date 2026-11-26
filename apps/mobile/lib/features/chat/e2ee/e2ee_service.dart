import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:blurhash_dart/blurhash_dart.dart';
import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart' show Hkdf, SecretKey;
import 'package:cryptography/cryptography.dart' as cg show Hmac;
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, compute, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:image/image.dart' as img;
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart'
    show SealedLinkCard;
import 'package:lawbid/features/chat/e2ee/e2ee_file.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_media.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_scratch.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid/features/chat/e2ee/push_preview.dart';
import 'package:lawbid/features/chat/e2ee/safety_number.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Where the decrypted payloads are kept (the cache database's
/// `E2eePlaintexts` on the phones, mls.js's sealed IndexedDB on the web; a
/// map in tests). Also holds this device's pending commit of a chat
/// (`p:<conversationId>`), so a commit whose answer was lost is decided on
/// the next catch-up even after a restart.
abstract class E2eePlaintextStore {
  Future<String?> get(String id);
  Future<void> put(String id, String conversationId, String payload);
  Future<void> remove(String id);

  /// Every row of the account (the backup): id → (conversation, payload).
  Future<Map<String, (String, String)>> all();
}

class MemoryE2eePlaintextStore implements E2eePlaintextStore {
  final Map<String, String> rows = {};
  final Map<String, String> chats = {};

  @override
  Future<String?> get(String id) async => rows[id];

  @override
  Future<void> put(String id, String conversationId, String payload) async {
    rows[id] = payload;
    chats[id] = conversationId;
  }

  @override
  Future<void> remove(String id) async {
    rows.remove(id);
    chats.remove(id);
  }

  @override
  Future<Map<String, (String, String)>> all() async => {
        for (final e in rows.entries) e.key: (chats[e.key] ?? '', e.value),
      };
}

/// Rows of [E2eePlaintextStore] that are not decrypted messages: this
/// device's own bookkeeping (pending commit `p:`, outgoing file key `f:`,
/// members' key fingerprints `k:`, the backup key `b:`). Never backed up.
bool isE2eeBookkeepingRow(String id) =>
    id.startsWith('p:') ||
    id.startsWith('f:') ||
    id.startsWith('k:') ||
    id.startsWith('b:');

/// The chat is end-to-end encrypted but this device cannot write yet (its
/// Welcome has not come, or the server refused): the message waits.
class E2eeNotReady implements Exception {
  const E2eeNotReady(this.reason);
  final String reason;
  @override
  String toString() => 'E2eeNotReady($reason)';
}

/// The server's error codes the device acts on.
abstract final class E2eeErrors {
  /// Another commit took the epoch (or the message's epoch is stale).
  static const epochConflict = 'E2EE_EPOCH_CONFLICT';

  /// A plain message in a chat that became end-to-end encrypted.
  static const required = 'E2EE_REQUIRED';

  /// Devices that left must be removed before anyone writes (409), or a
  /// commit that cannot change these devices (400).
  static const membershipInvalid = 'E2EE_MEMBERSHIP_INVALID';

  /// The switch went to Выкл (or the chat cannot be encrypted): the next
  /// try goes as a normal message.
  static const off = 'E2EE_OFF';

  /// A send refused for the chat's encryption state, not for what it says:
  /// the outbox tries it again after the state was refreshed (the chat
  /// moved to a new epoch, became encrypted, a device must go first, or the
  /// switch went off) — RFC 9750 §5.2, Wire.
  static bool sendIsRetryable(String code, int? status) =>
      status == 409 &&
      (code == epochConflict ||
          code == required ||
          code == off ||
          code == membershipInvalid);
}

/// This device's commit of a chat that the server has not decided on yet.
class _Pending {
  const _Pending({
    required this.epoch,
    required this.commit,
    required this.added,
    required this.removed,
    this.welcome,
  });

  factory _Pending.fromJson(Map<String, dynamic> j) => _Pending(
        epoch: (j['e'] as num).toInt(),
        commit: j['c'] as String,
        welcome: j['w'] as String?,
        added: [for (final d in j['a'] as List) d as String],
        removed: [for (final d in j['r'] as List) d as String],
      );

  final int epoch;
  final String commit;
  final String? welcome;
  final List<String> added;
  final List<String> removed;

  Map<String, Object?> toJson() => {
        'e': epoch,
        'c': commit,
        'w': welcome,
        'a': added,
        'r': removed,
      };
}

/// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): the device side
/// of end-to-end encrypted chats, the way Wire / WhatsApp clients work:
///
/// - registers this device's MLS key and keeps its KeyPackages topped up
///   (below half of `chat.e2ee_key_packages_target` it adds more), with a
///   real last-resort package (RFC 9420 §16.8);
/// - per chat: creates the MLS group when the server says `pending`, joins
///   from a Welcome (a Welcome it cannot use: the members remove and add
///   it again), applies the commits of others in epoch order, adds the
///   members' new devices and removes the ones that left (a 409 from the
///   strongly-ordered Delivery Service = catch up and try again). Its own
///   commit stays pending until the server's answer, and survives a
///   restart: the next catch-up merges it when the server took exactly
///   those bytes, otherwise discards it (RFC 9420 §12.4);
/// - encrypts outgoing text into `type=mls` sends and decrypts incoming
///   ones ONCE (forward secrecy), keeping the plaintext on the device; a
///   message it cannot open yet keeps its ciphertext and is tried again
///   after the next catch-up and after a restart.
///
/// One chat is worked on by one task at a time ([_serial]); the MLS state
/// never sees two operations at once. Sending needs no server round trip
/// while the cached state is current: the `e2ee:commit` events and a 409
/// tell when it is not.
class E2eeService {
  E2eeService({
    required this.client,
    required this.ownerId,
    required this.plaintexts,
    required Future<MlsEngine> Function(String userId) openEngine,
    api.MlsDevicePlatform? platform,
    this.upload,
    this.download,
    E2eeScratch? scratch,
  })  : _openEngine = openEngine,
        _platform = platform ?? _platformNow(),
        scratch = scratch ?? E2eeScratch.create();

  /// PR 4: puts encrypted bytes into storage as `purpose`; the file id.
  final Future<String> Function(UploadBody body, api.FilePurpose purpose)?
      upload;

  /// PR 4: the bytes behind a short link (an encrypted file / backup), as
  /// they arrive.
  final Stream<List<int>> Function(String url)? download;

  /// PR 4: where encrypted files pass through (disk on the phone).
  final E2eeScratch scratch;

  final api.E2eeClient client;
  final String ownerId;
  final E2eePlaintextStore plaintexts;
  final Future<MlsEngine> Function(String userId) _openEngine;
  final api.MlsDevicePlatform _platform;

  Future<MlsEngine>? _engine;
  final Map<String, Future<void>> _queues = {};
  final Map<String, api.ConversationE2eeDto> _states = {};

  /// Decrypted payloads by message id, for the synchronous mappers.
  final Map<String, E2eePayload> _memory = {};

  /// Messages not opened yet, by chat: tried again after a catch-up.
  final Map<String, Map<String, api.MessageDto>> _undecrypted = {};

  /// Devices of a chat that had no KeyPackage left at the last try (a send
  /// does not ask for them again until the next event of the chat).
  final Map<String, Set<String>> _unaddable = {};

  final _opened = StreamController<api.MessageDto>.broadcast();

  /// A message that waited and is now opened (the screens put it in place).
  Stream<api.MessageDto> get opened => _opened.stream;

  /// RFC 9420 §15.2: how many past epochs keep their message keys (the
  /// engines' window); a message older than that never opens.
  static const pastEpochs = 4;

  static api.MlsDevicePlatform _platformNow() {
    if (kIsWeb) return api.MlsDevicePlatform.web;
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
        return api.MlsDevicePlatform.android;
      case TargetPlatform.macOS:
        return api.MlsDevicePlatform.macos;
      case TargetPlatform.iOS:
      case TargetPlatform.fuchsia:
      case TargetPlatform.linux:
      case TargetPlatform.windows:
        return api.MlsDevicePlatform.ios;
    }
  }

  // ------------------------------------------------------------- device

  /// The device's MLS client, registered with the server and with
  /// KeyPackages on it.
  Future<MlsEngine> engine() async {
    final opening = _engine ??= _open();
    try {
      return await opening;
    } on Object {
      // A failed start (offline, server down) is tried again next time.
      if (identical(_engine, opening)) _engine = null;
      rethrow;
    }
  }

  Future<MlsEngine> _open() async {
    final e = await _openEngine(ownerId);
    // iOS reinstall: the keys outlived the database. The old device is
    // signed out (its groups remove it), this one registers afresh.
    final previous = e.previousDeviceId;
    if (previous != null) {
      try {
        await client.revokeMlsDevice(id: previous);
      } on DioException catch (x) {
        // 404: already gone. No answer: tried again on the next start.
        if (!_refused(x)) rethrow;
      }
      await e.forgetPreviousDevice();
    }
    if (e.deviceId == null) {
      final d = (await client.registerMlsDevice(
        body: api.RegisterMlsDeviceDto(
          signatureKey: base64Encode(e.signaturePublicKey),
          platform: _platform,
        ),
      ))
          .data;
      await e.setDeviceId(d.id);
      // A real last-resort package first (RFC 9420 §16.8: several Welcomes
      // may use it, its private half stays after a join).
      final last = await e.newLastResortKeyPackage();
      await client.uploadMlsKeyPackages(
        id: d.id,
        body: api.UploadKeyPackagesDto(
          keyPackages: const [],
          lastResort: base64Encode(last),
        ),
      );
    }
    await _topUp(e);
    return e;
  }

  Future<void> _topUp(MlsEngine e) async {
    final c = (await client.countMlsKeyPackages(id: e.deviceId!)).data;
    final target = c.target.toInt();
    final have = c.oneTime.toInt();
    if (!c.lastResort) {
      await client.uploadMlsKeyPackages(
        id: e.deviceId!,
        body: api.UploadKeyPackagesDto(
          keyPackages: const [],
          lastResort: base64Encode(await e.newLastResortKeyPackage()),
        ),
      );
    }
    if (target <= 0 || have * 2 >= target) return;
    final kps = await e.newKeyPackages(target - have);
    await client.uploadMlsKeyPackages(
      id: e.deviceId!,
      body: api.UploadKeyPackagesDto(
        keyPackages: [for (final k in kps) base64Encode(k)],
      ),
    );
  }

  /// Sign-out (WhatsApp: a signed-out device leaves every chat): this
  /// device's keys and groups are deleted here; returns its server id so
  /// the caller signs it out on the server too (null when it had none).
  Future<String?> signOutDevice() async {
    final opening = _engine;
    _engine = null;
    MlsEngine? e;
    try {
      // A start still waiting for the network does not hold the sign-out.
      e = opening == null
          ? await _openEngine(ownerId)
          : await opening.timeout(const Duration(seconds: 3));
    } on Object {
      try {
        e = await _openEngine(ownerId);
      } on Object {
        e = null;
      }
    }
    final id = e?.deviceId;
    await e?.wipe();
    _states.clear();
    _memory.clear();
    _undecrypted.clear();
    _unaddable.clear();
    _waiting.clear();
    _dropped.clear();
    await _forgetFiles();
    return id;
  }

  /// The account's service goes (sign-out, another account): the MLS
  /// database is closed so the next one can open it.
  Future<void> close() async {
    final opening = _engine;
    _engine = null;
    await _opened.close();
    if (opening == null) return;
    try {
      await (await opening).close();
    } on Object {
      // It never opened.
    }
  }

  // --------------------------------------------------------------- chats

  Future<T> _serial<T>(String conversationId, Future<T> Function() job) {
    final previous = _queues[conversationId] ?? Future<void>.value();
    final result = previous.then((_) => job());
    _queues[conversationId] = result.then((_) {}, onError: (_) {});
    return result;
  }

  /// The server's view of the chat (cached until a commit event).
  Future<api.ConversationE2eeDto> state(
    String conversationId, {
    bool fresh = false,
  }) async {
    final known = _states[conversationId];
    if (known != null && !fresh) return known;
    final s = (await client.getConversationE2ee(id: conversationId)).data;
    _states[conversationId] = s;
    return s;
  }

  /// The cached view of the chat is stale (a 409 of the send, an event).
  void invalidate(String conversationId) {
    _states.remove(conversationId);
    _unaddable.remove(conversationId);
  }

  /// Whether new messages of this chat must go end-to-end encrypted.
  Future<bool> encrypted(String conversationId) async =>
      (await state(conversationId)).state == api.ConversationE2eeState.valueOn;

  /// A commit event of the chat (`e2ee:commit`) or a Welcome for me.
  void onServerEvent(String conversationId) {
    invalidate(conversationId);
    unawaited(
      sync(conversationId).then(
        (_) {},
        onError: (Object e) => debugPrint('e2ee sync $conversationId: $e'),
      ),
    );
  }

  /// Brings this device's copy of the chat's group up to the server's:
  /// creates / joins it, settles its own pending commit, applies others'
  /// commits, adds missing devices and removes the ones that left, then
  /// opens the messages that waited. True when this device can write.
  Future<bool> sync(String conversationId) =>
      _serial(conversationId, () => _sync(conversationId));

  Future<bool> _sync(String conversationId, {int attempt = 0}) async {
    final e = await engine();
    var s = await state(conversationId, fresh: true);
    if (s.state == api.ConversationE2eeState.off) return false;
    if (s.state == api.ConversationE2eeState.pending) {
      final gid = Uint8List.fromList(utf8.encode('lawbid:$conversationId'));
      if (!await e.hasGroup(gid)) await e.createGroup(gid);
      try {
        s = (await client.createMlsGroup(
          id: conversationId,
          body: api.CreateMlsGroupDto(
            deviceId: e.deviceId!,
            groupId: base64Encode(gid),
          ),
        ))
            .data;
        _states[conversationId] = s;
      } on DioException catch (x) {
        // Another device of the chat made it first: join that one.
        await e.deleteGroup(gid);
        if (attempt > 2 || !_isConflict(x)) rethrow;
        return _sync(conversationId, attempt: attempt + 1);
      }
    }
    final gid = base64Decode(s.groupId!);
    if (!await e.hasGroup(gid)) {
      await _takeWelcomes(e);
      if (!await e.hasGroup(gid)) return false;
    }
    try {
      if (await _settlePending(e, conversationId, gid)) {
        // My commit went in after all: the members it changed are in.
        s = await state(conversationId, fresh: true);
      }
      await _catchUp(e, conversationId, gid, upTo: s.epoch?.toInt());
      final remove = s.removeDevices;
      final skip = _unaddable[conversationId] ?? const <String>{};
      final missing = [
        for (final d in s.devices)
          if (!d.inGroup &&
              d.deviceId != e.deviceId &&
              !remove.contains(d.deviceId) &&
              !skip.contains(d.deviceId))
            d.deviceId,
      ];
      final kps = <Uint8List>[];
      final ids = <String>[];
      if (missing.isNotEmpty) {
        final claimed = (await client.claimMlsKeyPackages(
          id: conversationId,
          body: api.ClaimKeyPackagesDto(deviceIds: missing),
        ))
            .data;
        for (final c in claimed) {
          if (c.keyPackage == null) {
            (_unaddable[conversationId] ??= {}).add(c.deviceId);
            continue;
          }
          kps.add(base64Decode(c.keyPackage!));
          ids.add(c.deviceId);
        }
      }
      // One commit removes the devices that left and adds the new ones.
      if (remove.isNotEmpty || kps.isNotEmpty) {
        await _commit(
          e,
          conversationId,
          gid,
          keyPackages: kps,
          ids: ids,
          removeDeviceIds: remove,
        );
      }
    } on DioException catch (x) {
      if (attempt > 2 || !_isConflict(x)) rethrow;
      return _sync(conversationId, attempt: attempt + 1);
    }
    await _openWaiting(e, conversationId, gid);
    await _checkKeys(e, conversationId, gid);
    return true;
  }

  Future<_Pending?> _pendingOf(String conversationId) async {
    final j = await plaintexts.get('p:$conversationId');
    if (j == null) return null;
    return _Pending.fromJson(jsonDecode(j) as Map<String, dynamic>);
  }

  Future<void> _dropPending(String conversationId) =>
      plaintexts.remove('p:$conversationId');

  Future<void> _commit(
    MlsEngine e,
    String conversationId,
    Uint8List gid, {
    List<Uint8List> keyPackages = const [],
    List<String> ids = const [],
    List<String> removeDeviceIds = const [],
  }) async {
    Future<MlsCommitOut> make() => e.commit(
          gid,
          keyPackages: keyPackages,
          removeDeviceIds: removeDeviceIds,
        );
    MlsCommitOut out;
    try {
      out = await make();
    } on Object {
      // A pending commit with no record of it (the app stopped between
      // the two) blocks a new one: it never reached the server.
      if (await _pendingOf(conversationId) != null) rethrow;
      await e.discardCommit(gid);
      out = await make();
    }
    final p = _Pending(
      epoch: out.epoch,
      commit: base64Encode(out.commit),
      welcome: out.welcome == null ? null : base64Encode(out.welcome!),
      added: ids,
      removed: removeDeviceIds,
    );
    await plaintexts.put(
      'p:$conversationId',
      conversationId,
      jsonEncode(p.toJson()),
    );
    await _post(e, conversationId, gid, p);
  }

  /// Sends [p]; merges it when the server took it. Discards it only when
  /// the server answered that it did not (409 another commit at this
  /// epoch, or a refusal); without an answer it stays pending.
  Future<void> _post(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
    _Pending p,
  ) async {
    try {
      await client.postMlsCommit(
        id: conversationId,
        body: api.MlsCommitDto(
          deviceId: e.deviceId!,
          epoch: p.epoch,
          commit: p.commit,
          addedDevices: p.added,
          removedDevices: p.removed,
          welcome: p.welcome,
        ),
      );
    } on DioException catch (x) {
      _states.remove(conversationId);
      if (_codeOf(x) == E2eeErrors.epochConflict) {
        // Another commit took the epoch — or this one did, and the answer
        // of its first try was lost: the server's commit decides.
        final row = await _serverCommit(conversationId, p.epoch);
        if (row != null && row.commit == p.commit) {
          await e.mergeCommit(gid);
          await _dropPending(conversationId);
          return;
        }
        await e.discardCommit(gid);
        await _dropPending(conversationId);
        rethrow;
      }
      if (_refused(x)) {
        await e.discardCommit(gid);
        await _dropPending(conversationId);
      }
      rethrow;
    }
    await e.mergeCommit(gid);
    await _dropPending(conversationId);
    _states.remove(conversationId);
  }

  /// The pending commit of the chat (from before a lost answer or a
  /// restart) is decided first: merged when the server holds exactly its
  /// bytes for that epoch, discarded when it holds another commit, sent
  /// again (the same bytes) when the server has none. True when the group
  /// moved (the state read before is stale).
  Future<bool> _settlePending(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
  ) async {
    final p = await _pendingOf(conversationId);
    if (p == null) return false;
    if (p.epoch != await e.epoch(gid)) {
      // The group moved on without it: it is not this group's any more.
      await e.discardCommit(gid);
      await _dropPending(conversationId);
      return false;
    }
    final row = await _serverCommit(conversationId, p.epoch);
    if (row != null) {
      await _applyRow(e, conversationId, gid, row);
      return true;
    }
    await _post(e, conversationId, gid, p);
    return true;
  }

  Future<api.MlsCommitRowDto?> _serverCommit(
    String conversationId,
    int epoch,
  ) async {
    final rows =
        (await client.listMlsCommits(id: conversationId, after: epoch)).data;
    for (final r in rows) {
      if (r.epoch.toInt() == epoch) return r;
    }
    return null;
  }

  /// One accepted commit of the server, at this device's epoch.
  Future<void> _applyRow(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
    api.MlsCommitRowDto r,
  ) async {
    final p = await _pendingOf(conversationId);
    if (p != null && p.epoch == r.epoch.toInt()) {
      await _dropPending(conversationId);
      if (p.commit == r.commit) {
        // RFC 9420 §12.4: my own commit is merged, never processed.
        await e.mergeCommit(gid);
        return;
      }
      await e.discardCommit(gid);
    }
    try {
      await e.applyCommit(gid, base64Decode(r.commit));
    } on Object catch (x) {
      // This copy of the group cannot follow the server's: it is dropped
      // and the members add this device again (a fresh Welcome).
      debugPrint('e2ee commit ${r.epoch} of $conversationId: $x');
      await e.deleteGroup(gid);
      await _requestRejoin(e, conversationId);
      throw const E2eeNotReady('rejoin');
    }
  }

  Future<void> _requestRejoin(MlsEngine e, String conversationId) =>
      client.requestMlsRejoin(
        id: conversationId,
        body: api.MlsRejoinDto(deviceId: e.deviceId!),
      );

  Future<void> _takeWelcomes(MlsEngine e) async {
    final ws = (await client.listMlsWelcomes(deviceId: e.deviceId!)).data;
    for (final w in ws) {
      final welcome = base64Decode(w.welcome);
      final gid = _groupIdOf(w.conversationId);
      try {
        try {
          await e.join(welcome);
        } on Object {
          // An old copy of the group (this device was removed and is added
          // again) is replaced by the new one.
          if (gid == null ||
              !await e.hasGroup(gid) ||
              await e.epoch(gid) >= w.epoch.toInt()) {
            rethrow;
          }
          await e.deleteGroup(gid);
          await e.join(welcome);
        }
      } on Object catch (x) {
        debugPrint('e2ee welcome ${w.id}: $x');
        final already = gid != null &&
            await e.hasGroup(gid) &&
            await e.epoch(gid) >= w.epoch.toInt();
        if (!already) {
          // This device cannot join from it: not acknowledged; the members
          // remove and add it again, the server drops this Welcome.
          try {
            await _requestRejoin(e, w.conversationId);
          } on Object catch (y) {
            debugPrint('e2ee rejoin ${w.conversationId}: $y');
          }
          continue;
        }
      }
      await client.ackMlsWelcome(id: w.id);
    }
    if (ws.isNotEmpty) await _topUp(e);
  }

  Uint8List? _groupIdOf(String conversationId) {
    final g = _states[conversationId]?.groupId;
    return g == null ? null : base64Decode(g);
  }

  /// Applies the server's commits from this device's epoch on, up to
  /// [upTo] (the epoch a message or the state needs; null = all).
  Future<void> _catchUp(
    MlsEngine e,
    String conversationId,
    Uint8List gid, {
    int? upTo,
  }) async {
    while (true) {
      var mine = await e.epoch(gid);
      if (upTo != null && mine >= upTo) return;
      final rows = (await client.listMlsCommits(
        id: conversationId,
        after: mine,
      ))
          .data
        ..sort((a, b) => a.epoch.compareTo(b.epoch));
      var moved = false;
      for (final r in rows) {
        if (r.epoch.toInt() != mine) continue;
        await _applyRow(e, conversationId, gid, r);
        mine += 1;
        moved = true;
        if (upTo != null && mine >= upTo) return;
      }
      if (!moved) return;
    }
  }

  static bool _isConflict(DioException x) => x.response?.statusCode == 409;

  static String? _codeOf(DioException x) {
    final data = x.response?.data;
    if (data is Map && data['error'] is Map) {
      final code = (data['error'] as Map)['code'];
      if (code is String) return code;
    }
    return null;
  }

  /// The server answered «no» (it did not and will not take it); no answer,
  /// a busy server, a token being renewed or a timeout are not refusals.
  static bool _refused(DioException x) {
    final c = x.response?.statusCode;
    if (c == null) return false;
    return c >= 400 && c < 500 && c != 401 && c != 408 && c != 425 && c != 429;
  }

  // ------------------------------------------------------------ messages

  /// Whether a send can go at once, from the cached state alone: the chat
  /// is on, this device is in its group at the server's epoch with nothing
  /// pending, and nobody waits to be added or removed.
  Future<bool> _canWriteNow(
    MlsEngine e,
    String conversationId,
    api.ConversationE2eeDto s,
  ) async {
    if (s.state != api.ConversationE2eeState.valueOn || s.groupId == null) {
      return false;
    }
    if (s.removeDevices.isNotEmpty) return false;
    final skip = _unaddable[conversationId] ?? const <String>{};
    for (final d in s.devices) {
      if (!d.inGroup &&
          d.deviceId != e.deviceId &&
          !skip.contains(d.deviceId)) {
        return false;
      }
    }
    final gid = base64Decode(s.groupId!);
    if (!await e.hasGroup(gid)) return false;
    if (await e.epoch(gid) != s.epoch?.toInt()) return false;
    return await _pendingOf(conversationId) == null;
  }

  /// The `type=mls` send of [payload], or null when the chat is not end-to-
  /// end encrypted (send as before). Throws [E2eeNotReady] when it is but
  /// this device cannot write yet.
  Future<api.SendMessageDto?> seal(
    String conversationId,
    String clientMessageId,
    E2eePayload payload, {
    String? fileId,
  }) =>
      _serial(conversationId, () async {
        // Pending = every member can read encrypted: this send starts it.
        var s = await state(conversationId);
        if (s.state == api.ConversationE2eeState.off) return null;
        final e = await engine();
        if (!await _canWriteNow(e, conversationId, s)) {
          final ready = await _sync(conversationId);
          if (!ready) throw const E2eeNotReady('not_in_group');
          s = await state(conversationId);
        }
        final gid = base64Decode(s.groupId!);
        final epoch = await e.epoch(gid);
        // Message franking (Messenger): a fresh key k inside the plaintext
        // P, and HMAC-SHA256(k, P) next to the ciphertext — a report of this
        // message can be checked, and the receivers check it too.
        final k = E2eeFile.newKey();
        final franked = E2eePayload(
          kind: payload.kind,
          body: payload.body,
          replyToId: payload.replyToId,
          forwarded: payload.forwarded,
          extra: {...payload.extra, 'k': base64Encode(k)},
        );
        final plain = franked.encode();
        final tag = Hmac(sha256, k).convert(plain).bytes;
        final ct = await e.encrypt(gid, plain);
        // My own message cannot be decrypted by me: kept now, byte for byte
        // (a report hands exactly these bytes over).
        await plaintexts.put(
          'c:$clientMessageId',
          conversationId,
          utf8.decode(plain),
        );
        _memory['c:$clientMessageId'] = franked;
        final previews = await _pushPreviews(conversationId, s, payload);
        return api.SendMessageDto(
          clientMessageId: clientMessageId,
          type: api.SendMessageType.mls,
          ciphertext: base64Encode(ct),
          mlsEpoch: epoch,
          mlsDeviceId: e.deviceId,
          frankingTag: base64Encode(tag),
          fileId: fileId,
          // Which message it answers is metadata the server already orders
          // by (the quoted text stays inside the encryption).
          replyToId: payload.replyToId,
          pushPreviews: previews.isEmpty ? null : previews,
        );
      });

  /// M12 (owner 26.11, WhatsApp): the push preview of [payload] sealed to
  /// each recipient phone's push-preview key (PushPreview), so the push
  /// shows the text while the server still sees none. Empty when the chat
  /// lists no keys (previews in pushes off, older phones) or on any error:
  /// a preview never holds a message back.
  Future<List<api.SealedPushPreviewDto>> _pushPreviews(
    String conversationId,
    api.ConversationE2eeDto s,
    E2eePayload payload,
  ) async {
    final keys = s.previewKeys ?? const <api.PushPreviewKeyDto>[];
    if (keys.isEmpty) return const [];
    final plain = PushPreview.plaintextOf(payload);
    if (plain == null) return const [];
    final info = PushPreview.info(conversationId);
    final out = <api.SealedPushPreviewDto>[];
    for (final k in keys.take(PushPreview.maxKeys)) {
      try {
        final sealed = await PushPreview.seal(
          recipientPublicKey: base64Decode(k.publicKey),
          info: info,
          plaintext: plain,
        );
        out.add(
          api.SealedPushPreviewDto(
            keyId: k.keyId,
            sealedValue: base64Encode(sealed),
          ),
        );
      } on Object catch (x) {
        debugPrint('push preview for ${k.keyId}: $x');
      }
    }
    return out;
  }

  /// The message as the app shows it: an `mls` message becomes the text it
  /// carries (decrypted once, then from the device's store).
  Future<api.MessageDto> open(api.MessageDto d) async {
    if (d.type != api.MessageDtoType.mls) return d;
    final payload = await _payloadOf(d);
    await _prepareFile(d, payload);
    return withPayload(d, payload);
  }

  /// PR 4: a file is made readable on this device before the bubble shows.
  Future<void> _prepareFile(api.MessageDto d, E2eePayload? p) async {
    final fileId = p == null ? null : _registerFile(d, p);
    if (fileId == null) return;
    try {
      await E2eeMedia.prepare(fileId);
    } on Object catch (x) {
      debugPrint('e2ee file $fileId: $x');
    }
  }

  /// A page / catch-up: the `mls` messages are opened older epoch first
  /// (RFC 9420: a past epoch's keys are the first to go), each epoch in
  /// the order they were sent; the page keeps its order.
  Future<List<api.MessageDto>> openAll(List<api.MessageDto> ds) async {
    if (!ds.any((d) => d.type == api.MessageDtoType.mls)) return ds;
    final order = [
      for (final d in ds)
        if (d.type == api.MessageDtoType.mls) d,
    ]..sort(_oldestFirst);
    final got = <String, E2eePayload?>{
      for (final d in order) d.id: await _payloadOf(d),
    };
    for (final d in order) {
      await _prepareFile(d, got[d.id]);
    }
    return [
      for (final d in ds)
        if (d.type == api.MessageDtoType.mls) withPayload(d, got[d.id]) else d,
    ];
  }

  static int _oldestFirst(api.MessageDto a, api.MessageDto b) {
    final e = (a.mlsEpoch ?? 0).compareTo(b.mlsEpoch ?? 0);
    if (e != 0) return e;
    final t = a.createdAt.compareTo(b.createdAt);
    return t != 0 ? t : a.id.compareTo(b.id);
  }

  /// Synchronous: from memory only (null when not opened yet).
  api.MessageDto openCached(api.MessageDto d) {
    if (d.type != api.MessageDtoType.mls) return d;
    return withPayload(d, _cached(d));
  }

  /// Third pass S3: the link card the sender put inside [d] (null = none,
  /// or not opened yet).
  SealedLinkCard? linkCardOf(api.MessageDto d) =>
      SealedLinkCard.tryParse(_cached(d)?.extra['lp']);

  /// Whether a text sent now to [conversationId] goes sealed (the cached
  /// state, as [seal] decides).
  Future<bool> seals(String conversationId) async =>
      (await state(conversationId)).state != api.ConversationE2eeState.off;

  E2eePayload? _cached(api.MessageDto d) =>
      _memory[d.id] ??
      (d.clientMessageId == null ? null : _memory['c:${d.clientMessageId}']);

  /// The phone's copy of a chat was read (after a restart nothing is in
  /// memory): the opened texts come from the device's store; messages
  /// that never opened are tried again in the background.
  Future<void> prime(Iterable<api.MessageDto> rows) async {
    final retry = <String>{};
    for (final d in rows) {
      if (d.type != api.MessageDtoType.mls || _cached(d) != null) continue;
      if (await _stored(d) != null) continue;
      if (d.ciphertext == null || d.revoked) continue;
      (_undecrypted[d.conversationId] ??= {})[d.id] = d;
      _waiting.add(d.id);
      retry.add(d.conversationId);
    }
    for (final c in retry) {
      unawaited(
        _serial(c, () => _retryWaiting(c)).then(
          (_) {},
          onError: (Object x) => debugPrint('e2ee retry $c: $x'),
        ),
      );
    }
  }

  Future<E2eePayload?> _stored(api.MessageDto d) async {
    var json = await plaintexts.get(d.id);
    if (json == null && d.clientMessageId != null) {
      json = await plaintexts.get('c:${d.clientMessageId}');
      if (json != null) await plaintexts.put(d.id, d.conversationId, json);
    }
    if (json == null) return null;
    final p = E2eePayload.fromJson(jsonDecode(json) as Map<String, dynamic>);
    _memory[d.id] = p;
    return p;
  }

  Future<E2eePayload?> _payloadOf(api.MessageDto d) async {
    final hit = _memory[d.id];
    if (hit != null) return hit;
    if (_dropped.contains(d.id)) return null;
    final stored = await _stored(d);
    if (stored != null) return stored;
    if (d.ciphertext == null || d.revoked) return null;
    return _serial(d.conversationId, () async {
      try {
        final e = await engine();
        final s = await state(d.conversationId);
        if (s.groupId == null) return _wait(d);
        final gid = base64Decode(s.groupId!);
        if (!await e.hasGroup(gid)) await _takeWelcomes(e);
        if (!await e.hasGroup(gid)) return _wait(d);
        // Only as far as this message needs: a later commit would move
        // past the keys of its epoch.
        final epoch = d.mlsEpoch?.toInt() ?? 0;
        if (await e.epoch(gid) < epoch) {
          await _catchUp(e, d.conversationId, gid, upTo: epoch);
        }
        return await _decryptNow(e, gid, d) ?? _wait(d);
      } on Object catch (x) {
        debugPrint('e2ee open ${d.id}: $x');
        return _wait(d);
      }
    });
  }

  E2eePayload? _wait(api.MessageDto d) {
    if (!_dropped.contains(d.id)) {
      (_undecrypted[d.conversationId] ??= {})[d.id] = d;
    }
    return null;
  }

  Future<E2eePayload?> _decryptNow(
    MlsEngine e,
    Uint8List gid,
    api.MessageDto d,
  ) async {
    final plain = await e.decrypt(gid, base64Decode(d.ciphertext!));
    if (plain == null) return null;
    // The message has been opened (its key is gone): it is not tried again,
    // whatever comes next.
    _undecrypted[d.conversationId]?.remove(d.id);
    final p = E2eePayload.decode(plain);
    if (!frankingMatches(plain, p, d.frankingTag)) {
      // Messenger's franking: the tag the server stored is not the one of
      // what was encrypted — not what the sender sent for the record, so
      // it is dropped (never shown, never stored, cannot be reported).
      debugPrint('e2ee franking mismatch ${d.id}: dropped');
      _dropped.add(d.id);
      return null;
    }
    // Byte for byte: a report hands exactly what was decrypted.
    await plaintexts.put(d.id, d.conversationId, utf8.decode(plain));
    _memory[d.id] = p;
    return p;
  }

  /// Messages whose franking tag did not match (dropped).
  final Set<String> _dropped = {};

  /// True when [tag] (base64, from the server) is HMAC-SHA256(k, [plain])
  /// with the key `k` inside [p] (Facebook Messenger's message franking).
  static bool frankingMatches(Uint8List plain, E2eePayload p, String? tag) {
    final k = p.extra['k'];
    if (tag == null || k is! String) return false;
    final List<int> key;
    final List<int> want;
    try {
      key = base64Decode(k);
      want = base64Decode(tag);
    } on FormatException {
      return false;
    }
    if (key.length != 32 || want.length != 32) return false;
    final got = Hmac(sha256, key).convert(plain).bytes;
    var diff = 0;
    for (var i = 0; i < 32; i++) {
      diff |= got[i] ^ want[i];
    }
    return diff == 0;
  }

  /// Inside the chat's queue: catches up as far as the waiting messages
  /// need, then opens them.
  Future<void> _retryWaiting(String conversationId) async {
    final waiting = _undecrypted[conversationId];
    if (waiting == null || waiting.isEmpty) return;
    final e = await engine();
    final s = await state(conversationId);
    if (s.groupId == null) return;
    final gid = base64Decode(s.groupId!);
    if (!await e.hasGroup(gid)) await _takeWelcomes(e);
    if (!await e.hasGroup(gid)) return;
    final need = waiting.values
        .map((d) => d.mlsEpoch?.toInt() ?? 0)
        .fold<int>(0, (a, b) => a > b ? a : b);
    if (await e.epoch(gid) < need) {
      await _catchUp(e, conversationId, gid, upTo: need);
    }
    await _openWaiting(e, conversationId, gid);
  }

  /// The messages of the chat that waited, now that the group caught up.
  Future<void> _openWaiting(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
  ) async {
    final waiting = _undecrypted[conversationId];
    if (waiting == null || waiting.isEmpty) return;
    final mine = await e.epoch(gid);
    for (final d in [...waiting.values]..sort(_oldestFirst)) {
      final epoch = d.mlsEpoch?.toInt() ?? 0;
      if (epoch > mine) continue;
      try {
        final p = await _decryptNow(e, gid, d);
        if (p != null && !_opened.isClosed) _opened.add(withPayload(d, p));
      } on Object catch (x) {
        // Past the kept window its keys are gone for good: it stays
        // «waiting» but is not tried again.
        if (mine - epoch >= pastEpochs) waiting.remove(d.id);
        debugPrint('e2ee open ${d.id}: $x');
      }
    }
  }

  /// The DTO the rest of the app reads: type text with the decrypted body;
  /// [p] null = «Ожидание сообщения» (WhatsApp's «Waiting for this message»).
  /// The ciphertext stays on it, so the phone's copy keeps the message as
  /// it came ([storable]) and never a payload-less text.
  api.MessageDto withPayload(api.MessageDto d, E2eePayload? p) {
    final j = d.toJson()
      ..['type'] = 'text'
      ..['body'] = p?.body ?? '';
    // PR 4: an encrypted file — the bubble of a photo / document / voice
    // note over the local address of its decrypted copy; the key stays on
    // the device. A photo's blurhash travels inside the encryption.
    final fileId = p == null ? null : _registerFile(d, p);
    if (p != null && fileId != null) {
      final mime = _mimes[fileId]!;
      // The local address of the decrypted bytes (null until readable).
      final local = E2eeMedia.urlOf(fileId);
      final voiceMs = (p.extra['ms'] as num?)?.toInt();
      if (voiceMs != null) {
        j
          ..['type'] = 'voice'
          ..['voice'] = {
            'url': local,
            'durationMs': voiceMs,
            'waveform': p.extra['wave'] ?? const <int>[],
            'listened': false,
          };
      } else {
        j
          ..['type'] = 'attachment'
          ..['attachment'] = {
            'fileId': fileId,
            'name': p.extra['name'] as String? ?? 'file',
            'mime': mime,
            'sizeBytes': p.extra['size'],
            'isImage': mime.startsWith('image/'),
            'url': local,
            'previewUrl': null,
            'width': p.extra['w'],
            'height': p.extra['h'],
            'blurhash': p.extra['bh'],
            'state': 'ready',
          };
      }
    }
    if (p != null && p.forwarded) j['forwarded'] = true;
    // The quote of an encrypted message: its text from this device.
    final reply = j['replyTo'];
    if (reply is Map && (reply['snippet'] as String? ?? '').isEmpty) {
      final quoted = _memory[reply['id']];
      if (quoted != null) {
        j['replyTo'] = {
          ...reply,
          'type': 'text',
          'snippet':
              [...quoted.body.runes].take(120).map(String.fromCharCode).join(),
        };
      }
    }
    if (p == null) {
      _waiting.add(d.id);
    } else {
      _waiting.remove(d.id);
    }
    return api.MessageDto.fromJson(j);
  }

  /// What the phone's copy of a chat stores for [m]: an end-to-end
  /// encrypted message as it came from the server (`mls` + ciphertext);
  /// its text is in E2eePlaintexts and is put back when it is read.
  static Map<String, dynamic> storable(api.MessageDto m) {
    final j = m.toJson();
    if (m.ciphertext != null && m.type != api.MessageDtoType.mls) {
      j
        ..['type'] = 'mls'
        ..['body'] = ''
        ..['forwarded'] = false
        ..['attachment'] = null
        ..['voice'] = null;
    }
    return j;
  }

  // ------------------------------------------------------------ files (PR 4)

  /// Whether a file for this chat must go end-to-end encrypted (decided
  /// from the cached state before any byte of the file is read).
  Future<bool> encryptsFiles(String conversationId) async {
    if (upload == null) return false;
    return (await state(conversationId)).state != api.ConversationE2eeState.off;
  }

  /// Encrypts a chat file on the device and uploads only the ciphertext,
  /// 64 KiB at a time from [body] (the phone streams from disk to a temp
  /// file, never the whole file in memory); the payload of its message
  /// (key inside). [preview] are the bytes of a photo for its blurhash.
  /// Null when the chat is not end-to-end encrypted.
  Future<({String fileId, E2eePayload payload})?> encryptFile(
    String conversationId,
    UploadBody body, {
    required String name,
    required String mime,
    int? width,
    int? height,
    int? durationMs,
    List<int>? waveform,
    String? caption,
    String? replyToId,
    Uint8List? preview,
    String? localPath,
  }) async {
    if (!await encryptsFiles(conversationId)) return null;
    final key = E2eeFile.newKey();
    final size = await body.length();
    final held = await scratch.hold(E2eeFile.encryptStream(body.open(), key));
    final String fileId;
    final String sha;
    try {
      sha = await held.body.sha256Hex();
      fileId = await upload!(held.body, api.FilePurpose.chatE2ee);
    } finally {
      await held.release();
    }
    fileKeys[fileId] = key;
    _mimes[fileId] = mime;
    _shas[fileId] = sha;
    // The sender's own copy: its own file (phone) or the preview bytes.
    if (localPath != null) {
      scratch.adopt(fileId, E2eePlainFile(length: size, path: localPath));
    } else if (preview != null && preview.length == size) {
      scratch.adopt(fileId, E2eePlainFile(length: size, bytes: preview));
    }
    final bh = mime.startsWith('image/') && preview != null
        ? await blurhashOf(preview)
        : null;
    return (
      fileId: fileId,
      payload: E2eePayload(
        kind: 'file',
        body: caption ?? '',
        replyToId: replyToId,
        extra: {
          'fid': fileId,
          'fk': base64Encode(key),
          'name': name,
          'mime': mime,
          'size': size,
          'sha': sha,
          if (width != null) 'w': width,
          if (height != null) 'h': height,
          if (durationMs != null) 'ms': durationMs,
          if (waveform != null) 'wave': waveform,
          if (bh != null) 'bh': bh,
        },
      ),
    );
  }

  /// A photo's BlurHash (4×3 components, from a 32-pixel-wide copy), made
  /// off the UI thread; null when the bytes are not a picture.
  static Future<String?> blurhashOf(Uint8List bytes) async {
    try {
      return await compute(_blurhash, bytes);
    } on Object {
      return null;
    }
  }

  static String? _blurhash(Uint8List bytes) {
    final decoded = img.decodeImage(bytes);
    if (decoded == null) return null;
    final small = img.copyResize(decoded, width: 32);
    return BlurHash.encode(small).hash;
  }

  /// Remembers the key, link, type and hash of an encrypted file message;
  /// its file id (null: not a file).
  String? _registerFile(api.MessageDto d, E2eePayload p) {
    final fk = p.extra['fk'];
    if (p.kind != 'file' || fk is! String) return null;
    final fileId = p.extra['fid'] as String? ?? d.id;
    fileKeys[fileId] = base64Decode(fk);
    if (d.blobUrl != null) _blobUrls[fileId] = d.blobUrl!;
    _mimes[fileId] = p.extra['mime'] as String? ?? 'application/octet-stream';
    final sha = p.extra['sha'];
    if (sha is String) _shas[fileId] = sha;
    return fileId;
  }

  /// What E2eeMedia reads: the decrypted copy of [fileId] and its type.
  Future<E2eeMediaBytes?> mediaOf(String fileId) async {
    final file = await fileCopy(fileId);
    if (file == null) return null;
    return (
      file: file,
      mime: _mimes[fileId] ?? 'application/octet-stream',
    );
  }

  /// The decrypted copy of an encrypted chat file: downloaded and checked
  /// against the SHA-256 of its ciphertext from the message (a changed or
  /// swapped file opens nothing, as WhatsApp's media hash), then decrypted
  /// 64 KiB at a time into the scratch (disk on the phone). Kept within
  /// the scratch's budget; one download at a time per file.
  Future<E2eePlainFile?> fileCopy(String fileId) {
    final kept = scratch.kept(fileId);
    if (kept != null) return Future.value(kept);
    // (A block, not an arrow: whenComplete waits for a returned future,
    // and the removed entry IS this future.)
    return _fetching[fileId] ??= _fetch(fileId).whenComplete(() {
      _fetching.remove(fileId);
    });
  }

  final Map<String, Future<E2eePlainFile?>> _fetching = {};

  Future<E2eePlainFile?> _fetch(String fileId) async {
    final key = fileKeys[fileId];
    final url = _blobUrls[fileId];
    final get = download;
    if (key == null || url == null || get == null) return null;
    final want = _shas[fileId];
    Digest? hashed;
    final digest = sha256.startChunkedConversion(
      ChunkedConversionSink<Digest>.withCallback((d) => hashed = d.single),
    );
    final checked = get(url).map((chunk) {
      digest.add(chunk);
      return chunk;
    });
    final plain = await scratch.keep(
      fileId,
      E2eeFile.decryptStream(checked, key),
    );
    digest.close();
    if (want != null && hashed.toString() != want) {
      // Not the ciphertext the message names: the copy goes.
      await scratch.drop(fileId);
      throw const FormatException('the file is not the one sent');
    }
    return plain;
  }

  /// PR 4: keys of the encrypted files this device opened (fileId → key).
  static final Map<String, Uint8List> fileKeys = {};
  static final Map<String, String> _blobUrls = {};
  static final Map<String, String> _mimes = {};
  static final Map<String, String> _shas = {};

  /// Sign-out: the keys and links of files go, and the decrypted copies.
  Future<void> _forgetFiles() async {
    fileKeys.clear();
    _blobUrls.clear();
    _mimes.clear();
    _shas.clear();
    _fetching.clear();
    E2eeMedia.clear();
    await scratch.clear();
  }

  /// The key of an outgoing file waits here (never in the plain upload
  /// queue) until its message is sealed.
  Future<void> keepOutgoingKey(
    String jobId,
    String conversationId,
    String fk,
  ) =>
      plaintexts.put('f:$jobId', conversationId, fk);

  Future<String?> outgoingKey(String jobId) => plaintexts.get('f:$jobId');

  Future<void> dropOutgoingKey(String jobId) => plaintexts.remove('f:$jobId');

  // ------------------------------------------------------- report (PR 4)

  /// WhatsApp «Пожаловаться»: this phone hands over the reported person's
  /// last messages it decrypted ([messageIds], newest last; at most the
  /// server's chat.e2ee_report_messages), byte for byte, so the server can
  /// check each against its franking tag. The number checked as genuine.
  Future<int> report(
    String conversationId,
    String reportedUserId,
    String reason,
    List<String> messageIds, {
    String? note,
    int max = 5,
  }) async {
    final picked = <api.E2eeReportedMessageDto>[];
    for (final id in messageIds.reversed) {
      if (picked.length >= max) break;
      final raw = await plaintexts.get(id);
      if (raw == null) continue;
      picked.add(
        api.E2eeReportedMessageDto(
          messageId: id,
          plaintext: base64Encode(utf8.encode(raw)),
        ),
      );
    }
    final api.E2eeReportResultDto r;
    try {
      r = (await client.reportInE2eeChat(
        id: conversationId,
        body: api.E2eeReportDto(
          reportedUserId: reportedUserId,
          reason: api.E2eeReportReason.values.firstWhere(
            (v) => v.json == reason,
            orElse: () => api.E2eeReportReason.other,
          ),
          note: note,
          messages: picked.reversed.toList(),
        ),
      ))
          .data;
    } on DioException catch (e) {
      // The admin lowered chat.e2ee_report_messages: the newest that fit.
      final data = e.response?.data;
      final error = data is Map ? data['error'] : null;
      final details = error is Map ? error['details'] : null;
      final allowed = details is Map ? details['max'] : null;
      if (allowed is num && allowed.toInt() < picked.length) {
        return report(
          conversationId,
          reportedUserId,
          reason,
          messageIds,
          note: note,
          max: allowed.toInt(),
        );
      }
      rethrow;
    }
    return r.verified.toInt();
  }

  // ------------------------------------------------------- backup (PR 4)

  /// The 64-digit recovery code's key (HKDF-SHA256; the code has ~212 bits).
  static Future<Uint8List> backupKey(String code) async {
    final k = await Hkdf(hmac: cg.Hmac.sha256(), outputLength: 32).deriveKey(
      secretKey: SecretKey(utf8.encode(code.replaceAll(RegExp(r'\D'), ''))),
      nonce: utf8.encode('lawbid-e2ee-backup-v1'),
    );
    return Uint8List.fromList(await k.extractBytes());
  }

  /// Which key locks a backup, without the key: 16 bytes of
  /// HMAC-SHA256(key, "lawbid-e2ee-backup-key-id"), base64.
  static String backupKeyId(Uint8List key) => base64Encode(
        Hmac(sha256, key)
            .convert(utf8.encode('lawbid-e2ee-backup-key-id'))
            .bytes
            .sublist(0, 16),
      );

  /// A new 64-digit recovery code (WhatsApp: shown once, kept by the person).
  static String newBackupCode() {
    final r = E2eeFile.newKey();
    final digits = StringBuffer();
    var i = 0;
    while (digits.length < 64) {
      final b = r[i % r.length] ^ (i * 31 & 0xff);
      if (b < 250) digits.write(b % 10);
      i++;
      if (i % 32 == 0) r.setAll(0, E2eeFile.newKey());
    }
    return digits.toString();
  }

  Future<Uint8List?> _savedBackupKey() async {
    final k = await plaintexts.get('b:key');
    return k == null ? null : base64Decode(k);
  }

  /// Whether this device holds the backup key (WhatsApp: the next backup
  /// needs no code; a new key only when the person asks for one).
  Future<bool> hasBackupKey() async => await _savedBackupKey() != null;

  /// Encrypts every decrypted message of this device and keeps the file as
  /// the account's backup (a new one replaces the old). With [newCode] the
  /// person chose a new 64-digit key (kept on the device from now on);
  /// without it the key of the last backup / restore is used again.
  Future<int> createBackup({String? newCode}) async {
    if (upload == null) throw const E2eeNotReady('no_upload');
    final Uint8List key;
    if (newCode != null) {
      key = await backupKey(newCode);
    } else {
      key = await _savedBackupKey() ?? (throw const E2eeNotReady('no_key'));
    }
    final rows = {
      for (final e in (await plaintexts.all()).entries)
        if (!isE2eeBookkeepingRow(e.key)) e.key: e.value,
    };
    final json = jsonEncode({
      'v': 1,
      'rows': [
        for (final e in rows.entries)
          {'id': e.key, 'c': e.value.$1, 'p': e.value.$2},
      ],
    });
    final blob = await E2eeFile.encrypt(
      Uint8List.fromList(utf8.encode(json)),
      key,
    );
    final fileId =
        await upload!(UploadBody.bytes(blob), api.FilePurpose.chatBackupE2ee);
    await client.putE2eeBackup(
      body: api.E2eeBackupPutDto(fileId: fileId, keyId: backupKeyId(key)),
    );
    if (newCode != null) {
      await plaintexts.put('b:key', '', base64Encode(key));
    }
    return rows.length;
  }

  /// Restores a backup made with [code] into this device's store; the
  /// number of messages. A wrong code fails (the AES-GCM tag does not
  /// match). The key stays for the next backups (WhatsApp).
  Future<int> restoreBackup(String code) async {
    final get = download;
    if (get == null) throw const E2eeNotReady('no_download');
    final b = (await client.getE2eeBackup()).data;
    if (b.url == null) throw const E2eeNotReady('no_backup');
    final key = await backupKey(code);
    if (b.keyId != null && b.keyId != backupKeyId(key)) {
      throw const FormatException('this key does not open the backup');
    }
    final chunks = BytesBuilder(copy: false);
    await for (final c in get(b.url!)) {
      chunks.add(c);
    }
    final plain = await E2eeFile.decrypt(chunks.takeBytes(), key);
    final data = jsonDecode(utf8.decode(plain)) as Map<String, dynamic>;
    var n = 0;
    for (final r in data['rows'] as List) {
      final m = r as Map<String, dynamic>;
      await plaintexts.put(
        m['id'] as String,
        m['c'] as String,
        m['p'] as String,
      );
      n++;
    }
    await plaintexts.put('b:key', '', base64Encode(key));
    _memory.clear();
    return n;
  }

  // ------------------------------------------- «Код безопасности изменился»

  /// WhatsApp / Signal: when the keys of another member change (a new or
  /// a removed device, a reinstall) the chat shows «The security code in
  /// this chat changed». Compared with what this device saw before; the
  /// first look only remembers.
  Future<void> _checkKeys(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
  ) async {
    final members = await e.members(gid);
    final byUser = <String, List<String>>{};
    for (final m in members) {
      if (m.userId == ownerId) continue;
      (byUser[m.userId] ??= []).add(base64Encode(m.signatureKey));
    }
    for (final entry in byUser.entries) {
      final keys = entry.value..sort();
      final fp = sha256.convert(utf8.encode(keys.join(','))).toString();
      final id = 'k:$conversationId:${entry.key}';
      final before = await plaintexts.get(id);
      if (before == fp) continue;
      await plaintexts.put(id, conversationId, fp);
      if (before == null || _opened.isClosed) continue;
      _opened.add(
        api.MessageDto.fromJson({
          'id': 'e2ee-code-$conversationId-${entry.key}-'
              '${DateTime.now().microsecondsSinceEpoch}',
          'conversationId': conversationId,
          'senderId': entry.key,
          'type': 'system',
          'body': codeChangedLine,
          'contactMasked': false,
          'createdAt': DateTime.now().toUtc().toIso8601String(),
          'revoked': false,
          'forwarded': false,
          'reactions': <Object>[],
          'pinned': false,
        }),
      );
    }
  }

  /// The system line's key (chat.system.e2eeCodeChanged).
  static const codeChangedLine = 'e2eeCodeChanged';

  /// The chat's 60-digit security code with [otherUserId]: from the keys
  /// the MLS group really encrypts to (null while the chat is not
  /// end-to-end encrypted on this device).
  Future<String?> securityCode(String conversationId, String otherUserId) =>
      _serial(conversationId, () async {
        final s = await state(conversationId, fresh: true);
        if (s.groupId == null) return null;
        final e = await engine();
        final gid = base64Decode(s.groupId!);
        if (!await e.hasGroup(gid)) return null;
        final members = await e.members(gid);
        List<Uint8List> keysOf(String u) => [
              for (final m in members)
                if (m.userId == u) m.signatureKey,
            ];
        final theirs = keysOf(otherUserId);
        if (theirs.isEmpty) return null;
        return SafetyNumber.of(
          meId: ownerId,
          myKeys: keysOf(ownerId),
          otherId: otherUserId,
          otherKeys: theirs,
        );
      });

  /// Messages this device could not open (shown as «waiting»).
  static final Set<String> _waiting = {};
  static bool isWaiting(String messageId) => _waiting.contains(messageId);
}
