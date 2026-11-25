import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_queue.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/send_picked.dart';
import 'package:lawbid/features/chat/data/chat_extras_repository.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/features/templates/application/templates_providers.dart';
import 'package:lawbid/features/templates/data/templates_repository.dart';
import 'package:lawbid/features/templates/domain/doc_template.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';

class _Chat implements ChatRepository {
  final sent = <String>[];
  final clientIds = <String>[];
  final replyIds = <String?>[];
  ApiException? failSend;

  ChatMessage _msg(String cmid, MessageKind kind, String body) => ChatMessage(
        id: 'srv-${sent.length}',
        conversationId: 'c1',
        senderId: 'me',
        kind: kind,
        body: body,
        clientMessageId: cmid,
        createdAt: DateTime.now(),
      );

  @override
  Future<Conversation> conversation(String id) async => Conversation(
        id: 'c1',
        caseId: 'case-1',
        caseTitle: 'Lease',
        status: ConversationStatus.active,
        contactsUnlocked: true,
        counterpart: const Counterpart(isAttorney: true, verified: true),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      const CursorPage(items: []);

  @override
  Future<ChatMessage> sendAttachment(
    String id,
    String clientMessageId, {
    required String fileId,
    required String fileName,
    String? caption,
    String? replyToId,
  }) async {
    final f = failSend;
    if (f != null) throw f;
    sent.add(fileName);
    replyIds.add(replyToId);
    clientIds.add(clientMessageId);
    return _msg(clientMessageId, MessageKind.attachment, caption ?? '');
  }

  @override
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
    String? replyToId,
  }) async {
    final f = failSend;
    if (f != null) throw f;
    sent.add('sticker:$stickerId');
    replyIds.add(replyToId);
    clientIds.add(clientMessageId);
    return _msg(clientMessageId, MessageKind.sticker, '');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

/// Row 188: the card sender (a contact or a place).
class _Cards implements ChatExtrasRepository {
  final replyIds = <String?>[];

  @override
  Future<ChatMessage> sendContact(
    String conversationId,
    String clientMessageId,
    String userId, {
    String? replyToId,
  }) async {
    replyIds.add(replyToId);
    return ChatMessage(
      id: 'srv-card',
      conversationId: conversationId,
      senderId: 'me',
      kind: MessageKind.contact,
      body: '',
      clientMessageId: clientMessageId,
      createdAt: DateTime.now(),
    );
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Templates implements TemplatesRepository {
  @override
  Future<String> copy(String id, TemplateTarget target) async => 'file-$id';

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ProviderContainer _container(
  _Chat chat,
  FakeStorageUploader uploader, {
  _Cards? cards,
}) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      ...uploadQueueOverrides(uploader: uploader),
      currentUserIdProvider.overrideWithValue('me'),
      realtimeClientProvider.overrideWithValue(null),
      networkInterfaceMonitorProvider.overrideWithValue(FakeNetworkMonitor()),
      reachabilityProbeProvider.overrideWithValue(FakeProbe().call),
      if (cards != null) chatExtrasRepositoryProvider.overrideWithValue(cards),
      templatesRepositoryProvider.overrideWithValue(_Templates()),
    ],
  );
  addTearDown(() async {
    c.dispose();
    await db.close();
  });
  return c;
}

Future<void> _settle() =>
    Future<void>.delayed(const Duration(milliseconds: 80));

/// Owner 2026-10-22 (audit #4 §3, WhatsApp): photos, files and stickers go
/// through the persistent upload queue — an album keeps its order, the
/// message id never changes between tries, offline keeps «sending».
void main() {
  test('R-255: a file on disk is copied to the queue and sent from there',
      () async {
    final dir = Directory.systemTemp.createTempSync('picked');
    addTearDown(() => dir.deleteSync(recursive: true));
    final picked = File('${dir.path}/report.pdf')
      ..writeAsBytesSync(List<int>.filled(4096, 7));
    final chat = _Chat();
    final uploader = FakeStorageUploader();
    final c = _container(chat, uploader);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    await thread.sendAttachment(
      bytes: Uint8List(0),
      path: picked.path,
      diskBytes: 4096,
      name: 'report.pdf',
      mime: 'application/pdf',
    );
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    expect(chat.sent, ['report.pdf']);
    expect(uploader.uploads.single.size, 4096);
    expect(picked.existsSync(), isTrue, reason: "the user's file stays");
  });

  test('R-255: files on disk and in memory keep the picked order', () async {
    final dir = Directory.systemTemp.createTempSync('picked');
    addTearDown(() => dir.deleteSync(recursive: true));
    final picked = File('${dir.path}/2.pdf')
      ..writeAsBytesSync(List<int>.filled(50, 1));
    final chat = _Chat();
    final c = _container(chat, FakeStorageUploader());
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    final first = thread.sendAttachment(
      bytes: Uint8List.fromList([1]),
      name: '1.pdf',
      mime: 'application/pdf',
    );
    final second = thread.sendAttachment(
      bytes: Uint8List(0),
      path: picked.path,
      diskBytes: 50,
      name: '2.pdf',
      mime: 'application/pdf',
      after: first,
    );
    await second;
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    expect(chat.sent, ['1.pdf', '2.pdf']);
  });

  test('an album is uploaded and sent in the picked order', () async {
    final chat = _Chat();
    final uploader = FakeStorageUploader();
    final c = _container(chat, uploader);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    Future<void>? previous;
    for (final name in ['1.pdf', '2.pdf', '3.pdf']) {
      previous = thread.sendAttachment(
        bytes: Uint8List.fromList(List<int>.filled(10, 1)),
        name: name,
        mime: 'application/pdf',
        caption: name == '3.pdf' ? 'All three' : null,
        after: previous,
      );
    }
    await previous;
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    expect(chat.sent, ['1.pdf', '2.pdf', '3.pdf']);
    expect(
      uploader.uploads.map((u) => u.purpose),
      everyElement(api.FilePurpose.chatAttachment),
    );
    final s = c.read(chatThreadProvider('c1'));
    expect(s.voiceOutbox, isEmpty);
    expect(s.messages.first.body, 'All three');
  });

  test('offline: a sticker stays «sending» and goes once with its own id',
      () async {
    final chat = _Chat()
      ..failSend = const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    final c = _container(chat, FakeStorageUploader());
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();

    await c
        .read(chatThreadProvider('c1').notifier)
        .sendSticker(const ChatSticker(id: 's1', packId: 'p', emoji: '🙂'));
    await _settle();
    var s = c.read(chatThreadProvider('c1'));
    final local = s.voiceOutbox.single;
    expect(local.kind, MessageKind.sticker);
    expect(local.delivery, DeliveryState.sending);

    chat.failSend = null;
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    s = c.read(chatThreadProvider('c1'));
    expect(chat.sent, ['sticker:s1']);
    expect(chat.clientIds.single, local.clientMessageId);
    expect(s.voiceOutbox, isEmpty);
  });

  test(
      'owner 24.11: a photo whose scan is slow stays «sending» with its '
      'ring done, then goes by itself without a second upload', () async {
    final chat = _Chat();
    final uploader = FakeStorageUploader()..pendingScans = 2;
    final c = _container(chat, uploader);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    await thread.sendAttachment(
      bytes: Uint8List.fromList([1, 2, 3]),
      name: 'x.png',
      mime: 'image/png',
    );
    await _settle();
    var local = c.read(chatThreadProvider('c1')).voiceOutbox.single;
    // Before: after the scan wait the photo was «not sent» for good.
    expect(local.delivery, DeliveryState.sending);
    expect(local.failedCode, isNull);
    // The bytes are up: the bubble shows the photo without the ring.
    expect(local.attachment!.progress, 1);
    expect(local.attachment!.localBytes, isNotNull);

    // The queue asks again (backoff / resume / reconnect): only the scan.
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    local = c.read(chatThreadProvider('c1')).voiceOutbox.single;
    expect(local.delivery, DeliveryState.sending);
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();

    expect(chat.sent, ['x.png']);
    expect(chat.clientIds.single, local.clientMessageId);
    expect(uploader.uploads, hasLength(1), reason: 'never sent twice');
    expect(uploader.waited, ['file-1', 'file-1']);
    expect(c.read(chatThreadProvider('c1')).voiceOutbox, isEmpty);
  });

  test('a refused photo shows «not sent»; Delete removes it', () async {
    final chat = _Chat();
    final uploader = FakeStorageUploader()
      ..fail = const ApiException(
        code: ApiErrorCodes.fileNotAttachable,
        message: 'scan',
        statusCode: 422,
      );
    final c = _container(chat, uploader);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    await thread.sendAttachment(
      bytes: Uint8List.fromList([1, 2, 3]),
      name: 'x.png',
      mime: 'image/png',
    );
    await _settle();
    var s = c.read(chatThreadProvider('c1'));
    final local = s.voiceOutbox.single;
    expect(local.delivery, DeliveryState.failed);
    expect(local.failedCode, ApiErrorCodes.fileNotAttachable);
    // The photo is still shown from the queued copy.
    expect(local.attachment!.localBytes, isNotNull);

    await thread.discard(local);
    await _settle();
    s = c.read(chatThreadProvider('c1'));
    expect(s.voiceOutbox, isEmpty);
    expect(await c.read(uploadQueueDatabaseProvider).pending('me'), isEmpty);
  });

  test('row 188: an album and a sticker go out as answers', () async {
    final chat = _Chat();
    final c = _container(chat, FakeStorageUploader());
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    await sendPickedFiles(
      thread,
      [
        for (final n in ['1.pdf', '2.pdf'])
          (
            bytes: Uint8List.fromList([1, 2]),
            name: n,
            mime: 'application/pdf',
            path: null,
            diskBytes: null,
          ),
      ],
      'both',
      replyToId: 'quoted-1',
    );
    await thread.sendSticker(
      const ChatSticker(id: 's1', packId: 'p', emoji: '🙂'),
      replyToId: 'quoted-2',
    );
    await c.read(chatMediaOutboxProvider).drain();
    await _settle();
    // The album answers once (its first file), like groups and WhatsApp.
    expect(Map.fromIterables(chat.sent, chat.replyIds), {
      '1.pdf': 'quoted-1',
      '2.pdf': null,
      'sticker:s1': 'quoted-2',
    });
  });

  test('row 188: a template and a contact card go out as answers', () async {
    final chat = _Chat();
    final cards = _Cards();
    final c = _container(chat, FakeStorageUploader(), cards: cards);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    await thread.sendTemplate(
      const DocTemplate(
        id: 't1',
        title: 'Lease',
        description: '',
        fileName: 'Lease.pdf',
        mime: 'application/pdf',
        sizeBytes: 10,
        language: 'en',
        lawyersOnly: false,
        downloadCount: 0,
      ),
      replyToId: 'quoted-1',
    );
    await thread.sendCard(contactUserId: 'u9', replyToId: 'quoted-2');
    expect(chat.sent, ['Lease.pdf']);
    expect(chat.replyIds, ['quoted-1']);
    expect(cards.replyIds, ['quoted-2']);
  });
}
