import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_media.dart';
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
      upload: (bytes, purpose) async {
        final id = 'f${ds.nextId()}';
        ds.storage[id] = bytes;
        ds.purposes[id] = purpose;
        return id;
      },
      download: (url) async => ds.storage[Uri.parse(url).pathSegments.last]!,
    );
  }

  api.MessageDto delivered(
    api.SendMessageDto s,
    String from, {
    String? blobUrl,
  }) =>
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
        'blobUrl': blobUrl,
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

  test(
      'franking: the tag is HMAC(k, the exact plaintext); a report hands '
      'over those bytes', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final s = await alice.seal(
      'c1',
      'cm1',
      const E2eePayload(kind: 'text', body: 'pay me off the platform'),
    );
    final m = delivered(s!, 'ua');
    expect((await bob.open(m)).body, 'pay me off the platform');
    final checked = await bob.report('c1', 'ua', 'harassment', [m.id]);
    expect(checked, 1);
    final sent = ds.reports.single;
    expect(sent.reportedUserId, 'ua');
    expect(sent.reason, api.E2eeReportReason.harassment);
    final plain = base64Decode(sent.messages.single.plaintext);
    final k = base64Decode(
      (jsonDecode(utf8.decode(plain)) as Map<String, dynamic>)['k'] as String,
    );
    // What the server checks (e2ee.service.ts): HMAC-SHA256(k, P) == tag.
    expect(
      base64Encode(Hmac(sha256, k).convert(plain).bytes),
      s.frankingTag,
    );
    // The admin's lower chat.e2ee_report_messages: the newest that fit.
    ds.reportMax = 1;
    final s2 = await alice.seal(
      'c1',
      'cm2',
      const E2eePayload(kind: 'text', body: 'or else'),
    );
    final m2 = delivered(s2!, 'ua');
    await bob.open(m2);
    expect(await bob.report('c1', 'ua', 'spam', [m.id, m2.id]), 1);
    expect(ds.reports.last.messages.single.messageId, m2.id);
  });

  test(
      'an encrypted file: only ciphertext in storage; the other side reads '
      'it through a local address', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final secret = Uint8List.fromList(
      utf8.encode('Contract draft, privileged. ' * 4000),
    );
    final f = await alice.encryptFile(
      'c1',
      secret,
      name: 'draft.txt',
      mime: 'text/plain',
      caption: 'see attached',
    );
    expect(ds.purposes[f!.fileId], api.FilePurpose.chatE2ee);
    expect(
      utf8.decode(ds.storage[f.fileId]!, allowMalformed: true),
      isNot(contains('privileged')),
    );
    final s = await alice.seal('c1', 'cm1', f.payload, fileId: f.fileId);
    expect(s!.fileId, f.fileId);
    final m = delivered(
      s,
      'ua',
      blobUrl: 'https://storage.test/blob/${f.fileId}',
    );
    E2eeMedia.resolve = (id) => E2eeService.mediaOf(
          id,
          (url) async => ds.storage[Uri.parse(url).pathSegments.last]!,
        );
    final atBob = await bob.open(m);
    expect(atBob.type, api.MessageDtoType.attachment);
    expect(atBob.body, 'see attached');
    expect(atBob.attachment!.name, 'draft.txt');
    final local = atBob.attachment!.url!;
    expect(local, startsWith('http://127.0.0.1:'));
    // The players ask for parts (Range), as AVPlayer / ExoPlayer do.
    // flutter_test answers every HttpClient with 400; this one is real.
    Future<void> fetch() async {
      final http = HttpClient();
      final req = await http.getUrl(Uri.parse(local));
      req.headers.set(HttpHeaders.rangeHeader, 'bytes=0-13');
      final res = await req.close();
      expect(res.statusCode, HttpStatus.partialContent);
      expect(
        utf8.decode(await res.expand((b) => b).toList()),
        'Contract draft',
      );
      final whole = await (await http.getUrl(Uri.parse(local))).close();
      expect((await whole.expand((b) => b).toList()).length, secret.length);
      // Another launch's address (wrong token) is refused.
      final wrong = await (await http.getUrl(
        Uri.parse(local.replaceFirst(RegExp('/[0-9a-f]{32}/'), '/x/')),
      ))
          .close();
      expect(wrong.statusCode, HttpStatus.notFound);
      http.close();
    }

    await HttpOverrides.runWithHttpOverrides(fetch, _RealHttp());
  });

  test(
      'backup: a new phone restores with the 64-digit key; a wrong key '
      'opens nothing', () async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final s = await alice.seal(
      'c1',
      'cm1',
      const E2eePayload(kind: 'text', body: 'kept for later'),
    );
    final m = delivered(s!, 'ua');
    await bob.open(m);
    final code = E2eeService.newBackupCode();
    expect(code, matches(RegExp(r'^\d{64}$')));
    expect(await bob.createBackup(code), greaterThan(0));
    expect(ds.purposes[ds.backup!], api.FilePurpose.chatBackupE2ee);
    expect(
      utf8.decode(ds.storage[ds.backup!]!, allowMalformed: true),
      isNot(contains('kept for later')),
    );

    final newPhone = await device('ub');
    await expectLater(
      newPhone.restoreBackup(E2eeService.newBackupCode()),
      throwsA(anything),
    );
    expect(await newPhone.restoreBackup(code), greaterThan(0));
    // The message is read from the restored store, no MLS needed.
    expect((await newPhone.open(m)).body, 'kept for later');
  });
}

class _RealHttp extends HttpOverrides {}

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
  final Map<String, Uint8List> storage = {};
  final Map<String, api.FilePurpose> purposes = {};
  final List<api.E2eeReportDto> reports = [];
  int reportMax = 5;
  String? backup;
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

  @override
  Future<api.E2eeReportResultEnvelope> reportInE2eeChat({
    required String id,
    required api.E2eeReportDto body,
    Map<String, dynamic>? extras,
  }) async {
    if (body.messages.length > ds.reportMax) {
      throw DioException(
        requestOptions: RequestOptions(),
        response: Response(
          requestOptions: RequestOptions(),
          statusCode: 400,
          data: {
            'error': {
              'code': 'VALIDATION_ERROR',
              'message': 'too many',
              'details': {'field': 'messages', 'max': ds.reportMax},
            },
          },
        ),
      );
    }
    ds.reports.add(body);
    return api.E2eeReportResultEnvelope(
      data: api.E2eeReportResultDto(
        reportId: 'r${ds.reports.length}',
        verified: body.messages.length,
        total: body.messages.length,
      ),
    );
  }

  api.E2eeBackupEnvelope _backup() => api.E2eeBackupEnvelope(
        data: api.E2eeBackupDto(
          fileId: ds.backup!,
          url: 'https://storage.test/blob/${ds.backup}',
          sizeBytes: ds.storage[ds.backup]!.length,
          updatedAt: DateTime.now(),
        ),
      );

  @override
  Future<api.E2eeBackupEnvelope> getE2eeBackup({
    Map<String, dynamic>? extras,
  }) async {
    if (ds.backup == null) ds.conflict();
    return _backup();
  }

  @override
  Future<api.E2eeBackupEnvelope> putE2eeBackup({
    required api.E2eeBackupPutDto body,
    Map<String, dynamic>? extras,
  }) async {
    ds.backup = body.fileId;
    return _backup();
  }

  @override
  Future<void> deleteE2eeBackup({Map<String, dynamic>? extras}) async =>
      ds.backup = null;
}
