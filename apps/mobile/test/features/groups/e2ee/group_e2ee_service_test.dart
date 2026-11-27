import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine_io.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_api.dart';
import 'package:lawbid/features/groups/e2ee/group_e2ee_service.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// G2 (docs/architecture/GROUP_E2EE_DESIGN_2026-11-26.md): the app side of
/// encrypted group chats against an in-memory Delivery Service with the
/// design's rules — one commit per epoch (409), the commit lease, the
/// newest GroupInfo kept, external commits only for members, KeyPackages
/// only for the lease holder, `removeDevices` blocking sends. Every device
/// runs the real OpenMLS client.
void main() {
  late _Ds ds;
  setUp(() => ds = _Ds(members: {'ua', 'ub', 'uc'}));

  Future<GroupE2eeService> device(
    String user, {
    DateTime Function()? now,
  }) async {
    final store = MemoryE2eePlaintextStore();
    final vault = MemoryMlsKeyVault();
    final chat = E2eeService(
      client: _Client(ds, user),
      ownerId: user,
      plaintexts: store,
      platform: api.MlsDevicePlatform.ios,
      openEngine: (u) =>
          OpenMlsEngine.open(userId: u, vault: vault, dbPath: ':memory:'),
    );
    final g = GroupE2eeService(
      api: _Api(ds, user),
      chat: chat,
      ownerId: user,
      plaintexts: store,
      now: now,
    );
    await chat.engine();
    ds.services.add(g);
    return g;
  }

  /// What the server stores and hands out for a sealed send.
  Map<String, dynamic> deliver(Map<String, Object?> body, String from) {
    expect(body['type'], 'mls');
    expect(body['mlsEpoch'], ds.epoch, reason: 'sent in the current epoch');
    expect(body.containsKey('body'), isFalse, reason: 'no plaintext');
    expect(ds.removeDevices, isEmpty, reason: 'assertMlsSend');
    final row = <String, dynamic>{
      'id': 'm${ds.messages++}',
      'groupId': 'g1',
      'type': 'mls',
      'body': '',
      'senderId': from,
      'sender': {'userId': from, 'kind': 'client', 'verifiedBadge': false},
      'mine': false,
      'clientMessageId': body['clientMessageId'],
      'mentions': const <Object>[],
      'mentionsMe': false,
      'deleted': false,
      'createdAt': DateTime.utc(
        2026,
        11,
        26,
      ).add(Duration(seconds: ds.messages)).toIso8601String(),
      'ciphertext': body['ciphertext'],
      'mlsEpoch': body['mlsEpoch'],
      'frankingTag': body['frankingTag'],
    };
    ds.rows.add(row);
    return row;
  }

  Map<String, dynamic> forMe(Map<String, dynamic> row, String me) => {
        ...row,
        'mine': row['senderId'] == me,
      };

  Future<Map<String, dynamic>> say(GroupE2eeService who, String text) async =>
      deliver(
        (await who.sealSend(
          'g1',
          'cm${ds.messages}${text.hashCode}',
          E2eePayload(kind: 'text', body: text),
        ))!,
        who.ownerId,
      );

  Future<Map<String, dynamic>?> read(
    GroupE2eeService who,
    Map<String, dynamic> r,
  ) =>
      who.open('g1', forMe(r, who.ownerId));

  test(
    'the first send creates the group and adds everyone; all read it',
    () async {
      final alice = await device('ua');
      final bob = await device('ub');
      final carol = await device('uc');
      expect((await alice.state('g1')).state, GroupE2eeMode.pending);

      final first = await say(alice, 'Привет, группа');
      expect(ds.epoch, 1, reason: 'one commit added both');
      expect(ds.groupInfoEpoch, 1, reason: 'GroupInfo of the new epoch kept');
      expect(
        utf8.decode(
          base64Decode(first['ciphertext'] as String),
          allowMalformed: true,
        ),
        isNot(contains('Привет')),
      );
      expect((await read(bob, first))!['body'], 'Привет, группа');
      expect((await read(carol, first))!['body'], 'Привет, группа');
      // The sender keeps its own text (an MLS sender cannot decrypt itself).
      expect((await read(alice, first))!['body'], 'Привет, группа');

      final back = await say(bob, 'И тебе');
      expect((await read(alice, back))!['body'], 'И тебе');
      expect((await read(carol, back))!['body'], 'И тебе');
    },
  );

  test(
      'a person in by link joins by external commit, reads from then on; '
      'a non-member is refused', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await say(alice, 'до Дейва');
    ds.members.add('ud');
    final dave = await device('ud');
    final before = ds.epoch;
    expect(await dave.sync('g1'), isTrue);
    expect(ds.epoch, before + 1, reason: 'his own external commit');
    expect(ds.externals, 1);
    final hi = await say(alice, 'Дейв, привет');
    expect((await read(dave, hi))!['body'], 'Дейв, привет');
    expect((await read(bob, hi))!['body'], 'Дейв, привет');

    final eve = await device('ue');
    expect(await eve.sync('g1'), isFalse);
    expect(ds.externals, 1, reason: 'not a member: 403');
  });

  test('the one who adds people adds their devices (Welcome)', () async {
    final alice = await device('ua');
    await device('ub');
    await say(alice, 'start');
    ds.members.add('ud');
    final dave = await device('ud');
    await alice.addPeople('g1', ['ud']);
    final daveDevice = (await dave.chat.engine()).deviceId;
    expect(ds.inGroup, contains(daveDevice));
    expect(ds.externals, 0, reason: 'added by a Welcome, no external join');
    final hi = await say(alice, 'welcome');
    expect((await read(dave, hi))!['body'], 'welcome');
  });

  test(
      'a removed member: the next writer commits the removal under the '
      'lease; the removed device reads no more', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    final carol = await device('uc');
    final all = await say(alice, 'all three');
    expect((await read(carol, all))!['body'], 'all three');
    // Another device holds the lease: nobody commits, the send waits.
    ds
      ..removeMember('uc')
      ..leaseHolder = 'someone-else';
    await expectLater(
      alice.sealSend('g1', 'x1', const E2eePayload(kind: 'text', body: 'x')),
      throwsA(isA<E2eeNotReady>()),
    );
    ds.leaseHolder = null;
    final after = await say(alice, 'без Кэрол');
    expect(ds.removeDevices, isEmpty);
    expect((await read(bob, after))!['body'], 'без Кэрол');
    expect((await read(carol, after))!['body'], '');
    expect(GroupE2eeService.isWaiting(after['id'] as String), isTrue);
  });

  test('a device that lost track rejoins (resync) with one leaf', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await say(alice, 'one');
    // The server got a commit Bob cannot apply (his copy is broken).
    final e = await bob.chat.engine();
    if (await e.hasGroup(GroupE2eeService.mlsGroupIdOf('g1'))) {
      await e.deleteGroup(GroupE2eeService.mlsGroupIdOf('g1'));
    }
    await e.createGroup(GroupE2eeService.mlsGroupIdOf('g1'));
    expect(await bob.sync('g1'), isTrue);
    expect(ds.externals, 1);
    final members = await (await alice.chat.engine()).members(
      GroupE2eeService.mlsGroupIdOf('g1'),
    );
    expect(
      members.where((m) => m.userId == 'ub').length,
      1,
      reason: 'the old leaf went in the same commit',
    );
    final hi = await say(alice, 'снова');
    expect((await read(bob, hi))!['body'], 'снова');
  });

  test('the planned key update after groups.e2ee_update_days', () async {
    var now = DateTime.utc(2026, 11, 26);
    final alice = await device('ua', now: () => now);
    final bob = await device('ub');
    await say(alice, 'hi');
    await alice.sync('g1'); // starts the clock
    final at = ds.epoch;
    now = now.add(const Duration(days: 6));
    await alice.sync('g1');
    expect(ds.epoch, at, reason: 'not due yet');
    now = now.add(const Duration(days: 2));
    await alice.sync('g1');
    expect(ds.epoch, at + 1, reason: 'one self-update commit');
    final m = await say(alice, 'new keys');
    expect((await read(bob, m))!['body'], 'new keys');
    ds.updateDays = 0;
    now = now.add(const Duration(days: 30));
    await alice.sync('g1');
    expect(ds.epoch, at + 1, reason: '0 = off');
  });

  test('reactions, edits, polls and votes travel inside MLS', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    final carol = await device('uc');
    final m = await say(alice, 'черновик');
    await read(alice, m);
    await read(bob, m);
    await read(carol, m);

    final react = deliver(
      (await bob.sealControl(
        'g1',
        'r1',
        GroupControl.react,
        m['id'] as String,
        body: '👍',
      ))!,
      'ub',
    );
    expect(react.containsKey('control'), isFalse, reason: 'kind is inside');
    expect(await read(alice, react), isNull, reason: 'not a row');
    final shown = (await alice.refresh('g1', [forMe(m, 'ua')])).single;
    expect(((shown['reactions'] as List).single as Map)['emoji'], '👍');

    final edit = deliver(
      (await alice.sealControl(
        'g1',
        'e1',
        GroupControl.edit,
        m['id'] as String,
        body: 'чистовик',
      ))!,
      'ua',
    );
    await read(bob, edit);
    expect(
      (await bob.refresh('g1', [forMe(m, 'ub')])).single['body'],
      'чистовик',
    );
    // Only the author edits.
    final fake = deliver(
      (await carol.sealControl(
        'g1',
        'e2',
        GroupControl.edit,
        m['id'] as String,
        body: 'подделка',
      ))!,
      'uc',
    );
    await read(bob, fake);
    expect(
      (await bob.refresh('g1', [forMe(m, 'ub')])).single['body'],
      'чистовик',
    );

    final poll = deliver(
      (await alice.sealSend(
        'g1',
        'p1',
        const E2eePayload(
          kind: 'poll',
          body: 'Когда?',
          extra: {
            'opts': [
              {'id': 'o0', 'text': 'Утром'},
              {'id': 'o1', 'text': 'Вечером'},
            ],
          },
        ),
      ))!,
      'ua',
    );
    await read(alice, poll);
    final seen = (await read(bob, poll))!;
    expect(seen['type'], 'poll');
    expect((seen['poll'] as Map)['question'], 'Когда?');
    for (final (who, opt) in [(bob, 'o1'), (carol, 'o1')]) {
      final v = deliver(
        (await who.sealControl(
          'g1',
          'v${who.ownerId}',
          GroupControl.vote,
          poll['id'] as String,
          extra: {
            'o': [opt],
          },
        ))!,
        who.ownerId,
      );
      await read(alice, v);
    }
    final pollId = poll['id']! as String;
    final tally = (await alice.pollOf(pollId))!;
    expect(tally['totalVoters'], 2);
    expect(((tally['options']! as List)[1] as Map)['votes'], 2);
    expect(await alice.votesOf(pollId), {
      'ub': ['o1'],
      'uc': ['o1'],
    });
  });

  test('Выкл: a group that is not encrypted sends as before', () async {
    ds.mode = 'off';
    final alice = await device('ua');
    expect(
      await alice.sealSend(
        'g1',
        'c',
        const E2eePayload(kind: 'text', body: 'x'),
      ),
      isNull,
    );
    expect(ds.epoch, 0);
    expect(ds.groupId, isNull);
  });

  test('the phone copy keeps no text; it comes back from the store', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    final m = await say(alice, 'секрет');
    final shown = (await read(bob, m))!;
    final cached = GroupE2eeService.storable(shown);
    expect(cached['body'], '');
    final back = (await bob.restore('g1', [cached])).single;
    expect(back['body'], 'секрет');
  });

  test(
    'two devices joining at once: one 409, then the next GroupInfo',
    () async {
      final alice = await device('ua');
      await say(alice, 'x');
      ds.members.addAll({'ud', 'uf'});
      final dave = await device('ud');
      final fred = await device('uf');
      final results = await Future.wait([dave.sync('g1'), fred.sync('g1')]);
      expect(results, [true, true]);
      expect(ds.externals, 2);
      final m = await say(alice, 'оба');
      expect((await read(dave, m))!['body'], 'оба');
      expect((await read(fred, m))!['body'], 'оба');
    },
  );
}

