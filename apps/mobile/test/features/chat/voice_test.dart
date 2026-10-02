import 'dart:io';
import 'dart:typed_data';

import 'package:drift/native.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/connectivity/connectivity_providers.dart';
import 'package:lawbid/core/network/api_error.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/voice_recorder.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/data/social_local_database.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

/// OQ-040: voice messages — local bubble while sending, retry after a
/// failure, "listened" only for the other side's notes, waveform bars.
class _FakeVoiceChat implements ChatRepository {
  bool failUpload = false;
  final uploads = <int>[];
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
  Future<String> uploadVoice(Uint8List bytes) async {
    if (failUpload) {
      throw const ApiException(
        code: ApiException.networkErrorCode,
        message: 'offline',
      );
    }
    uploads.add(bytes.length);
    return 'file-${uploads.length}';
  }

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

ProviderContainer _container(_FakeVoiceChat chat) {
  final db = SocialLocalDatabase(NativeDatabase.memory());
  final c = ProviderContainer(
    overrides: [
      chatRepositoryProvider.overrideWithValue(chat),
      socialLocalDatabaseProvider.overrideWithValue(db),
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
    expect(s.voiceOutbox, isEmpty);
    final mine = s.messages.firstWhere((m) => m.id == 'srv-file-1');
    expect(mine.kind, MessageKind.voice);
    expect(mine.voice!.durationMs, 4200);
    expect(mine.voice!.waveform, [5, 60, 100]);
  });

  test('a failed upload keeps the note with Retry, which sends it', () async {
    final chat = _FakeVoiceChat()..failUpload = true;
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

    chat.failUpload = false;
    await thread.retry(s.voiceOutbox.single);
    await _settle();
    s = c.read(chatThreadProvider('c1'));
    expect(s.voiceOutbox, isEmpty);
    expect(s.messages.any((m) => m.id == 'srv-file-1'), isTrue);
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

  test('clock format', () {
    expect(voiceClock(const Duration(seconds: 7)), '0:07');
    expect(voiceClock(const Duration(minutes: 12, seconds: 30)), '12:30');
  });
}
