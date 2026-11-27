import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart' show debugPrint;
import 'package:lawbid/features/chat/e2ee/e2ee_file.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_api.dart';

/// What a sealed group send carries next to its open metadata
/// (`POST /groups/:id/messages` with `type = mls`).
class GroupSealed {
  const GroupSealed({
    required this.ciphertext,
    required this.epoch,
    required this.deviceId,
    required this.frankingTag,
  });

  final String ciphertext;
  final int epoch;
  final String deviceId;
  final String frankingTag;

  Map<String, Object?> toJson() => {
        'type': 'mls',
        'ciphertext': ciphertext,
        'epoch': epoch,
        'mlsDeviceId': deviceId,
        'frankingTag': frankingTag,
      };
}

/// A control message of an encrypted group (design §4.5): not a row of
/// the thread, it changes one. The server knows only which message it
/// touches ([GroupE2eeService.controlOf]); what it says is inside MLS.
abstract final class GroupControl {
  static const edit = 'edit';
  static const react = 'react';
  static const vote = 'vote';
  static const close = 'close';
  static const all = {edit, react, vote, close};
}

/// This device's commit or external join of a group that the server has
/// not decided on yet (`p:g:<groupId>`), so a lost answer or a restart is
/// settled on the next sync (RFC 9420 §12.4).
class _Pending {
  const _Pending({
    required this.epoch,
    required this.commit,
    required this.groupInfo,
    this.external = false,
    this.resync = false,
    this.added = const [],
    this.removed = const [],
    this.welcome,
  });

  factory _Pending.fromJson(Map<String, dynamic> j) => _Pending(
        epoch: (j['e'] as num).toInt(),
        commit: j['c'] as String,
        groupInfo: j['gi'] as String,
        external: j['x'] == true,
        resync: j['rs'] == true,
        welcome: j['w'] as String?,
        added: [for (final d in (j['a'] as List?) ?? const []) d as String],
        removed: [for (final d in (j['r'] as List?) ?? const []) d as String],
      );

  final int epoch;
  final String commit;
  final String groupInfo;
  final bool external;
  final bool resync;
  final String? welcome;
  final List<String> added;
  final List<String> removed;

  Map<String, Object?> toJson() => {
        'e': epoch,
        'c': commit,
        'gi': groupInfo,
        'x': external,
        'rs': resync,
        'w': welcome,
        'a': added,
        'r': removed,
      };
}