class _Ds {
  _Ds({required this.members});

  final Set<String> members;
  String mode = 'auto';
  int updateDays = 7;
  int messages = 0;
  int externals = 0;
  String? groupId;
  int epoch = 0;
  int groupInfoEpoch = -1;
  String? groupInfo;
  String? leaseHolder;
  final Map<String, String> deviceUser = {};
  final Map<String, List<String>> kps = {};
  final Map<String, String> lastResort = {};
  final Set<String> inGroup = {};
  final Set<String> removed = {};
  final Map<int, String> commits = {};
  final Map<String, List<GroupWelcome>> welcomes = {};
  final List<Map<String, dynamic>> rows = [];
  final List<GroupE2eeService> services = [];
  int _ids = 0;

  String nextId() => 'd${_ids++}';

  List<String> get removeDevices => [
        for (final d in inGroup)
          if (removed.contains(deviceUser[d])) d,
      ];

  void announce() {
    for (final s in services) {
      s.invalidate('g1');
    }
  }

  void removeMember(String user) {
    members.remove(user);
    removed.add(user);
    announce();
  }

  GroupE2eeState state() {
    final s = mode == 'off'
        ? GroupE2eeMode.off
        : groupId != null
            ? GroupE2eeMode.on
            : GroupE2eeMode.pending;
    return GroupE2eeState(
      state: s,
      groupId: groupId,
      epoch: groupId == null ? null : epoch,
      devices: [
        for (final d in deviceUser.entries)
          if (members.contains(d.value) || inGroup.contains(d.key))
            GroupE2eeDevice(
              deviceId: d.key,
              userId: d.value,
              inGroup: inGroup.contains(d.key),
            ),
      ],
      removeDevices: removeDevices,
      updateDays: updateDays,
    );
  }

