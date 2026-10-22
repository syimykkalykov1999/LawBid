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
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/features/stickers/domain/sticker_models.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';

class _Chat implements ChatRepository {
  final sent = <String>[];
  final clientIds = <String>[];
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
  }) async {
    final f = failSend;
    if (f != null) throw f;
    sent.add(fileName);
    clientIds.add(clientMessageId);
    return _msg(clientMessageId, MessageKind.attachment, caption ?? '');
  }

  @override
  Future<ChatMessage> sendSticker(
    String id,
    String clientMessageId, {
    required String stickerId,
  }) async {
    final f = failSend;
    if (f != null) throw f;
    sent.add('sticker:$stickerId');
    clientIds.add(clientMessageId);
    return _msg(clientMessageId, MessageKind.sticker, '');
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ProviderContainer _container(_Chat chat, FakeStorageUploader uploader) {
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
}
