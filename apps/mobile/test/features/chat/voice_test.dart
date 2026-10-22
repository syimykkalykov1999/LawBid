import 'dart:io';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/core/uploads/upload_files.dart';
import 'package:lawbid/core/uploads/upload_files_io.dart';
import 'package:lawbid/core/uploads/upload_queue_database.dart';
import 'package:lawbid/features/chat/application/chat_media_outbox.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';

/// OQ-040: voice messages — local bubble while sending, retry after a
/// failure, "listened" only for the other side's notes, waveform bars.
class _FakeVoiceChat implements ChatRepository {
  /// Owner 2026-10-22: the queue uploads through the shared uploader.
  final uploader = FakeStorageUploader();
  List<int> get uploads => [for (final u in uploader.uploads) u.size];
  final listenedIds = <String>[];

  Conversation conv() => Conversation(
        id: 'c1',
        caseId: 'case-1',
        caseTitle: 'Speeding ticket',
        status: ConversationStatus.active,
        contactsUnlocked: true,
        counterpart: const Counterpart(isAttorney: true, verified: true),
        unreadCount: 0,
        updatedAt: DateTime(2026),
      );

  ChatMessage voice(String id, String sender, {bool listened = false}) =>
      ChatMessage(
        id: id,
        conversationId: 'c1',
        senderId: sender,
        kind: MessageKind.voice,
        body: '',
        createdAt: DateTime(2026, 9, 30, 12),
        voice: VoiceNote(
          url: 'https://x/$id.m4a',
          durationMs: 3000,
          waveform: const [10, 50, 90],
          listened: listened,
        ),
      );

  @override
  Future<Conversation> conversation(String id) async => conv();

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      CursorPage(items: [voice('theirs', 'other')]);

  @override
  Future<ChatMessage> sendVoice(
    String id,
    String clientMessageId, {
    required String fileId,
    required int durationMs,
    required List<int> waveform,
  }) async =>
      ChatMessage(
        id: 'srv-$fileId',
        conversationId: id,
        senderId: 'me',
        kind: MessageKind.voice,
        body: '',
        clientMessageId: clientMessageId,
        createdAt: DateTime.now(),
        voice: VoiceNote(
          url: 'https://x/$fileId.m4a',
          durationMs: durationMs,
          waveform: waveform,
          listened: false,
        ),
      );