  static DioException error(int status, String code) => DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: status,
          data: {
            'error': {'code': code, 'message': code},
          },
        ),
      );
}

class _Api implements GroupE2eeApi {
  _Api(this.ds, this.user);

  final _Ds ds;
  final String user;

  @override
  Future<GroupE2eeState> state(String groupId) async => ds.state();

  @override
  Future<GroupE2eeState> createGroup(
    String groupId, {
    required String deviceId,
    required String mlsGroupId,
    String? groupInfo,
  }) async {
    if (ds.groupId != null) throw _Ds.error(409, 'E2EE_EPOCH_CONFLICT');
    ds
      ..groupId = mlsGroupId
      ..epoch = 0
      ..groupInfo = groupInfo
      ..groupInfoEpoch = 0
      ..inGroup.add(deviceId);
    return ds.state();
  }

  @override
  Future<bool> lease(String groupId, String deviceId) async {
    if (ds.leaseHolder != null && ds.leaseHolder != deviceId) return false;
    return true;
  }

  @override
  Future<List<GroupClaimedKeyPackage>> claim(
    String groupId,
    String deviceId,
    List<String> deviceIds,
  ) async =>
      [
        for (final d in deviceIds)
          GroupClaimedKeyPackage(
            deviceId: d,
            userId: ds.deviceUser[d]!,
            keyPackage: (ds.kps[d]?.isNotEmpty ?? false)
                ? ds.kps[d]!.removeAt(0)
                : ds.lastResort[d],
          ),
      ];

