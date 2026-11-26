import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';

import 'package:crypto/crypto.dart';
import 'package:cryptography/cryptography.dart'
    show
        Chacha20,
        KeyPairType,
        Mac,
        SecretBox,
        SecretKey,
        SimplePublicKey,
        X25519;
import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:image/image.dart' as img;
import 'package:lawbid/core/uploads/upload_body.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_file.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_media.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_payload.dart';
import 'package:lawbid/features/chat/e2ee/e2ee_scratch_mem.dart' as mem;
import 'package:lawbid/features/chat/e2ee/e2ee_service.dart';
import 'package:lawbid/features/chat/e2ee/mls_engine_io.dart';
import 'package:lawbid/features/chat/e2ee/mls_key_vault.dart';
import 'package:lawbid/features/chat/e2ee/push_preview.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

/// Item 25: the app's end-to-end encryption against an in-memory Delivery
/// Service with the server's rules (one commit per epoch, Welcomes per
/// device, one-time KeyPackages, rejoin marks): the first device creates
/// the group and adds the others, text goes sealed and opens on the other
/// side, the sender keeps its own text, a second device of a person is
/// added, a chat that is not encrypted sends as before — plus the review
/// fixes: past epochs, stored ciphertext, pending commits, reinstall,
/// last resort, failed Welcomes, no state request per send.
void main() {
  late _FakeDs ds;
  setUp(() => ds = _FakeDs(members: {'ua', 'ub'}));

  Future<E2eeService> device(
    String user, {
    MemoryMlsKeyVault? vault,
    MemoryE2eePlaintextStore? store,
    String dbPath = ':memory:',
  }) async {
    final v = vault ?? MemoryMlsKeyVault();
    final s = E2eeService(
      client: ds.clientFor(user),
      ownerId: user,
      plaintexts: store ?? MemoryE2eePlaintextStore(),
      platform: api.MlsDevicePlatform.ios,
      openEngine: (u) =>
          OpenMlsEngine.open(userId: u, vault: v, dbPath: dbPath),
      upload: (body, purpose) async {
        final id = 'f${ds.nextId()}';
        final out = BytesBuilder(copy: false);
        await for (final c in body.open()) {
          out.add(c);
        }
        ds.storage[id] = out.takeBytes();
        ds.purposes[id] = purpose;
        return id;
      },
      download: (url) =>
          Stream.value(ds.storage[Uri.parse(url).pathSegments.last]!),
      scratch: mem.create(),
    );
    // The `e2ee:commit` events of the chat reach every device.
    ds.devices.add(s);
    return s;
  }

  api.MessageDto delivered(
    api.SendMessageDto s,
    String from, {
    String? blobUrl,
    String? frankingTag,
  }) {
    final m = api.MessageDto.fromJson({
      'id': 'm${ds.messages++}',
      'conversationId': 'c1',
      'senderId': from,
      'type': 'mls',
      'body': '',
      'contactMasked': false,
      'createdAt': DateTime(2026, 11, 25)
          .add(Duration(seconds: ds.messages))
          .toIso8601String(),
      'revoked': false,
      'forwarded': false,
      'reactions': <Object>[],
      'pinned': false,
      'ciphertext': s.ciphertext,
      'mlsEpoch': s.mlsEpoch,
      'clientMessageId': s.clientMessageId,
      'blobUrl': blobUrl,
      'frankingTag': frankingTag ?? s.frankingTag,
    });
    // The Delivery Service takes a message only in the group's epoch.
    expect(s.mlsEpoch, ds.epoch, reason: 'sent in the current epoch');
    return m;
  }

  Future<api.SendMessageDto> say(E2eeService who, String text) async =>
      (await who.seal(
        'c1',
        'cm${ds.messages}_${text.hashCode}',
        E2eePayload(kind: 'text', body: text),
      ))!;

  /// Alice and Bob in one encrypted chat (epoch 1).
  Future<(E2eeService, E2eeService)> pair() async {
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final first = delivered(await say(alice, 'hello'), 'ua');
    expect((await bob.open(first)).body, 'hello');
    return (alice, bob);
  }

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

  // M12 (owner 26.11, WhatsApp): the send carries the push preview sealed
  // to each recipient phone; only that phone's key opens it.
  test('a send seals the push preview to each recipient phone', () async {
    final phone = await X25519().newKeyPair();
    final pk = (await phone.extractPublicKey()).bytes;
    ds.previewKeys = [
      api.PushPreviewKeyDto(
        userId: 'ub',
        keyId: 'kB_0123456789abc',
        publicKey: base64Encode(pk),
      ),
    ];
    final alice = await device('ua');
    final bob = await device('ub');
    await alice.engine();
    await bob.engine();
    final s = await alice.seal(
      'c1',
      'cmpp',
      const E2eePayload(kind: 'text', body: 'Встреча в 15:00'),
    );
    expect(s!.pushPreviews, hasLength(1));
    final p = s.pushPreviews!.single;
    expect(p.keyId, 'kB_0123456789abc');
    final blob = base64Decode(p.sealedValue);
    final enc = blob.sublist(0, 32);
    final dh = await (await X25519().sharedSecretKey(
      keyPair: phone,
      remotePublicKey: SimplePublicKey(enc, type: KeyPairType.x25519),
    ))
        .extractBytes();
    final ctx = Hpke.keySchedule(
      sharedSecret: Hpke.sharedSecret(dh, enc, pk),
      info: PushPreview.info('c1'),
    );
    final body = blob.sublist(32);
    final plain = await Chacha20.poly1305Aead().decrypt(
      SecretBox(
        body.sublist(0, body.length - 16),
        nonce: ctx.baseNonce,
        mac: Mac(body.sublist(body.length - 16)),
      ),
      secretKey: SecretKey(ctx.key),
    );
    expect(jsonDecode(utf8.decode(plain)), {
      'v': 1,
      'k': 'text',
      't': 'Встреча в 15:00',
    });
    // The server-side ciphertext and the push preview are separate: the
    // message still opens for Bob.
    expect((await bob.open(delivered(s, 'ua'))).body, 'Встреча в 15:00');
  });

  test('no recipient keys: nothing extra is sent', () async {
    final (alice, _) = await pair();
    final s = await say(alice, 'plain push');
    expect(s.pushPreviews, isNull);
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

  // ---- review fix 1: past epochs (RFC 9420 §15.2) ------------------------

  test(
      'messages of past epochs still open: oldest epoch first, catch-up only '
      'as far as each message needs', () async {
    final (alice, bob) = await pair();
    // Two commits happen while Bob reads nothing: Alice adds her web, then
    // Bob's tablet signs in; a message is sent in each epoch.
    final aliceWeb = await device('ua');
    await aliceWeb.engine();
    final m2 = delivered(await say(alice, 'epoch two'), 'ua');
    final bobPad = await device('ub');
    await bobPad.engine();
    final m3 = delivered(await say(alice, 'epoch three'), 'ua');
    expect(m2.mlsEpoch, lessThan(m3.mlsEpoch!));
    // Bob's page comes newest first.
    final page = await bob.openAll([m3, m2]);
    expect(page.map((d) => d.body), ['epoch three', 'epoch two']);

    // A message of the previous epoch arrives after its commit was applied.
    final late = delivered(await say(alice, 'just before'), 'ua');
    final bobLaptop = await device('ub');
    await bobLaptop.engine();
    final next = delivered(await say(alice, 'just after'), 'ua');
    expect((await bob.open(next)).body, 'just after');
    expect((await bob.open(late)).body, 'just before');
  });

  // ---- review fix 2: the phone's copy keeps the ciphertext --------------

  test(
      'an undecryptable message is stored as mls with its ciphertext, never '
      'as an empty text; after a restart it is tried again and opens',
      () async {
    final (alice, _) = await pair();
    final dir = Directory.systemTemp.createTempSync('mls_restart');
    addTearDown(() => dir.deleteSync(recursive: true));
    final db = '${dir.path}/mls_ub.db';
    final store = MemoryE2eePlaintextStore();
    final vault = MemoryMlsKeyVault();
    final carol = await device('ub', vault: vault, store: store, dbPath: db);
    await carol.engine();
    // Alice adds Carol's device (epoch 2) and writes to it.
    final m = delivered(await say(alice, 'for every device'), 'ua');
    expect(m.mlsEpoch, 2);
    // Carol is offline when it comes: it cannot open yet.
    ds.offlineWelcomesOnce = true;
    final shown = await carol.open(m);
    expect(shown.body, '');
    expect(E2eeService.isWaiting(m.id), isTrue);
    // What the phone's copy writes for it: the server's message as it came.
    final row = E2eeService.storable(shown);
    expect(row['type'], 'mls');
    expect(row['ciphertext'], m.ciphertext);
    expect(row['body'], '');

    // A restart: nothing in memory, the phone's copy read from the disk is
    // tried again in the background and opens.
    await carol.close();
    final again = await device('ub', vault: vault, store: store, dbPath: db);
    final fromDisk = api.MessageDto.fromJson(row);
    expect(again.openCached(fromDisk).body, '');
    final opened = again.opened.first;
    await again.prime([fromDisk]);
    final got = await opened.timeout(const Duration(seconds: 30));
    expect(got.id, m.id);
    expect(got.body, 'for every device');
    expect(again.openCached(fromDisk).body, 'for every device');
    // The same device (no reinstall: its database is there).
    expect(ds.revoked, isEmpty);
    // A second restart: straight from E2eePlaintexts.
    await again.close();
    final third = await device('ub', vault: vault, store: store, dbPath: db);
    await third.prime([fromDisk]);
    expect(third.openCached(fromDisk).body, 'for every device');
  });

  // ---- review fix 3: a pending commit whose answer was lost --------------

  test(
      'the server took the commit but the answer was lost: the next catch-up '
      'merges it (byte-equal), the group goes on', () async {
    final (alice, bob) = await pair();
    final bobWeb = await device('ub');
    await bobWeb.engine();
    ds.loseAnswerOnce = true;
    await expectLater(
      alice.seal('c1', 'cmx', const E2eePayload(kind: 'text', body: 'x')),
      throwsA(isA<DioException>()),
    );
    expect(ds.epoch, 2, reason: 'the server applied the add');
    // Next try: Alice's pending commit IS the server's one: merged.
    final m = delivered(await say(alice, 'after the lost answer'), 'ua');
    expect(m.mlsEpoch, 2);
    expect((await bob.open(m)).body, 'after the lost answer');
    expect((await bobWeb.open(m)).body, 'after the lost answer');
  });

  test(
      'no answer and the server never got it: the same commit goes again; '
      'a commit refused with 409 is discarded', () async {
    final (alice, bob) = await pair();
    final bobWeb = await device('ub');
    await bobWeb.engine();
    ds.failBeforeOnce = true;
    await expectLater(
      alice.seal('c1', 'cmy', const E2eePayload(kind: 'text', body: 'y')),
      throwsA(isA<DioException>()),
    );
    expect(ds.epoch, 1);
    final sent = ds.commitPosts.last;
    final m = delivered(await say(alice, 'second try'), 'ua');
    expect(ds.commitPosts.last, sent, reason: 'the same bytes again');
    expect((await bobWeb.open(m)).body, 'second try');

    // Alice's next commit gets no answer and never arrived; Bob commits for
    // the same epoch meanwhile: the server's commit is Bob's, so Alice's
    // pending one is discarded and she applies Bob's.
    final alicePad = await device('ua');
    await alicePad.engine();
    final bobPad = await device('ub');
    await bobPad.engine();
    ds.holdCommitsOf = 'ua';
    await expectLater(alice.sync('c1'), throwsA(isA<DioException>()));
    ds.holdCommitsOf = null;
    expect(await bob.sync('c1'), isTrue);
    expect(await alice.sync('c1'), isTrue);
    final last = delivered(await say(alice, 'one order'), 'ua');
    expect((await bob.open(last)).body, 'one order');
    expect((await bobPad.open(last)).body, 'one order');
    expect((await alicePad.open(last)).body, 'one order');
  });

  // ---- review fix 4: iOS reinstall ---------------------------------------

  test(
      'a reinstall (Keychain kept, MLS database gone) signs the old device '
      'out and registers a new one', () async {
    final vault = MemoryMlsKeyVault();
    final first = await device('ua', vault: vault);
    final old = (await first.engine()).deviceId!;
    // The app comes back: same Keychain, a new (empty) database.
    final reinstalled = await device('ua', vault: vault);
    final now = (await reinstalled.engine()).deviceId!;
    expect(now, isNot(old));
    expect(ds.revoked, [old]);
    expect(await vault.read('mls.ua.previous'), isNull);
  });

  // ---- review fix 6: a Welcome that cannot be used ------------------------

  test(
      'a Welcome this device cannot join from is not acknowledged; the '
      'members remove and add it again', () async {
    final (alice, _) = await pair();
    final bobWeb = await device('ub');
    final web = await bobWeb.engine();
    ds.breakWelcomesFor.add(web.deviceId!);
    await alice.sync('c1');
    expect(await bobWeb.sync('c1'), isFalse);
    expect(ds.acked, isNot(contains(web.deviceId)));
    expect(ds.rejoin, contains(web.deviceId));
    // The next member online removes the leaf and adds the device again.
    ds.breakWelcomesFor.clear();
    await alice.sync('c1');
    await alice.sync('c1');
    expect(await bobWeb.sync('c1'), isTrue);
    final m = delivered(await say(alice, 'back in'), 'ua');
    expect((await bobWeb.open(m)).body, 'back in');
  });

  // ---- review fix 7 + «no needless requests» ------------------------------

  test('a send asks the server nothing while the cached state is current',
      () async {
    final (alice, _) = await pair();
    final before = ds.stateReads;
    final commitsBefore = ds.commitReads;
    await say(alice, 'one');
    await say(alice, 'two');
    expect(ds.stateReads, before);
    expect(ds.commitReads, commitsBefore);
    // A 409 of the send (the epoch moved on): the cache is dropped and the
    // next seal catches up first.
    final bobWeb = await device('ub');
    await bobWeb.engine();
    alice.invalidate('c1');
    final m = delivered(await say(alice, 'caught up'), 'ua');
    expect(m.mlsEpoch, ds.epoch);
  });

  test('the outbox repeats a send refused for an encrypted chat’s state', () {
    bool again(String code, int status) =>
        E2eeErrors.sendIsRetryable(code, status);
    expect(again('E2EE_EPOCH_CONFLICT', 409), isTrue);
    expect(again('E2EE_REQUIRED', 409), isTrue);
    expect(again('E2EE_MEMBERSHIP_INVALID', 409), isTrue);
    expect(again('E2EE_OFF', 409), isTrue);
    // A commit that cannot change those devices is a real refusal.
    expect(again('E2EE_MEMBERSHIP_INVALID', 400), isFalse);
    expect(again('MESSAGE_TOO_LONG', 400), isFalse);
    expect(again('CONFLICT', 409), isFalse);
  });

  // ---- minor: sign-out ----------------------------------------------------

  test('sign-out wipes this device’s MLS keys and returns its id', () async {
    final vault = MemoryMlsKeyVault();
    final alice = await device('ua', vault: vault);
    final id = (await alice.engine()).deviceId;
    expect(await alice.signOutDevice(), id);
    expect(await vault.read('mls.ua.device'), isNull);
    expect(await vault.read('mls.ua.signer'), isNull);
    // The next sign-in is a new device (no reinstall revoke needed).
    final again = await device('ua', vault: vault);
    expect((await again.engine()).deviceId, isNot(id));
    expect(ds.revoked, isEmpty);
  });

  // ---- PR 4 + review fixes 9–12 -------------------------------------------

  test(
      'franking: the tag is HMAC(k, the exact plaintext); a report hands '
      'over those bytes', () async {
    final (alice, bob) = await pair();
    final s = await say(alice, 'pay me off the platform');
    final m = delivered(s, 'ua');
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
    expect(base64Encode(Hmac(sha256, k).convert(plain).bytes), s.frankingTag);
    // The admin's lower chat.e2ee_report_messages: the newest that fit.
    ds.reportMax = 1;
    final m2 = delivered(await say(alice, 'or else'), 'ua');
    await bob.open(m2);
    expect(await bob.report('c1', 'ua', 'spam', [m.id, m2.id]), 1);
    expect(ds.reports.last.messages.single.messageId, m2.id);
  });

  test(
      'franking on receipt: a message whose stored tag does not match what '
      'was encrypted (or has none) is dropped, never shown or stored',
      () async {
    final (alice, bob) = await pair();
    final forged = delivered(
      await say(alice, 'forged record'),
      'ua',
      frankingTag: base64Encode(List<int>.filled(32, 7)),
    );
    expect((await bob.open(forged)).body, '');
    expect(await bob.plaintexts.get(forged.id), isNull);
    // Not tried again either (its key is used up).
    expect((await bob.open(forged)).body, '');
    final bare = api.MessageDto.fromJson({
      ...delivered(await say(alice, 'no tag at all'), 'ua').toJson(),
      'frankingTag': null,
    });
    expect((await bob.open(bare)).body, '');
    // A genuine one still opens.
    final ok = delivered(await say(alice, 'genuine'), 'ua');
    expect((await bob.open(ok)).body, 'genuine');
  });

  test(
      'an encrypted file: only ciphertext in storage, streamed in segments; '
      'the other side checks its SHA-256 and reads it through a local '
      'address', () async {
    final (alice, bob) = await pair();
    final secret = Uint8List.fromList(
      utf8.encode('Contract draft, privileged. ' * 4000),
    );
    final f = await alice.encryptFile(
      'c1',
      UploadBody.bytes(secret),
      name: 'draft.txt',
      mime: 'text/plain',
      caption: 'see attached',
    );
    expect(ds.purposes[f!.fileId], api.FilePurpose.chatE2ee);
    expect(
      utf8.decode(ds.storage[f.fileId]!, allowMalformed: true),
      isNot(contains('privileged')),
    );
    expect(
      f.payload.extra['sha'],
      sha256.convert(ds.storage[f.fileId]!).toString(),
    );
    final s = await alice.seal('c1', 'cmf', f.payload, fileId: f.fileId);
    expect(s!.fileId, f.fileId);
    final m = delivered(
      s,
      'ua',
      blobUrl: 'https://storage.test/blob/${f.fileId}',
    );
    E2eeMedia.resolve = bob.mediaOf;
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
      'a plain chat: the file is not touched here (it streams the normal, '
      'scanned way); an encrypted one goes from a file on disk', () async {
    ds.mode = 'off';
    final plain = await device('ua');
    expect(await plain.encryptsFiles('c1'), isFalse);
    expect(
      await plain.encryptFile(
        'c1',
        UploadBody.bytes(Uint8List(3)),
        name: 'x',
        mime: 'text/plain',
      ),
      isNull,
    );
    expect(ds.storage, isEmpty);

    ds.mode = 'auto';
    final (alice, bob) = await pair();
    final dir = Directory.systemTemp.createTempSync('e2ee_file');
    addTearDown(() => dir.deleteSync(recursive: true));
    final big = File('${dir.path}/video.mp4')
      ..writeAsBytesSync(
        List<int>.generate(5 * E2eeFile.segment + 123, (i) => i * 7 & 0xff),
      );
    final f = await alice.encryptFile(
      'c1',
      UploadBody.file(big.path),
      name: 'video.mp4',
      mime: 'video/mp4',
      localPath: big.path,
    );
    expect(
      ds.storage[f!.fileId]!.length,
      E2eeFile.sealedLength(big.lengthSync()),
    );
    // The sender reads its own file, nothing downloaded.
    expect((await alice.fileCopy(f.fileId))!.path, big.path);
    final s = await alice.seal('c1', 'cmv', f.payload, fileId: f.fileId);
    final m = delivered(
      s!,
      'ua',
      blobUrl: 'https://storage.test/blob/${f.fileId}',
    );
    await bob.open(m);
    final copy = await bob.fileCopy(f.fileId);
    expect(copy!.bytes, big.readAsBytesSync());
  });

  test('a file swapped in storage does not open (SHA-256 from the message)',
      () async {
    final (alice, bob) = await pair();
    final f = await alice.encryptFile(
      'c1',
      UploadBody.bytes(Uint8List.fromList(utf8.encode('original'))),
      name: 'a.txt',
      mime: 'text/plain',
    );
    final s = await alice.seal('c1', 'cms', f!.payload, fileId: f.fileId);
    // The same key over other words, put in the file's place.
    final key = base64Decode(f.payload.extra['fk']! as String);
    ds.storage[f.fileId] = await E2eeFile.encrypt(
      Uint8List.fromList(utf8.encode('swapped!')),
      Uint8List.fromList(key),
    );
    final m = delivered(
      s!,
      'ua',
      blobUrl: 'https://storage.test/blob/${f.fileId}',
    );
    await bob.open(m);
    await expectLater(bob.fileCopy(f.fileId), throwsA(anything));
  });

  test('a photo carries its blurhash preview inside the encryption', () async {
    final (alice, bob) = await pair();
    final picture = img.Image(width: 64, height: 48);
    img.fill(picture, color: img.ColorRgb8(200, 40, 40));
    final png = Uint8List.fromList(img.encodePng(picture));
    final f = await alice.encryptFile(
      'c1',
      UploadBody.bytes(png),
      name: 'p.png',
      mime: 'image/png',
      width: 64,
      height: 48,
      preview: png,
    );
    final bh = f!.payload.extra['bh'] as String?;
    expect(bh, isNotNull);
    final s = await alice.seal('c1', 'cmp', f.payload, fileId: f.fileId);
    final m = delivered(
      s!,
      'ua',
      blobUrl: 'https://storage.test/blob/${f.fileId}',
    );
    final atBob = await bob.open(m);
    expect(atBob.attachment!.isImage, isTrue);
    expect(atBob.attachment!.blurhash, bh);
  });

  test(
      '«The security code in this chat changed» when the other member’s '
      'keys change (WhatsApp / Signal)', () async {
    final (alice, bob) = await pair();
    await alice.sync('c1'); // the first look only remembers
    final lines = <api.MessageDto>[];
    final sub = alice.opened.listen(lines.add);
    // Bob signs in on a tablet: his keys in the chat change.
    final bobPad = await device('ub');
    await bobPad.engine();
    await bob.sync('c1');
    await alice.sync('c1');
    await pumpEventQueue();
    await sub.cancel();
    final line = lines.singleWhere((d) => d.type == api.MessageDtoType.system);
    expect(line.body, E2eeService.codeChangedLine);
    expect(line.senderId, 'ub');
    // Nothing changed since: no second line.
    final again = <api.MessageDto>[];
    final sub2 = alice.opened.listen(again.add);
    await alice.sync('c1');
    await pumpEventQueue();
    await sub2.cancel();
    expect(again.where((d) => d.type == api.MessageDtoType.system), isEmpty);
  });

  test(
      'backup: the same 64-digit key for every backup until a new one is '
      'asked for; its identity is stored; a new phone restores; a wrong key '
      'opens nothing', () async {
    final (alice, bob) = await pair();
    final m = delivered(await say(alice, 'kept for later'), 'ua');
    await bob.open(m);
    expect(await bob.hasBackupKey(), isFalse);
    final code = E2eeService.newBackupCode();
    expect(code, matches(RegExp(r'^\d{64}$')));
    expect(await bob.createBackup(newCode: code), greaterThan(0));
    expect(ds.purposes[ds.backup!], api.FilePurpose.chatBackupE2ee);
    expect(
      utf8.decode(ds.storage[ds.backup!]!, allowMalformed: true),
      isNot(contains('kept for later')),
    );
    final keyId = ds.backupKeyId;
    expect(keyId, E2eeService.backupKeyId(await E2eeService.backupKey(code)));
    // WhatsApp: the next backup needs no code — the same key.
    expect(await bob.hasBackupKey(), isTrue);
    await bob.createBackup();
    expect(ds.backupKeyId, keyId);
    // This device's bookkeeping (the key itself) is not in the backup.
    final rows = jsonDecode(
      utf8.decode(
        await E2eeFile.decrypt(
          ds.storage[ds.backup!]!,
          await E2eeService.backupKey(code),
        ),
      ),
    ) as Map<String, dynamic>;
    expect(
      [for (final r in rows['rows'] as List) (r as Map)['id'] as String]
          .where(isE2eeBookkeepingRow),
      isEmpty,
    );

    final newPhone = await device('ub');
    await expectLater(
      newPhone.restoreBackup(E2eeService.newBackupCode()),
      throwsA(anything),
    );
    expect(await newPhone.restoreBackup(code), greaterThan(0));
    expect((await newPhone.open(m)).body, 'kept for later');
    // The restored key serves the new phone's backups too.
    await newPhone.createBackup();
    expect(ds.backupKeyId, keyId);
    // A new key only when asked for.
    await newPhone.createBackup(newCode: E2eeService.newBackupCode());
    expect(ds.backupKeyId, isNot(keyId));
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
  final Map<String, String> lastResort = {};
  String? groupId;
  int epoch = 0;
  final Set<String> inGroup = {};
  final Set<String> rejoin = {};
  final Map<int, String> commits = {};
  final Map<String, List<api.MlsWelcomeDto>> welcomes = {};
  final List<String> revoked = [];
  final List<String> acked = [];
  final List<String> commitPosts = [];
  final List<api.UploadKeyPackagesDto> uploads = [];
  final Set<String> breakWelcomesFor = {};
  bool loseAnswerOnce = false;
  bool failBeforeOnce = false;
  bool offlineWelcomesOnce = false;

  /// Every device of the chat (they get its `e2ee:commit` events).
  final List<E2eeService> devices = [];

  /// The server's `e2ee:commit` to the chat: the cached state is stale.
  void announce() {
    for (final d in devices) {
      d.invalidate('c1');
    }
  }

  String? holdCommitsOf;
  int stateReads = 0;
  int commitReads = 0;
  int _ids = 0;
  final Map<String, Uint8List> storage = {};
  final Map<String, api.FilePurpose> purposes = {};
  final List<api.E2eeReportDto> reports = [];
  int reportMax = 5;
  // M12: the recipient phones' push-preview keys the state lists.
  List<api.PushPreviewKeyDto> previewKeys = [];
  String? backup;
  String? backupKeyId;

  api.E2eeClient clientFor(String user) => _FakeClient(this, user);

  api.ConversationE2eeDto stateFor() {
    final live = {
      for (final d in deviceUser.entries)
        if (!revoked.contains(d.key)) d.key: d.value,
    };
    final state = mode == 'off'
        ? api.ConversationE2eeState.off
        : groupId != null
            ? api.ConversationE2eeState.valueOn
            : members.every(
                (u) => live.entries.any(
                  (d) =>
                      d.value == u &&
                      ((kps[d.key]?.isNotEmpty ?? false) ||
                          lastResort.containsKey(d.key)),
                ),
              )
                ? api.ConversationE2eeState.pending
                : api.ConversationE2eeState.off;
    return api.ConversationE2eeDto(
      state: state,
      groupId: groupId,
      epoch: groupId == null ? null : epoch,
      devices: [
        for (final d in live.entries)
          if (!(skipAddsFor.contains(d.value) && !inGroup.contains(d.key)) ||
              inGroup.contains(d.key))
            api.MlsGroupMemberDeviceDto(
              deviceId: d.key,
              userId: d.value,
              signatureKey: '',
              inGroup: inGroup.contains(d.key),
            ),
      ],
      removeDevices: [
        for (final d in inGroup)
          if (rejoin.contains(d) || revoked.contains(d)) d,
      ],
      previewKeys: previewKeys,
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

  Never conflict() => throw error(409, 'E2EE_EPOCH_CONFLICT');

  static DioException offline() => DioException(
        requestOptions: RequestOptions(),
        type: DioExceptionType.connectionError,
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
    ds.uploads.add(body);
    (ds.kps[id] ??= []).addAll(body.keyPackages);
    if (body.lastResort != null) {
      ds.lastResort[id] = body.lastResort!;
      // A new device can be added now: the person's chats are told.
      ds.announce();
    }
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
  Future<api.ConversationE2eeEnvelope> getConversationE2ee({
    required String id,
    Map<String, dynamic>? extras,
  }) async {
    ds.stateReads++;
    return api.ConversationE2eeEnvelope(data: ds.stateFor());
  }

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
              keyPackage: (ds.kps[d]?.isNotEmpty ?? false)
                  ? ds.kps[d]!.removeAt(0)
                  : ds.lastResort[d],
            ),
        ],
      );

  @override
  Future<api.MlsEpochEnvelope> postMlsCommit({
    required String id,
    required api.MlsCommitDto body,
    Map<String, dynamic>? extras,
  }) async {
    ds.commitPosts.add(body.commit);
    if (ds.failBeforeOnce) {
      ds.failBeforeOnce = false;
      throw _FakeDs.offline();
    }
    if (ds.holdCommitsOf == user) throw _FakeDs.offline();
    if (body.epoch.toInt() != ds.epoch) ds.conflict();
    ds.commits[ds.epoch] = body.commit;
    ds.epoch += 1;
    ds.inGroup
      ..addAll(body.addedDevices)
      ..removeAll(body.removedDevices);
    ds.rejoin.removeAll(body.removedDevices);
    for (final d in body.addedDevices) {
      (ds.welcomes[d] ??= []).add(
        api.MlsWelcomeDto(
          id: 'w${ds.nextId()}',
          conversationId: id,
          epoch: ds.epoch,
          welcome: ds.breakWelcomesFor.contains(d)
              ? base64Encode([0, 1, 0, 3, 9, 9, 9])
              : body.welcome!,
        ),
      );
    }
    ds.announce();
    if (ds.loseAnswerOnce) {
      ds.loseAnswerOnce = false;
      throw _FakeDs.offline();
    }
    return api.MlsEpochEnvelope(data: api.MlsEpochDto(epoch: ds.epoch));
  }

  @override
  Future<api.MlsCommitRowListEnvelope> listMlsCommits({
    required String id,
    num? after,
    Map<String, dynamic>? extras,
  }) async {
    ds.commitReads++;
    return api.MlsCommitRowListEnvelope(
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
  }

  @override
  Future<api.MlsWelcomeListEnvelope> listMlsWelcomes({
    required String deviceId,
    Map<String, dynamic>? extras,
  }) async {
    if (ds.offlineWelcomesOnce) {
      ds.offlineWelcomesOnce = false;
      throw _FakeDs.offline();
    }
    return api.MlsWelcomeListEnvelope(data: [...?ds.welcomes[deviceId]]);
  }

  @override
  Future<void> ackMlsWelcome({
    required String id,
    Map<String, dynamic>? extras,
  }) async {
    for (final e in ds.welcomes.entries) {
      if (e.value.any((w) => w.id == id)) ds.acked.add(e.key);
      e.value.removeWhere((w) => w.id == id);
    }
  }

  @override
  Future<void> requestMlsRejoin({
    required String id,
    required api.MlsRejoinDto body,
    Map<String, dynamic>? extras,
  }) async {
    if (ds.deviceUser[body.deviceId] != user) {
      throw _FakeDs.error(404, 'NOT_FOUND');
    }
    ds.welcomes[body.deviceId]?.clear();
    if (ds.inGroup.contains(body.deviceId)) {
      ds.rejoin.add(body.deviceId);
      ds.announce();
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
  }) async {
    if (ds.deviceUser[id] != user) throw _FakeDs.error(404, 'NOT_FOUND');
    ds.revoked.add(id);
    ds.kps.remove(id);
    ds.lastResort.remove(id);
    ds.announce();
  }

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
          keyId: ds.backupKeyId,
          url: 'https://storage.test/blob/${ds.backup}',
          sizeBytes: ds.storage[ds.backup]!.length,
          updatedAt: DateTime.now(),
        ),
      );

  @override
  Future<api.E2eeBackupEnvelope> getE2eeBackup({
    Map<String, dynamic>? extras,
  }) async {
    if (ds.backup == null) throw _FakeDs.error(404, 'NOT_FOUND');
    return _backup();
  }

  @override
  Future<api.E2eeBackupEnvelope> putE2eeBackup({
    required api.E2eeBackupPutDto body,
    Map<String, dynamic>? extras,
  }) async {
    ds
      ..backup = body.fileId
      ..backupKeyId = body.keyId;
    return _backup();
  }

  @override
  Future<void> deleteE2eeBackup({Map<String, dynamic>? extras}) async =>
      ds.backup = null;
}
