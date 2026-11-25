import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine_io.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Item 25: the app's end-to-end encryption against an in-memory Delivery
/// Service with the server's rules (one commit per epoch, Welcomes per
/// device, one-time KeyPackages): the first device creates the group and
/// adds the others, text goes sealed and opens on the other side, the
/// sender keeps its own text, a second device of a person is added, and a
/// chat that is not encrypted sends as before.
void main() {
  late _FakeDs ds;
  setUp(() => ds = _FakeDs(members: {'ua', 'ub'}));

  Future<E2eeService> device(String user, {int n = 1}) async {
    final vault = MemoryMlsKeyVault();
    return E2eeService(
      client: ds.clientFor(user),
      ownerId: user,
      plaintexts: MemoryE2eePlaintextStore(),
      platform: api.MlsDevicePlatform.ios,
      openEngine: (u) =>
          OpenMlsEngine.open(userId: u, vault: vault, dbPath: ':memory:'),
    );
  }

  api.MessageDto delivered(api.SendMessageDto s, String from) =>
      api.MessageDto.fromJson({
        'id': 'm${ds.messages++}',
        'conversationId': 'c1',
        'senderId': from,
        'type': 'mls',
        'body': '',
        'contactMasked': false,
        'createdAt': DateTime.now().toIso8601String(),
        'revoked': false,
        'forwarded': false,
        'reactions': <Object>[],
        'pinned': false,
        'ciphertext': s.ciphertext,
        'mlsEpoch': s.mlsEpoch,
        'clientMessageId': s.clientMessageId,
      });

  test('a chat becomes encrypted; both sides and a second device read',
      () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    expect((await alice.state('c1')).state, api.ConversationE2eeState.pending);

    final sealed = await alice.seal(
      'c1',
      'cm1',
      const E2eePayload(kind: 'text', body: 'Совершенно секретно'),
    );
    expect(sealed!.type, api.SendMessageType.mls);
    expect(sealed.body, isNull);
    final onServer = delivered(sealed, 'ua');
    expect(
      utf8.decode(base64Decode(onServer.ciphertext!), allowMalformed: true),
      isNot(contains('секретно')),
    );

    final atBob = await bob.open(onServer);
    expect(atBob.type, api.MessageDtoType.text);
    expect(atBob.body, 'Совершенно секретно');
    // The sender's own copy comes from its store (MLS cannot open it).
    expect((await alice.open(onServer)).body, 'Совершенно секретно');
    // Opened once, then from the store (a second page load).
    expect((await bob.open(onServer)).body, 'Совершенно секретно');

    // Bob signs in on the web: the next send adds that device first.
    final bobWeb = await device('ub');
    await bobWeb.engine();
    final reply = await bob.seal(
      'c1',
      'cm2',
      const E2eePayload(kind: 'text', body: 'Принято'),
    );
    final r = delivered(reply!, 'ub');
    expect((await alice.open(r)).body, 'Принято');
    expect((await bobWeb.open(r)).body, 'Принято');
  });

  test('switch off / chat not encrypted: the text goes as before', () async {
    ds.mode = 'off';
    final alice = await device('ua');
    expect(
      await alice.seal('c1', 'cm1', const E2eePayload(kind: 'text', body: 'x')),
      isNull,
    );
  });

  test('a message this device cannot open shows as waiting', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final s = await alice.seal(
      'c1',
      'cm1',
      const E2eePayload(kind: 'text', body: 'hi'),
    );
    final carol = await device('ub');
    // Carol's device was never added: no Welcome, the message waits.
    ds.skipAddsFor.add('ub');
    final m = delivered(s!, 'ua');
    final opened = await carol.open(m);
    expect(opened.body, '');
    expect(E2eeService.isWaiting(m.id), isTrue);
  });
}

/// The LawBid Delivery Service's rules, in memory.
class _FakeDs {
  _FakeDs({required this.members});

  final Set<String> members;
  String mode = 'auto';
  int messages = 0;
  final Set<String> skipAddsFor = {};
  final Map<String, String> deviceUser = {};
  final Map<String, List<String>> kps = {};
  String? groupId;
  int epoch = 0;
  final Set<String> inGroup = {};
  final Map<int, String> commits = {};
  final Map<String, List<api.MlsWelcomeDto>> welcomes = {};
  int _ids = 0;

  api.E2eeClient clientFor(String user) => _FakeClient(this, user);