  @override
  Future<int> postCommit(String groupId, GroupCommitBody body) async {
    if (body.epoch != ds.epoch) throw _Ds.error(409, 'E2EE_EPOCH_CONFLICT');
    for (final d in body.addedDevices) {
      if (!ds.members.contains(ds.deviceUser[d])) {
        throw _Ds.error(400, 'E2EE_MEMBERSHIP_INVALID');
      }
    }
    ds.commits[ds.epoch] = body.commit;
    ds.epoch += 1;
    ds
      ..groupInfo = body.groupInfo
      ..groupInfoEpoch = ds.epoch;
    ds.inGroup
      ..addAll(body.addedDevices)
      ..removeAll(body.removedDevices);
    for (final d in body.addedDevices) {
      (ds.welcomes[d] ??= []).add(
        GroupWelcome(groupId: groupId, epoch: ds.epoch, welcome: body.welcome!),
      );
    }
    ds.announce();
    return ds.epoch;
  }

  @override
  Future<List<GroupCommitRow>> commits(String groupId, int after) async => [
        for (final e in ds.commits.entries)
          if (e.key >= after) GroupCommitRow(epoch: e.key, commit: e.value),
      ];

  @override
  Future<GroupInfoRow?> groupInfo(String groupId) async => ds.groupInfo == null
      ? null
      : GroupInfoRow(epoch: ds.groupInfoEpoch, groupInfo: ds.groupInfo!);

