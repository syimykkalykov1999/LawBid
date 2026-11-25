import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart'
    show TargetPlatform, debugPrint, defaultTargetPlatform, kIsWeb;
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid/features/chat/e2ee/safety_number.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Where the decrypted payloads are kept (the cache database's
/// `E2eePlaintexts`; a map in tests).
abstract class E2eePlaintextStore {
  Future<String?> get(String id);
  Future<void> put(String id, String conversationId, String payload);
}

class MemoryE2eePlaintextStore implements E2eePlaintextStore {
  final Map<String, String> rows = {};

  @override
  Future<String?> get(String id) async => rows[id];

  @override
  Future<void> put(String id, String conversationId, String payload) async =>
      rows[id] = payload;
}

/// The chat is end-to-end encrypted but this device cannot write yet (its
/// Welcome has not come, or the server refused): the message waits.
class E2eeNotReady implements Exception {
  const E2eeNotReady(this.reason);
  final String reason;
  @override
  String toString() => 'E2eeNotReady($reason)';
}

/// Item 25 (docs/architecture/E2EE_MLS_PLAN_2026-11-25.md): the device side
/// of end-to-end encrypted chats, the way Wire / WhatsApp clients work:
///
/// - registers this device's MLS key and keeps its KeyPackages topped up
///   (below half of `chat.e2ee_key_packages_target` it adds more);
/// - per chat: creates the MLS group when the server says `pending`, joins
///   from a Welcome, applies the commits of others in epoch order, adds the
///   members' new devices and removes the ones that left (a 409 from the
///   strongly-ordered Delivery Service = catch up and try again);
/// - encrypts outgoing text into `type=mls` sends and decrypts incoming
///   ones ONCE (forward secrecy), keeping the plaintext on the device.
///
/// One chat is worked on by one task at a time ([_serial]); the MLS state
/// never sees two operations at once.
class E2eeService {
  E2eeService({
    required this.client,
    required this.ownerId,
    required this.plaintexts,
    required Future<MlsEngine> Function(String userId) openEngine,
    api.MlsDevicePlatform? platform,
  })  : _openEngine = openEngine,
        _platform = platform ?? _platformNow();

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
    if (e.deviceId == null) {
      final d = (await client.registerMlsDevice(
        body: api.RegisterMlsDeviceDto(
          signatureKey: base64Encode(e.signaturePublicKey),
          platform: _platform,
        ),
      ))
          .data;
      await e.setDeviceId(d.id);
      // A last-resort package first (never handed out twice for nothing).
      final last = (await e.newKeyPackages(1)).single;
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
    if (target <= 0 || have * 2 >= target) return;
    final kps = await e.newKeyPackages(target - have);
    await client.uploadMlsKeyPackages(
      id: e.deviceId!,
      body: api.UploadKeyPackagesDto(
        keyPackages: [for (final k in kps) base64Encode(k)],
      ),
    );
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

  /// Whether new messages of this chat must go end-to-end encrypted.
  Future<bool> encrypted(String conversationId) async =>
      (await state(conversationId)).state == api.ConversationE2eeState.valueOn;

  /// A commit event of the chat (`e2ee:commit`) or a Welcome for me.
  void onServerEvent(String conversationId) {
    _states.remove(conversationId);
    unawaited(
      sync(conversationId).then(
        (_) {},
        onError: (Object e) => debugPrint('e2ee sync $conversationId: $e'),
      ),
    );
  }

  /// Brings this device's copy of the chat's group up to the server's:
  /// creates / joins it, applies others' commits, adds missing devices and
  /// removes the ones that left. True when this device can write.
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
    await _catchUp(e, conversationId, gid);
    try {
      final remove = s.removeDevices;
      if (remove.isNotEmpty) {
        await _commit(e, conversationId, gid, removeDeviceIds: remove);
      }
      final missing = [
        for (final d in s.devices)
          if (!d.inGroup && d.deviceId != e.deviceId) d.deviceId,
      ];
      if (missing.isNotEmpty) {
        final claimed = (await client.claimMlsKeyPackages(
          id: conversationId,
          body: api.ClaimKeyPackagesDto(deviceIds: missing),
        ))
            .data;
        final kps = <Uint8List>[];
        final ids = <String>[];
        for (final c in claimed) {
          if (c.keyPackage == null) continue;
          kps.add(base64Decode(c.keyPackage!));
          ids.add(c.deviceId);
        }
        if (kps.isNotEmpty) {
          await _commit(e, conversationId, gid, keyPackages: kps, ids: ids);
        }
      }
    } on DioException catch (x) {
      if (attempt > 2 || !_isConflict(x)) rethrow;
      return _sync(conversationId, attempt: attempt + 1);
    }
    return true;
  }

  Future<void> _commit(
    MlsEngine e,
    String conversationId,
    Uint8List gid, {
    List<Uint8List> keyPackages = const [],
    List<String> ids = const [],
    List<String> removeDeviceIds = const [],
  }) async {
    final epoch = await e.epoch(gid);
    final out = await e.commit(
      gid,
      keyPackages: keyPackages,
      removeDeviceIds: removeDeviceIds,
    );
    try {
      await client.postMlsCommit(
        id: conversationId,
        body: api.MlsCommitDto(
          deviceId: e.deviceId!,
          epoch: epoch,
          commit: base64Encode(out.commit),
          addedDevices: ids,
          removedDevices: removeDeviceIds,
          welcome: out.welcome == null ? null : base64Encode(out.welcome!),
        ),
      );
    } on Object {
      await e.discardCommit(gid);
      _states.remove(conversationId);
      rethrow;
    }
    await e.mergeCommit(gid);
    _states.remove(conversationId);
  }

  Future<void> _takeWelcomes(MlsEngine e) async {
    final ws = (await client.listMlsWelcomes(deviceId: e.deviceId!)).data;
    for (final w in ws) {
      try {
        await e.join(base64Decode(w.welcome));
      } on Object catch (x) {
        debugPrint('e2ee welcome ${w.id}: $x');
      }
      await client.ackMlsWelcome(id: w.id);
    }
    if (ws.isNotEmpty) await _topUp(e);
  }

  Future<void> _catchUp(
    MlsEngine e,
    String conversationId,
    Uint8List gid,
  ) async {
    while (true) {
      final mine = await e.epoch(gid);
      final rows = (await client.listMlsCommits(
        id: conversationId,
        after: mine,
      ))
          .data;
      final next = rows.where((r) => r.epoch.toInt() == mine).toList();
      if (next.isEmpty) return;
      await e.applyCommit(gid, base64Decode(next.first.commit));
    }
  }

  static bool _isConflict(DioException x) => x.response?.statusCode == 409;

  // ------------------------------------------------------------ messages

  /// The `type=mls` send of [payload], or null when the chat is not end-to-
  /// end encrypted (send as before). Throws [E2eeNotReady] when it is but
  /// this device cannot write yet.
  Future<api.SendMessageDto?> seal(
    String conversationId,
    String clientMessageId,
    E2eePayload payload,
  ) =>
      _serial(conversationId, () async {
        // Pending = every member can read encrypted: this send starts it.
        final now = await state(conversationId);
        if (now.state == api.ConversationE2eeState.off) return null;
        final ready = await _sync(conversationId);
        if (!ready) throw const E2eeNotReady('not_in_group');
        final e = await engine();
        final s = await state(conversationId);
        final gid = base64Decode(s.groupId!);
        final epoch = await e.epoch(gid);
        final ct = await e.encrypt(gid, payload.encode());
        final json = jsonEncode(payload.toJson());
        // My own message cannot be decrypted by me: kept now.
        await plaintexts.put('c:$clientMessageId', conversationId, json);
        _memory['c:$clientMessageId'] = payload;
        return api.SendMessageDto(
          clientMessageId: clientMessageId,
          type: api.SendMessageType.mls,
          ciphertext: base64Encode(ct),
          mlsEpoch: epoch,
          mlsDeviceId: e.deviceId,
          // Which message it answers is metadata the server already orders
          // by (the quoted text stays inside the encryption).
          replyToId: payload.replyToId,
        );
      });

  /// The message as the app shows it: an `mls` message becomes the text it
  /// carries (decrypted once, then from the device's store).
  Future<api.MessageDto> open(api.MessageDto d) async {
    if (d.type != api.MessageDtoType.mls) return d;
    final payload = await _payloadOf(d);
    return withPayload(d, payload);
  }

  Future<List<api.MessageDto>> openAll(List<api.MessageDto> ds) async {
    if (!ds.any((d) => d.type == api.MessageDtoType.mls)) return ds;
    return [for (final d in ds) await open(d)];
  }

  /// Synchronous: from memory only (null when not opened yet).
  api.MessageDto openCached(api.MessageDto d) {
    if (d.type != api.MessageDtoType.mls) return d;
    final p = _memory[d.id] ??
        (d.clientMessageId == null ? null : _memory['c:${d.clientMessageId}']);
    return withPayload(d, p);
  }

  Future<E2eePayload?> _payloadOf(api.MessageDto d) async {
    final hit = _memory[d.id];
    if (hit != null) return hit;
    var json = await plaintexts.get(d.id);
    if (json == null && d.clientMessageId != null) {
      json = await plaintexts.get('c:${d.clientMessageId}');
      if (json != null) await plaintexts.put(d.id, d.conversationId, json);
    }
    if (json != null) {
      final p = E2eePayload.fromJson(jsonDecode(json) as Map<String, dynamic>);
      _memory[d.id] = p;
      return p;
    }
    if (d.ciphertext == null || d.revoked) return null;
    return _serial(d.conversationId, () async {
      try {
        final e = await engine();
        final s = await state(d.conversationId);
        if (s.groupId == null) return null;
        final gid = base64Decode(s.groupId!);
        if (!await e.hasGroup(gid)) await _takeWelcomes(e);
        if (!await e.hasGroup(gid)) return null;
        final epoch = d.mlsEpoch?.toInt() ?? 0;
        if (await e.epoch(gid) < epoch) {
          await _catchUp(e, d.conversationId, gid);
        }
        final plain = await e.decrypt(gid, base64Decode(d.ciphertext!));
        if (plain == null) return null;
        final p = E2eePayload.decode(plain);
        await plaintexts.put(d.id, d.conversationId, jsonEncode(p.toJson()));
        _memory[d.id] = p;
        return p;
      } on Object catch (x) {
        debugPrint('e2ee open ${d.id}: $x');
        return null;
      }
    });
  }

  /// The DTO the rest of the app reads: type text with the decrypted body;
  /// [p] null = «Ожидание сообщения» (WhatsApp's «Waiting for this message»).
  api.MessageDto withPayload(api.MessageDto d, E2eePayload? p) {
    final j = d.toJson()
      ..['type'] = 'text'
      ..['ciphertext'] = null
      ..['body'] = p?.body ?? '';
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