  @override
  Future<ChatMessage> listened(String id, String messageId) async {
    listenedIds.add(messageId);
    return voice(messageId, 'other', listened: true);
  }

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

ProviderContainer _container(
  _FakeVoiceChat chat, {
  FakeStorageUploader? uploader,
  UploadQueueDatabase? queueDb,
  UploadFiles? files,
}) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
      ...uploadQueueOverrides(
        uploader: uploader ?? chat.uploader,
        db: queueDb,
        files: files,
      ),
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
    Future<void>.delayed(const Duration(milliseconds: 50));

Future<String> _recordedFile() async {
  final dir = await Directory.systemTemp.createTemp('voice');
  final f = File('${dir.path}/note.m4a');
  await f.writeAsBytes(List<int>.filled(2048, 7));
  addTearDown(() => dir.delete(recursive: true));
  return f.path;
}

void main() {
  test('a recorded note is sent and replaces its local bubble', () async {
    final chat = _FakeVoiceChat();
    final c = _container(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();

    await c.read(chatThreadProvider('c1').notifier).sendVoice(
      path: await _recordedFile(),
      durationMs: 4200,
      waveform: const [5, 60, 100],
    );
    await _settle();
    final s = c.read(chatThreadProvider('c1'));
    expect(chat.uploads, [2048]);
    expect(chat.uploader.uploads.single.purpose, api.FilePurpose.chatVoice);
    // The OS transfer is keyed by the message's own id.
    expect(chat.uploader.uploads.single.taskId, isNotNull);
    expect(s.voiceOutbox, isEmpty);
    final mine = s.messages.firstWhere((m) => m.id == 'srv-file-1');
    expect(mine.kind, MessageKind.voice);
    expect(mine.voice!.durationMs, 4200);
    expect(mine.voice!.waveform, [5, 60, 100]);
  });

  test('a refused upload keeps the note with Retry, which sends it', () async {
    final chat = _FakeVoiceChat();
    chat.uploader.fail = const ApiException(
      code: ApiErrorCodes.fileNotUploaded,
      message: 'denied',
      statusCode: 403,
    );
    final c = _container(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);

    await thread.sendVoice(
      path: await _recordedFile(),
      durationMs: 1500,
      waveform: const [20],
    );
    await _settle();
    var s = c.read(chatThreadProvider('c1'));
    expect(s.voiceOutbox.single.delivery, DeliveryState.failed);
    expect(s.all.first.kind, MessageKind.voice);

    chat.uploader.fail = null;
    await thread.retry(s.voiceOutbox.single);
    await _settle();
    s = c.read(chatThreadProvider('c1'));
    expect(s.voiceOutbox, isEmpty);
    expect(s.messages.any((m) => m.id == 'srv-file-1'), isTrue);
  });

  test(
      'offline: the note stays «sending» (not failed) and survives the app '
      'being closed — the next start sends it once', () async {
    final chat = _FakeVoiceChat();
    chat.uploader.fail = const ApiException(
      code: ApiException.networkErrorCode,
      message: 'offline',
    );
    final queueDb = UploadQueueDatabase(NativeDatabase.memory());
    addTearDown(queueDb.close);
    final dir = await Directory.systemTemp.createTemp('queue');
    addTearDown(() => dir.delete(recursive: true));
    final files = IoUploadFiles(root: () async => dir);

    final first = _container(chat, queueDb: queueDb, files: files);
    final sub = first.listen(chatThreadProvider('c1'), (_, __) {});
    await _settle();
    await first.read(chatThreadProvider('c1').notifier).sendVoice(
      path: await _recordedFile(),
      durationMs: 900,
      waveform: const [1],
    );
    await _settle();
    expect(
      first.read(chatThreadProvider('c1')).voiceOutbox.single.delivery,
      DeliveryState.sending,
    );
    // The app is killed.
    sub.close();
    first.dispose();
    expect(await queueDb.pending('me'), hasLength(1));

    // Next start, online again: the session start drains the queue.
    chat.uploader.fail = null;
    final second = _container(chat, queueDb: queueDb, files: files);
    await second.read(chatMediaOutboxProvider).drain();
    expect(chat.uploads, [2048]);
    expect(await queueDb.pending('me'), isEmpty);
    expect(dir.listSync(recursive: true).whereType<File>(), isEmpty);
  });

  test("playing the other side's note marks it listened once; own never",
      () async {
    final chat = _FakeVoiceChat();
    final c = _container(chat);
    final sub = c.listen(chatThreadProvider('c1'), (_, __) {});
    addTearDown(sub.close);
    await _settle();
    final thread = c.read(chatThreadProvider('c1').notifier);
    final theirs = c.read(chatThreadProvider('c1')).messages.single;

    await thread.voicePlayed(theirs);
    // Already listened now: no second call.
    await thread.voicePlayed(c.read(chatThreadProvider('c1')).messages.single);
    await thread.voicePlayed(chat.voice('own', 'me'));
    expect(chat.listenedIds, ['theirs']);
    expect(
      c.read(chatThreadProvider('c1')).messages.single.voice!.listened,
      isTrue,
    );
  });

  test('waveform bars: fixed count, 0–100, quiet notes still visible', () {
    final bars = VoiceRecorder.bars([0.1, 0.2, 0.05, 0.2, 0.1, 0.15], 4);
    expect(bars, hasLength(4));
    expect(bars.every((b) => b >= 8 && b <= 100), isTrue);
    expect(bars.reduce((a, b) => a > b ? a : b), 100);
    expect(VoiceRecorder.bars(const [], 3), [8, 8, 8]);
  });

  test('a browser note in WebM is told apart from AAC in MP4', () {
    // EBML header (Chrome/Firefox MediaRecorder).
    expect(isWebmVoice([0x1A, 0x45, 0xDF, 0xA3, 0x9F]), isTrue);
    // ....ftypM4A (the phones, Safari).
    expect(
      isWebmVoice([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x4D, 0x34]),
      isFalse,
    );
    expect(isWebmVoice(const []), isFalse);
  });

  test('clock format', () {
    expect(voiceClock(const Duration(seconds: 7)), '0:07');
    expect(voiceClock(const Duration(minutes: 12, seconds: 30)), '12:30');
  });
}