/// G2 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md): the device side
/// of end-to-end encrypted group chats (`chat_groups`), on the same MLS
/// client as the chats ([E2eeService.engine], one leaf per device) — the
/// rules of Wire for big MLS groups (§4.2):
///
/// - the first device creates the MLS group and adds everyone (one commit,
///   one Welcome); whoever adds people adds their devices the same way;
/// - a person who came in by link / request / invite, a new device of a
///   member, a restored backup: the device joins itself by external commit
///   from the GroupInfo the server keeps (§4.3), nobody has to be online;
/// - a device that cannot follow the server's commits rejoins the same way,
///   its old leaf removed in that commit (resync, RFC 9420 §12.4.3.2);
/// - removals and the planned key update (`groups.e2ee_update_days`) are
///   committed under the server's short lease (§4.4), so 5000 devices never
///   race for one epoch;
/// - text, polls, votes, reactions and edits travel inside MLS (§4.5); the
///   server keeps only routing metadata.
///
/// One group is worked on by one task at a time ([_serial]).
class GroupE2eeService {
  GroupE2eeService({
    required this.api,
    required this.chat,
    required this.ownerId,
    required this.plaintexts,
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now {
    chat.isGroup = (id) => _states.containsKey(id) || _known.contains(id);
  }

  final GroupE2eeApi api;
  final E2eeService chat;
  final String ownerId;
  final E2eePlaintextStore plaintexts;
  final DateTime Function() _now;

  final Map<String, Future<void>> _queues = {};
  final Map<String, GroupE2eeState> _states = {};
  final Set<String> _known = {};

  /// Decrypted payloads by message id (`c:<clientMessageId>` for mine).
  final Map<String, E2eePayload> _memory = {};

  /// Messages not opened yet, by group: raw JSON rows, tried again after a
  /// sync.
  final Map<String, Map<String, Map<String, dynamic>>> _undecrypted = {};

  final _changed = StreamController<String>.broadcast();

  /// A group whose messages changed on this device (a waiting message was
  /// opened, a reaction / vote / edit applied): its thread reads again.
  Stream<String> get changed => _changed.stream;

  /// The server's system line where the group became encrypted (design
  /// §5): drawn as the chats' yellow notice.
  static const onKind = 'e2ee_on';

  /// This device's line «Код безопасности {имя} изменился».
  static const codeChangedKind = 'e2ee_code';

  static Uint8List mlsGroupIdOf(String groupId) =>
      Uint8List.fromList(utf8.encode('lawbid:g:$groupId'));

  static String _pendingKey(String groupId) => 'p:g:$groupId';
  static String _updateKey(String groupId) => 'u:g:$groupId';
  static String _reactKey(String messageId) => 'x:$messageId';
  static String _voteKey(String pollId) => 'v:$pollId';
  static String _editKey(String messageId) => 'e:$messageId';
  static String _closeKey(String pollId) => 'z:$pollId';

  Future<T> _serial<T>(String groupId, Future<T> Function() job) {
    final previous = _queues[groupId] ?? Future<void>.value();
    final result = previous.then((_) => job());
    _queues[groupId] = result.then((_) {}, onError: (_) {});
    return result;
  }

  // -------------------------------------------------------------- state

  Future<GroupE2eeState> state(String groupId, {bool fresh = false}) async {
    final known = _states[groupId];
    if (known != null && !fresh) return known;
    final s = await api.state(groupId);
    _states[groupId] = s;
    _known.add(groupId);
    return s;
  }

  void invalidate(String groupId) => _states.remove(groupId);

  /// Whether a send now goes sealed (pending = this send starts it).
  Future<bool> seals(String groupId) async =>
      (await state(groupId)).state != GroupE2eeMode.off;

  /// `e2ee:commit` of the group, a Welcome, a member added or removed.
  void onServerEvent(String groupId) {
    invalidate(groupId);
    unawaited(
      sync(groupId).then(
        (_) {},
        onError: (Object e) => debugPrint('group e2ee sync $groupId: $e'),
      ),
    );
  }

  /// Brings this device's copy of the group up to the server's: creates
  /// it (pending), joins it (Welcome, else external commit), settles its
  /// own pending commit, applies the others', removes the devices that
  /// left, updates its own key when due. True when this device can write.
  Future<bool> sync(String groupId) => _serial(groupId, () => _sync(groupId));

  Future<bool> _sync(String groupId, {int attempt = 0}) async {
    final e = await chat.engine();
    var s = await state(groupId, fresh: true);
    if (s.state == GroupE2eeMode.off && s.groupId == null) return false;
    final gid = mlsGroupIdOf(groupId);
    try {
      if (await _settle(e, groupId, gid)) {
        s = await state(groupId, fresh: true);
      }
      if (s.state == GroupE2eeMode.pending) {
        if (!await _lease(e, groupId)) return false;
        if (!await e.hasGroup(gid)) await e.createGroup(gid);
        try {
          s = await api.createGroup(
            groupId,
            deviceId: e.deviceId!,
            mlsGroupId: base64Encode(gid),
          );
          _states[groupId] = s;
        } on DioException catch (x) {
          // Another device made it first: join that one.
          await e.deleteGroup(gid);
          if (attempt > 2 || !_isConflict(x)) rethrow;
          return await _sync(groupId, attempt: attempt + 1);
        }
        // The creator adds every other device in one commit (§4.2).
        await _add(e, groupId, gid, s, [
          for (final d in s.devices)
            if (d.deviceId != e.deviceId && !d.inGroup) d.deviceId,
        ]);
        s = await state(groupId, fresh: true);
      }
      if (!await e.hasGroup(gid)) {
        await chat.takeWelcomes();
      }
      if (!await e.hasGroup(gid)) {
        return await _joinExternal(e, groupId, gid, s);
      }
      try {
        await _catchUp(e, groupId, gid, upTo: s.epoch);
      } on _Lost {
        return await _joinExternal(e, groupId, gid, s, resync: true);
      }
      // My other devices that are not in yet (a browser that cannot join
      // from a phone's GroupInfo, a device whose join failed): this one
      // adds them by Welcome, as WhatsApp's primary phone links a device.
      final mineMissing = [
        for (final d in s.devices)
          if (d.userId == ownerId &&
              d.deviceId != e.deviceId &&
              !d.inGroup &&
              !s.removeDevices.contains(d.deviceId))
            d.deviceId,
      ];
      if (mineMissing.isNotEmpty && await _lease(e, groupId)) {
        await _add(e, groupId, gid, s, mineMissing);
        s = await state(groupId, fresh: true);
      }
      if (s.removeDevices.isNotEmpty) {
        // Nobody writes until they are out (assertMlsSend).
        if (!await _lease(e, groupId)) return false;
        await _commit(e, groupId, gid, removed: s.removeDevices);
        s = await state(groupId, fresh: true);
      } else if (await _updateDue(groupId, s)) {
        // §4.2: the planned key update (post-compromise security).
        if (await _lease(e, groupId)) {
          await _commit(e, groupId, gid);
          await plaintexts.put(
            _updateKey(groupId),
            groupId,
            _now().toUtc().toIso8601String(),
          );
        }
      }
    } on DioException catch (x) {
      if (attempt > 2 || !_isConflict(x)) rethrow;
      return await _sync(groupId, attempt: attempt + 1);
    }
    await _openWaiting(e, groupId, gid);
    await _checkKeys(e, groupId, gid);
    return true;
  }

  /// The right to commit; false while another device holds it.
  Future<bool> _lease(MlsEngine e, String groupId) async {
    try {
      return await api.lease(groupId, e.deviceId!);
    } on DioException catch (x) {
      if (_refused(x)) return false;
      rethrow;
    }
  }

  /// Whether this device's planned key update is due: it wrote in the
  /// group (a message of mine is kept) and the last one is older than
  /// `groups.e2ee_update_days` (0 = never).
  Future<bool> _updateDue(String groupId, GroupE2eeState s) async {
    if (s.updateDays <= 0) return false;
    if (!_wrote.contains(groupId)) return false;
    final last = await plaintexts.get(_updateKey(groupId));
    final at = last == null ? null : DateTime.tryParse(last);
    if (at == null) {
      // The first look only starts the clock.
      await plaintexts.put(
        _updateKey(groupId),
        groupId,
        _now().toUtc().toIso8601String(),
      );
      return false;
    }
    return _now().difference(at) >= Duration(days: s.updateDays);
  }

  /// Groups this device wrote in since it started.
  final Set<String> _wrote = {};

  /// Adds people's devices: the creator at the start, the one who added
  /// them later ([addPeople]). One commit, one Welcome for all (§4.2).
  Future<void> _add(
    MlsEngine e,
    String groupId,
    Uint8List gid,
    GroupE2eeState s,
    List<String> deviceIds,
  ) async {
    if (deviceIds.isEmpty) return;
    final claimed = await api.claim(groupId, deviceIds);
    final kps = <Uint8List>[];
    final ids = <String>[];
    for (final c in claimed) {
      // No KeyPackage left: that device joins by external commit itself.
      if (c.keyPackage == null) continue;
      kps.add(base64Decode(c.keyPackage!));
      ids.add(c.deviceId);
    }
    if (kps.isEmpty && s.removeDevices.isEmpty) return;
    await _commit(
      e,
      groupId,
      gid,
      keyPackages: kps,
      added: ids,
      removed: s.removeDevices,
    );
  }

  /// G2 §4.2: I added [userIds] to the group: my device adds theirs (a
  /// Welcome reaches them even while they are offline). Never throws: a
  /// device that could not be added joins by external commit itself.
  Future<void> addPeople(String groupId, List<String> userIds) =>
      _serial(groupId, () async {
        try {
          final e = await chat.engine();
          final s = await state(groupId, fresh: true);
          if (s.state != GroupE2eeMode.on) return;
          final gid = mlsGroupIdOf(groupId);
          if (!await e.hasGroup(gid)) return;
          await _catchUp(e, groupId, gid, upTo: s.epoch);
          final devices = [
            for (final d in s.devices)
              if (userIds.contains(d.userId) && !d.inGroup) d.deviceId,
          ];
          if (devices.isEmpty || !await _lease(e, groupId)) return;
          await _add(e, groupId, gid, s, devices);
        } on Object catch (x) {
          debugPrint('group e2ee add $groupId: $x');
        } finally {
          invalidate(groupId);
        }
      });

  /// Joins by external commit from the server's GroupInfo; with [resync]
  /// the stored copy is replaced and the old leaf removed.
  Future<bool> _joinExternal(
    MlsEngine e,
    String groupId,
    Uint8List gid,
    GroupE2eeState s, {
    bool resync = false,
    int attempt = 0,
  }) async {
    final info = await api.groupInfo(groupId);
    if (info == null) return false;
    final mine =
        s.devices.where((d) => d.deviceId == e.deviceId).any((d) => d.inGroup);
    final MlsExternalJoinOut out;
    try {
      out = await e.joinExternal(
        base64Decode(info.groupInfo),
        // ts-mls finds the old leaf by the signature key; only when there
        // is one (OpenMLS looks for it itself).
        resync: resync || mine,
      );
    } on Object catch (x) {
      // This library cannot join from that GroupInfo (another one made it,
      // see MlsEngine.joinExternal): a member adds this device by Welcome.
      debugPrint('group e2ee external join $groupId: $x');
      return false;
    }
    final p = _Pending(
      epoch: out.epoch,
      commit: base64Encode(out.commit),
      groupInfo:
          out.groupInfo == null ? info.groupInfo : base64Encode(out.groupInfo!),
      external: true,
      resync: resync || mine,
    );
    await plaintexts.put(_pendingKey(groupId), groupId, jsonEncode(p.toJson()));
    try {
      await api.externalCommit(
        groupId,
        GroupExternalCommitBody(
          deviceId: e.deviceId!,
          epoch: p.epoch,
          commit: p.commit,
          groupInfo: p.groupInfo,
          resync: p.resync,
        ),
      );
    } on DioException catch (x) {
      invalidate(groupId);
      if (_codeOf(x) == E2eeErrors.epochConflict) {
        final row = await _serverCommit(groupId, p.epoch);
        if (row != null && row.commit == p.commit) {
          await _merge(e, gid);
          await _dropPending(groupId);
          return true;
        }
        await e.deleteGroup(gid);
        await _dropPending(groupId);
        if (attempt > 2) rethrow;
        // A newer GroupInfo came with the commit that won.
        return _joinExternal(
          e,
          groupId,
          gid,
          s,
          attempt: attempt + 1,
        );
      }
      if (_refused(x)) {
        // 403: not a member (any more) — nothing of the group stays here.
        await e.deleteGroup(gid);
        await _dropPending(groupId);
        return false;
      }
      rethrow;
    }
    await _merge(e, gid);
    await _dropPending(groupId);
    invalidate(groupId);
    return true;
  }

  /// Merges my accepted commit / join (an external join the library
  /// already stored merged has nothing left to merge).
  Future<void> _merge(MlsEngine e, Uint8List gid) async {
    try {
      await e.mergeCommit(gid);
    } on Object catch (x) {
      debugPrint('group e2ee merge: $x');
    }
  }

  Future<_Pending?> _pendingOf(String groupId) async {
    final j = await plaintexts.get(_pendingKey(groupId));
    if (j == null) return null;
    return _Pending.fromJson(jsonDecode(j) as Map<String, dynamic>);
  }

  Future<void> _dropPending(String groupId) =>
      plaintexts.remove(_pendingKey(groupId));

  Future<void> _commit(
    MlsEngine e,
    String groupId,
    Uint8List gid, {
    List<Uint8List> keyPackages = const [],
    List<String> added = const [],
    List<String> removed = const [],
  }) async {
    Future<MlsCommitOut> make() => e.commit(
          gid,
          keyPackages: keyPackages,
          removeDeviceIds: removed,
          groupInfo: true,
        );
    MlsCommitOut out;
    try {
      out = await make();
    } on Object {
      // A pending commit with no record of it never reached the server.
      if (await _pendingOf(groupId) != null) rethrow;
      await e.discardCommit(gid);
      out = await make();
    }
    final p = _Pending(
      epoch: out.epoch,
      commit: base64Encode(out.commit),
      groupInfo: base64Encode(out.groupInfo!),
      welcome: out.welcome == null ? null : base64Encode(out.welcome!),
      added: added,
      removed: removed,
    );
    await plaintexts.put(_pendingKey(groupId), groupId, jsonEncode(p.toJson()));
    await _post(e, groupId, gid, p);
  }

  Future<void> _post(
    MlsEngine e,
    String groupId,
    Uint8List gid,
    _Pending p,
  ) async {
    try {
      await api.postCommit(
        groupId,
        GroupCommitBody(
          deviceId: e.deviceId!,
          epoch: p.epoch,
          commit: p.commit,
          groupInfo: p.groupInfo,
          addedDevices: p.added,
          removedDevices: p.removed,
          welcome: p.welcome,
        ),
      );
    } on DioException catch (x) {
      invalidate(groupId);
      if (_codeOf(x) == E2eeErrors.epochConflict) {
        final row = await _serverCommit(groupId, p.epoch);
        if (row != null && row.commit == p.commit) {
          await e.mergeCommit(gid);
          await _dropPending(groupId);
          return;
        }
        await e.discardCommit(gid);
        await _dropPending(groupId);
        rethrow;
      }
      if (_refused(x)) {
        await e.discardCommit(gid);
        await _dropPending(groupId);
      }
      rethrow;
    }
    await e.mergeCommit(gid);
    await _dropPending(groupId);
    invalidate(groupId);
  }

  /// The pending commit / join is decided first. True when the group moved.
  Future<bool> _settle(MlsEngine e, String groupId, Uint8List gid) async {
    final p = await _pendingOf(groupId);
    if (p == null) return false;
    final row = await _serverCommit(groupId, p.epoch);
    if (row != null) {
      if (row.commit == p.commit) {
        await _merge(e, gid);
      } else if (p.external) {
        await e.deleteGroup(gid);
      } else {
        await e.discardCommit(gid);
      }
      await _dropPending(groupId);
      return true;
    }
    if (p.external) {
      // No answer came: the same bytes again.
      try {
        await api.externalCommit(
          groupId,
          GroupExternalCommitBody(
            deviceId: e.deviceId!,
            epoch: p.epoch,
            commit: p.commit,
            groupInfo: p.groupInfo,
            resync: p.resync,
          ),
        );
        await _merge(e, gid);
      } on DioException catch (x) {
        if (!_refused(x) && !_isConflict(x)) rethrow;
        await e.deleteGroup(gid);
      }
      await _dropPending(groupId);
      return true;
    }
    if (p.epoch != await e.epoch(gid)) {
      await e.discardCommit(gid);
      await _dropPending(groupId);
      return false;
    }
    await _post(e, groupId, gid, p);
    return true;
  }

  Future<GroupCommitRow?> _serverCommit(String groupId, int epoch) async {
    for (final r in await api.commits(groupId, epoch)) {
      if (r.epoch == epoch) return r;
    }
    return null;
  }

  /// Applies the server's commits from this device's epoch on, up to
  /// [upTo]. Throws [_Lost] when this copy cannot follow (resync).
  Future<void> _catchUp(
    MlsEngine e,
    String groupId,
    Uint8List gid, {
    int? upTo,
  }) async {
    while (true) {
      var mine = await e.epoch(gid);
      if (upTo != null && mine >= upTo) return;
      final rows = (await api.commits(groupId, mine))
        ..sort((a, b) => a.epoch.compareTo(b.epoch));
      var moved = false;
      for (final r in rows) {
        if (r.epoch != mine) continue;
        try {
          await e.applyCommit(gid, base64Decode(r.commit));
        } on Object catch (x) {
          debugPrint('group e2ee commit ${r.epoch} of $groupId: $x');
          throw const _Lost();
        }
        mine += 1;
        moved = true;
        if (upTo != null && mine >= upTo) return;
      }
      if (!moved) {
        // The server is past epochs this device can still fetch: lost.
        if (upTo != null && mine < upTo && rows.isEmpty) throw const _Lost();
        return;
      }
    }
  }

  /// Whether a send can go at once from the cached state.
  Future<bool> _canWriteNow(
    MlsEngine e,
    String groupId,
    GroupE2eeState s,
  ) async {
    if (s.state != GroupE2eeMode.on || s.groupId == null) return false;
    if (s.removeDevices.isNotEmpty) return false;
    final gid = mlsGroupIdOf(groupId);
    if (!await e.hasGroup(gid)) return false;
    if (await e.epoch(gid) != s.epoch) return false;
    return await _pendingOf(groupId) == null;
  }

  // ------------------------------------------------------------ messages

  /// The sealed part of a send of [payload], or null when the group is not
  /// end-to-end encrypted (send as before). Throws [E2eeNotReady] when it
  /// is but this device cannot write yet.
  Future<GroupSealed?> seal(
    String groupId,
    String clientMessageId,
    E2eePayload payload,
  ) =>
      _serial(groupId, () async {
        var s = await state(groupId);
        if (s.state == GroupE2eeMode.off) return null;
        final e = await chat.engine();
        if (!await _canWriteNow(e, groupId, s)) {
          if (!await _sync(groupId)) throw const E2eeNotReady('not_in_group');
          s = await state(groupId, fresh: true);
          if (!await _canWriteNow(e, groupId, s)) {
            throw const E2eeNotReady('not_in_group');
          }
        }
        final gid = mlsGroupIdOf(groupId);
        final epoch = await e.epoch(gid);
        // Messenger's franking (as the chats): a fresh key inside, the
        // HMAC of the plaintext next to the ciphertext.
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
        await plaintexts.put('c:$clientMessageId', groupId, utf8.decode(plain));
        _memory['c:$clientMessageId'] = franked;
        _wrote.add(groupId);
        return GroupSealed(
          ciphertext: base64Encode(ct),
          epoch: epoch,
          deviceId: e.deviceId!,
          frankingTag: base64Encode(tag),
        );
      });

  /// The body of `POST /groups/:id/messages` for [payload] in an encrypted
  /// group (null = not encrypted, send as before): the sealed part plus the
  /// open routing metadata (topic, reply, mentions — design §4.5 step 2).
  Future<Map<String, Object?>?> sealSend(
    String groupId,
    String clientMessageId,
    E2eePayload payload, {
    String? topicId,
    List<String>? mentionIds,
  }) async {
    final sealed = await seal(groupId, clientMessageId, payload);
    if (sealed == null) return null;
    return {
      'clientMessageId': clientMessageId,
      ...sealed.toJson(),
      if (topicId != null) 'topicId': topicId,
      if (payload.replyToId != null) 'replyToId': payload.replyToId,
      if (mentionIds != null && mentionIds.isNotEmpty) 'mentionIds': mentionIds,
    };
  }

  /// A control message (§4.5: edit, reaction, vote, closing a poll) for
  /// [targetId], sealed; applied on this device at once. Null when the
  /// group is not encrypted.
  Future<Map<String, Object?>?> sealControl(
    String groupId,
    String clientMessageId,
    String kind,
    String targetId, {
    String body = '',
    Map<String, Object?> extra = const {},
    String? topicId,
  }) async {
    final payload = E2eePayload(
      kind: kind,
      body: body,
      extra: {'to': targetId, ...extra},
    );
    final sealed = await seal(groupId, clientMessageId, payload);
    if (sealed == null) return null;
    await _apply(groupId, {'targetId': targetId, 'senderId': ownerId}, payload);
    return {
      'clientMessageId': clientMessageId,
      ...sealed.toJson(),
      ...controlOf(kind, targetId),
      if (topicId != null) 'topicId': topicId,
    };
  }

  /// [rows] shown again from what this device knows now (a reaction, vote
  /// or edit was applied): only the ones that came encrypted change.
  Future<List<Map<String, dynamic>>> refresh(
    String groupId,
    List<Map<String, dynamic>> rows,
  ) async =>
      [
        for (final r in rows)
          if (_sealedIds.contains(r['id']) && _memory[r['id']] != null)
            await _shown(groupId, r, _memory[r['id']])
          else
            r,
      ];

  /// The local poll view of [pollId] after my vote / close (the bubble
  /// shows it at once); null when it is not an encrypted poll.
  Future<Map<String, Object?>?> pollOf(String pollId) async {
    final p = _memory[pollId] ?? await _storedById(pollId);
    if (p == null || p.kind != 'poll') return null;
    return _pollOf(pollId, p, {'id': pollId, 'senderId': _authors[pollId]});
  }

  /// Who voted for what in an encrypted poll: userId → option ids.
  Future<Map<String, List<String>>> votesOf(String pollId) async => {
        for (final e in (await _jsonOf(_voteKey(pollId))).entries)
          e.key: [for (final o in e.value as List) o as String],
      };

  /// Whether the row [id] came end-to-end encrypted.
  bool isSealedRow(String id) => _sealedIds.contains(id);

  /// The text of an opened encrypted message (the chat list's line).
  String? cachedBody(String id) => _memory[id]?.body;

  /// The signed-in account's service (for the synchronous list previews).
  static GroupE2eeService? current;

  /// I left the group: its MLS state goes from this device (the others
  /// remove my devices, design §4.2); the texts stay (WhatsApp).
  Future<void> left(String groupId) => _serial(groupId, () async {
        invalidate(groupId);
        _undecrypted.remove(groupId);
        try {
          final e = await chat.engine();
          final gid = mlsGroupIdOf(groupId);
          if (await e.hasGroup(gid)) await e.deleteGroup(gid);
          await _dropPending(groupId);
        } on Object catch (x) {
          debugPrint('group e2ee leave $groupId: $x');
        }
      });

  /// The device's copy of a message deleted for everyone goes.
  Future<void> forget(String messageId) async {
    _memory.remove(messageId);
    await plaintexts.remove(messageId);
  }

  /// The open metadata of a control send (the server sets `edited_at`
  /// for an edit, skips pushes and unread counts for all of them).
  static Map<String, Object?> controlOf(String kind, String targetId) => {
        'control': kind,
        'targetId': targetId,
      };

  /// Whether [raw] (a message row as the server sends it) is end-to-end
  /// encrypted.
  static bool isSealed(Map<String, dynamic> raw) => raw['type'] == 'mls';

  /// Whether [raw] is a control message (a reaction, vote, edit, close):
  /// applied, never shown as a row.
  static bool isControl(Map<String, dynamic> raw) => raw['control'] is String;

  /// A page / catch-up / event of the group, opened: every `mls` row is
  /// decrypted once (older epoch first), control messages are applied and
  /// left out, the rest comes as the app reads it (type text / poll with
  /// the decrypted content).
  Future<List<Map<String, dynamic>>> openAll(
    String groupId,
    List<Map<String, dynamic>> rows,
  ) async {
    if (!rows.any(isSealed)) return rows;
    final order = [
      for (final r in rows)
        if (isSealed(r)) r,
    ]..sort(_oldestFirst);
    final got = <String, E2eePayload?>{
      for (final r in order) r['id'] as String: await _payloadOf(groupId, r),
    };
    var applied = false;
    for (final r in order) {
      if (isControl(r) && got[r['id']] != null) {
        await _apply(groupId, r, got[r['id']]);
        applied = true;
      }
    }
    if (applied && !_changed.isClosed) _changed.add(groupId);
    return [
      for (final r in rows)
        if (!isSealed(r))
          r
        else if (!isControl(r))
          await _shown(groupId, r, got[r['id']]),
    ];
  }

  /// One row (realtime): null when it is a control message (applied).
  Future<Map<String, dynamic>?> open(
    String groupId,
    Map<String, dynamic> raw,
  ) async {
    final out = await openAll(groupId, [raw]);
    return out.isEmpty ? null : out.single;
  }

  static int _oldestFirst(Map<String, dynamic> a, Map<String, dynamic> b) {
    final e = ((a['mlsEpoch'] ?? a['epoch'] ?? 0) as num).compareTo(
      (b['mlsEpoch'] ?? b['epoch'] ?? 0) as num,
    );
    if (e != 0) return e;
    final t = (a['createdAt'] as String).compareTo(b['createdAt'] as String);
    return t != 0 ? t : (a['id'] as String).compareTo(b['id'] as String);
  }

  static int _epochOf(Map<String, dynamic> r) =>
      ((r['mlsEpoch'] ?? r['epoch'] ?? 0) as num).toInt();

  bool _isMine(Map<String, dynamic> r) =>
      r['mine'] == true ||
      r['senderId'] == ownerId ||
      (r['sender'] is Map && (r['sender'] as Map)['userId'] == ownerId);

  Future<E2eePayload?> _stored(Map<String, dynamic> r) async {
    final id = r['id'] as String;
    var json = await plaintexts.get(id);
    final cmid = r['clientMessageId'] as String?;
    if (json == null && cmid != null && _isMine(r)) {
      json = await plaintexts.get('c:$cmid');
      if (json != null) await plaintexts.put(id, r['groupId'] as String, json);
    }
    if (json == null) return null;
    final p = E2eePayload.fromJson(jsonDecode(json) as Map<String, dynamic>);
    _memory[id] = p;
    return p;
  }

  Future<E2eePayload?> _payloadOf(
    String groupId,
    Map<String, dynamic> r,
  ) async {
    final id = r['id'] as String;
    if (r['deleted'] == true) {
      // Deleted for everyone: the phone's copy goes too.
      _memory.remove(id);
      await plaintexts.remove(id);
      return null;
    }
    final hit = _memory[id];
    if (hit != null) return hit;
    if (_dropped.contains(id)) return null;
    final stored = await _stored(r);
    if (stored != null) return stored;
    final ct = r['ciphertext'];
    if (ct is! String) return null;
    return _serial(groupId, () async {
      try {
        final e = await chat.engine();
        final gid = mlsGroupIdOf(groupId);
        if (!await e.hasGroup(gid)) await chat.takeWelcomes();
        if (!await e.hasGroup(gid)) return _wait(groupId, r);
        final epoch = _epochOf(r);
        if (await e.epoch(gid) < epoch) {
          await _catchUp(e, groupId, gid, upTo: epoch);
        }
        return await _decryptNow(e, groupId, gid, r) ?? _wait(groupId, r);
      } on Object catch (x) {
        debugPrint('group e2ee open $id: $x');
        return _wait(groupId, r);
      }
    });
  }

  E2eePayload? _wait(String groupId, Map<String, dynamic> r) {
    final id = r['id'] as String;
    if (!_dropped.contains(id)) {
      (_undecrypted[groupId] ??= {})[id] = r;
      _waiting.add(id);
    }
    return null;
  }

  final Set<String> _dropped = {};

  Future<E2eePayload?> _decryptNow(
    MlsEngine e,
    String groupId,
    Uint8List gid,
    Map<String, dynamic> r,
  ) async {
    final id = r['id'] as String;
    final plain = await e.decrypt(gid, base64Decode(r['ciphertext'] as String));
    if (plain == null) return null;
    _undecrypted[groupId]?.remove(id);
    _waiting.remove(id);
    final p = E2eePayload.decode(plain);
    if (!E2eeService.frankingMatches(plain, p, r['frankingTag'] as String?)) {
      debugPrint('group e2ee franking mismatch $id: dropped');
      _dropped.add(id);
      return null;
    }
    await plaintexts.put(id, groupId, utf8.decode(plain));
    _memory[id] = p;
    return p;
  }

  /// The waiting messages of the group, now that it caught up.
  Future<void> _openWaiting(MlsEngine e, String groupId, Uint8List gid) async {
    final waiting = _undecrypted[groupId];
    if (waiting == null || waiting.isEmpty) return;
    final mine = await e.epoch(gid);
    var any = false;
    for (final r in [...waiting.values]..sort(_oldestFirst)) {
      final epoch = _epochOf(r);
      if (epoch > mine) continue;
      try {
        final p = await _decryptNow(e, groupId, gid, r);
        if (p != null) {
          any = true;
          if (isControl(r)) await _apply(groupId, r, p);
        }
      } on Object catch (x) {
        if (mine - epoch >= E2eeService.pastEpochs) {
          waiting.remove(r['id']);
        }
        debugPrint('group e2ee open ${r['id']}: $x');
      }
    }
    if (any && !_changed.isClosed) _changed.add(groupId);
  }

  /// A control message changes its target (stored per target, so the
  /// next open — and the backup — has it).
  Future<void> _apply(
    String groupId,
    Map<String, dynamic> r,
    E2eePayload? p,
  ) async {
    if (p == null) return;
    final target = r['targetId'] as String? ?? p.extra['to'] as String?;
    final sender = r['senderId'] as String? ??
        (r['sender'] is Map ? (r['sender'] as Map)['userId'] as String? : null);
    if (target == null || sender == null) return;
    switch (p.kind) {
      case GroupControl.react:
        final key = _reactKey(target);
        final all = await _jsonOf(key);
        final emoji = p.body;
        if (emoji.isEmpty) {
          all.remove(sender);
        } else {
          all[sender] = emoji;
        }
        await plaintexts.put(key, groupId, jsonEncode(all));
      case GroupControl.vote:
        final key = _voteKey(target);
        final all = await _jsonOf(key);
        final picked = [
          for (final o in (p.extra['o'] as List?) ?? const []) o as String,
        ];
        if (picked.isEmpty) {
          all.remove(sender);
        } else {
          all[sender] = picked;
        }
        await plaintexts.put(key, groupId, jsonEncode(all));
      case GroupControl.edit:
        // Only the author edits (the server checks it too).
        final original = _memory[target] ?? await _storedById(target);
        final author = _authors[target];
        if (original == null || (author != null && author != sender)) return;
        await plaintexts.put(_editKey(target), groupId, p.body);
      case GroupControl.close:
        await plaintexts.put(_closeKey(target), groupId, sender);
    }
  }

  Future<E2eePayload?> _storedById(String id) async {
    final json = await plaintexts.get(id);
    if (json == null) return null;
    return _memory[id] = E2eePayload.fromJson(
      jsonDecode(json) as Map<String, dynamic>,
    );
  }

  /// Authors of the opened rows (an edit applies only from its author).
  final Map<String, String> _authors = {};

  Future<Map<String, dynamic>> _jsonOf(String key) async {
    final j = await plaintexts.get(key);
    return j == null ? {} : Map<String, dynamic>.from(jsonDecode(j) as Map);
  }

  /// The row as the thread reads it.
  Future<Map<String, dynamic>> _shown(
    String groupId,
    Map<String, dynamic> r,
    E2eePayload? p,
  ) async {
    final id = r['id'] as String;
    final sender = r['sender'] is Map
        ? (r['sender'] as Map)['userId'] as String?
        : r['senderId'] as String?;
    if (sender != null) _authors[id] = sender;
    _sealedIds.add(id);
    final j = Map<String, dynamic>.from(r)
      ..remove('ciphertext')
      ..['type'] = 'text'
      ..['body'] = '';
    if (r['deleted'] == true || p == null) return j;
    final edited = await plaintexts.get(_editKey(id));
    j['body'] = edited ?? p.body;
    if (p.forwarded) j['forwarded'] = true;
    if (p.kind == 'poll') {
      j
        ..['type'] = 'poll'
        ..['poll'] = await _pollOf(id, p, r);
    } else if (p.kind == 'file' && p.body.isEmpty) {
      // G3 brings the media bubble; until then the file's name.
      j['body'] = p.extra['name'] as String? ?? '';
    }
    final mine = sender == ownerId;
    final reacts = await _jsonOf(_reactKey(id));
    if (reacts.isNotEmpty) {
      final counts = <String, int>{};
      for (final emoji in reacts.values) {
        counts[emoji as String] = (counts[emoji] ?? 0) + 1;
      }
      j['reactions'] = [
        for (final c in counts.entries)
          {'emoji': c.key, 'count': c.value, 'mine': reacts[ownerId] == c.key},
      ];
    }
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
    j['mine'] = r['mine'] ?? mine;
    return j;
  }

  /// A poll of an encrypted group: question and options inside MLS, the
  /// votes counted on the phone (WhatsApp).
  Future<Map<String, Object?>> _pollOf(
    String messageId,
    E2eePayload p,
    Map<String, dynamic> r,
  ) async {
    final options = [
      for (final o in (p.extra['opts'] as List?) ?? const [])
        Map<String, dynamic>.from(o as Map),
    ];
    final votes = await _jsonOf(_voteKey(messageId));
    final closedBy = await plaintexts.get(_closeKey(messageId));
    final creator = r['sender'] is Map
        ? (r['sender'] as Map)['userId'] as String? ?? ''
        : r['senderId'] as String? ?? '';
    final mine = [
      for (final o in (votes[ownerId] as List?) ?? const []) o as String,
    ];
    final total = votes.length;
    return {
      'id': messageId,
      'question': p.body,
      'multiple': p.extra['multi'] == true,
      'anonymous': p.extra['anon'] == true,
      'closed': closedBy != null && closedBy == creator,
      'creatorId': creator,
      'totalVoters': total,
      'options': [
        for (final o in options)
          () {
            final n =
                votes.values.where((v) => (v as List).contains(o['id'])).length;
            return {
              'id': o['id'],
              'text': o['text'],
              'votes': n,
              'percent': total == 0 ? 0 : (n * 100 / total).round(),
              'voted': mine.contains(o['id']),
              'recentVoters': const <Object>[],
            };
          }(),
      ],
      'myOptionIds': mine,
    };
  }

  /// Rows read from the phone's copy (their text is not in the message
  /// cache, [storable]): put back from this device's store. A row with no
  /// text that was never encrypted stays as it is.
  Future<List<Map<String, dynamic>>> restore(
    String groupId,
    List<Map<String, dynamic>> rows,
  ) async {
    final out = <Map<String, dynamic>>[];
    for (final r in rows) {
      final id = r['id'] as String;
      final empty = (r['body'] as String? ?? '').isEmpty;
      final kind = r['type'];
      if (!empty ||
          r['deleted'] == true ||
          (kind != 'text' && kind != 'poll')) {
        out.add(r);
        continue;
      }
      final p = _memory[id] ?? await _storedById(id);
      out.add(p == null ? r : await _shown(groupId, r, p));
    }
    return out;
  }

  /// What the phone's message cache keeps of a row: an encrypted one
  /// without its text and poll (they stay in the encrypted-messages store,
  /// sealed on the web, as the chats' E2eePlaintexts).
  static Map<String, dynamic> storable(Map<String, dynamic> row) =>
      _sealedIds.contains(row['id'])
          ? {...row, 'body': '', 'poll': null, 'reactions': null}
          : row;

  /// Rows that came end-to-end encrypted (this run).
  static final Set<String> _sealedIds = {};

  // --------------------------------------------------- «код изменился»

  Future<void> _checkKeys(MlsEngine e, String groupId, Uint8List gid) async {
    final members = await e.members(gid);
    final byUser = <String, List<String>>{};
    for (final m in members) {
      if (m.userId == ownerId) continue;
      (byUser[m.userId] ??= []).add(base64Encode(m.signatureKey));
    }
    for (final entry in byUser.entries) {
      final keys = entry.value..sort();
      final fp = sha256.convert(utf8.encode(keys.join(','))).toString();
      final id = 'k:g:$groupId:${entry.key}';
      final before = await plaintexts.get(id);
      if (before == fp) continue;
      await plaintexts.put(id, groupId, fp);
      if (before == null || _codeChanged.isClosed) continue;
      _codeChanged.add((groupId: groupId, userId: entry.key));
    }
  }

  final _codeChanged =
      StreamController<({String groupId, String userId})>.broadcast();

  /// «Код безопасности {имя} изменился» (WhatsApp, as in the chats).
  Stream<({String groupId, String userId})> get codeChanged =>
      _codeChanged.stream;

  // ------------------------------------------------------------- misc

  static bool _isConflict(DioException x) => x.response?.statusCode == 409;

  static String? _codeOf(DioException x) {
    final data = x.response?.data;
    if (data is Map && data['error'] is Map) {
      final code = (data['error'] as Map)['code'];
      if (code is String) return code;
    }
    return null;
  }

  static bool _refused(DioException x) {
    final c = x.response?.statusCode;
    if (c == null) return false;
    return c >= 400 && c < 500 && c != 401 && c != 408 && c != 425 && c != 429;
  }

  /// Messages this device could not open (shown as «waiting»).
  static final Set<String> _waiting = {};
  static bool isWaiting(String messageId) => _waiting.contains(messageId);

  Future<void> close() async {
    await _changed.close();
    await _codeChanged.close();
    if (chat.isGroup != null) chat.isGroup = null;
  }
}

class _Lost implements Exception {
  const _Lost();
}