  @override
  Future<int> externalCommit(
    String groupId,
    GroupExternalCommitBody body,
  ) async {
    if (!ds.members.contains(ds.deviceUser[body.deviceId])) {
      throw _Ds.error(403, 'FORBIDDEN');
    }
    if (body.epoch != ds.epoch) throw _Ds.error(409, 'E2EE_EPOCH_CONFLICT');
    ds.externals++;
    ds.commits[ds.epoch] = body.commit;
    ds.epoch += 1;
    ds
      ..groupInfo = body.groupInfo
      ..groupInfoEpoch = ds.epoch
      ..inGroup.add(body.deviceId);
    ds.announce();
    return ds.epoch;
  }

  @override
  Future<List<GroupWelcome>> welcomes(String deviceId) async =>
      [...?ds.welcomes[deviceId]];
}

class _Client implements api.E2eeClient {
  _Client(this.ds, this.user);

  final _Ds ds;
  final String user;

  @override
  Future<api.MlsDeviceEnvelope> registerMlsDevice({
    required api.RegisterMlsDeviceDto body,
    Map<String, dynamic>? extras,
  }) async {
    final id = ds.nextId();
    ds.deviceUser[id] = user;
    return api.MlsDeviceEnvelope(
      data: api.MlsDeviceDto(
        id: id,
        userId: user,
        signatureKey: body.signatureKey,
        platform: body.platform,
        identity: '$user:$id',
        createdAt: DateTime.now(),
      ),
    );
  }

  @override
  Future<api.KeyPackageCountEnvelope> uploadMlsKeyPackages({
    required String id,
    required api.UploadKeyPackagesDto body,
    Map<String, dynamic>? extras,
  }) async {
    (ds.kps[id] ??= []).addAll(body.keyPackages);
    if (body.lastResort != null) ds.lastResort[id] = body.lastResort!;
    return countMlsKeyPackages(id: id);
  }

  @override
  Future<api.KeyPackageCountEnvelope> countMlsKeyPackages({
    required String id,
    Map<String, dynamic>? extras,
  }) async =>
      api.KeyPackageCountEnvelope(
        data: api.KeyPackageCountDto(
          oneTime: ds.kps[id]?.length ?? 0,
          lastResort: ds.lastResort.containsKey(id),
          target: 4,
        ),
      );

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('${invocation.memberName}');
}