  api.ConversationE2eeDto stateFor() {
    final state = mode == 'off'
        ? api.ConversationE2eeState.off
        : groupId != null
            ? api.ConversationE2eeState.valueOn
            : members.every(
                (u) => deviceUser.entries.any(
                  (d) => d.value == u && (kps[d.key]?.isNotEmpty ?? false),
                ),
              )
                ? api.ConversationE2eeState.pending
                : api.ConversationE2eeState.off;
    return api.ConversationE2eeDto(
      state: state,
      groupId: groupId,
      epoch: groupId == null ? null : epoch,
      devices: [
        for (final d in deviceUser.entries)
          if (!(skipAddsFor.contains(d.value) && !inGroup.contains(d.key)) ||
              inGroup.contains(d.key))
            api.MlsGroupMemberDeviceDto(
              deviceId: d.key,
              userId: d.value,
              signatureKey: '',
              inGroup: inGroup.contains(d.key),
            ),
      ],
      removeDevices: const [],
    );
  }

  Never conflict() => throw DioException(
        requestOptions: RequestOptions(),
        response: Response(requestOptions: RequestOptions(), statusCode: 409),
      );

  String nextId() => 'd${_ids++}';
}

class _FakeClient implements api.E2eeClient {
  _FakeClient(this.ds, this.user);

  final _FakeDs ds;
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
    if (body.lastResort != null) ds.kps[id]!.add(body.lastResort!);
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
          lastResort: true,
          target: 4,
        ),
      );

  @override
  Future<api.ConversationE2eeEnvelope> getConversationE2ee({
    required String id,
    Map<String, dynamic>? extras,
  }) async =>
      api.ConversationE2eeEnvelope(data: ds.stateFor());

  @override
  Future<api.ConversationE2eeEnvelope> createMlsGroup({
    required String id,
    required api.CreateMlsGroupDto body,
    Map<String, dynamic>? extras,
  }) async {
    if (ds.groupId != null) ds.conflict();
    ds
      ..groupId = body.groupId
      ..epoch = 0
      ..inGroup.add(body.deviceId);
    return api.ConversationE2eeEnvelope(data: ds.stateFor());
  }

  @override
  Future<api.ClaimedKeyPackageListEnvelope> claimMlsKeyPackages({
    required String id,
    required api.ClaimKeyPackagesDto body,
    Map<String, dynamic>? extras,
  }) async =>
      api.ClaimedKeyPackageListEnvelope(
        data: [
          for (final d in body.deviceIds)
            api.ClaimedKeyPackageDto(
              deviceId: d,
              userId: ds.deviceUser[d]!,
              keyPackage:
                  (ds.kps[d]?.isEmpty ?? true) ? null : ds.kps[d]!.removeAt(0),
            ),
        ],
      );

  @override
  Future<api.MlsEpochEnvelope> postMlsCommit({
    required String id,
    required api.MlsCommitDto body,
    Map<String, dynamic>? extras,
  }) async {
    if (body.epoch.toInt() != ds.epoch) ds.conflict();
    ds.commits[ds.epoch] = body.commit;
    ds.epoch += 1;
    ds.inGroup
      ..addAll(body.addedDevices)
      ..removeAll(body.removedDevices);
    for (final d in body.addedDevices) {
      (ds.welcomes[d] ??= []).add(
        api.MlsWelcomeDto(
          id: 'w${ds.nextId()}',
          conversationId: id,
          epoch: ds.epoch,
          welcome: body.welcome!,
        ),
      );
    }
    return api.MlsEpochEnvelope(data: api.MlsEpochDto(epoch: ds.epoch));
  }

  @override
  Future<api.MlsCommitRowListEnvelope> listMlsCommits({
    required String id,
    num? after,
    Map<String, dynamic>? extras,
  }) async =>
      api.MlsCommitRowListEnvelope(
        data: [
          for (final e in ds.commits.entries)
            if (e.key >= (after ?? 0))
              api.MlsCommitRowDto(
                epoch: e.key,
                senderDeviceId: '',
                commit: e.value,
                addedDevices: const [],
                removedDevices: const [],
                createdAt: DateTime.now(),
              ),
        ],
      );

  @override
  Future<api.MlsWelcomeListEnvelope> listMlsWelcomes({
    required String deviceId,
    Map<String, dynamic>? extras,
  }) async =>
      api.MlsWelcomeListEnvelope(data: [...?ds.welcomes[deviceId]]);

  @override
  Future<void> ackMlsWelcome({
    required String id,
    Map<String, dynamic>? extras,
  }) async {
    for (final l in ds.welcomes.values) {
      l.removeWhere((w) => w.id == id);
    }
  }

  @override
  Future<api.MlsDeviceListEnvelope> listMlsDevices({
    Map<String, dynamic>? extras,
  }) =>
      throw UnimplementedError();

  @override
  Future<void> revokeMlsDevice({
    required String id,
    Map<String, dynamic>? extras,
  }) =>
      throw UnimplementedError();
}
