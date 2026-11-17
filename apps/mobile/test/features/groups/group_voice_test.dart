import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/application/voice_player.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/voice_hold.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/groups/application/group_media_outbox.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/groups/domain/group_message_ext.dart';
import 'package:lawbid/features/groups/group_routes.dart';
import 'package:lawbid/features/groups/presentation/group_conversation_screen.dart';
import 'package:lawbid/features/groups/presentation/group_message_text.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;
import 'package:shared_preferences/shared_preferences.dart';

import '../../helpers/referral_overrides.dart';
import '../../helpers/upload_queue_overrides.dart';
import '../../helpers/ux_harness.dart';
import 'fake_group_repository.dart';

/// Groups WhatsApp parity (voice): a group voice note is the 1:1 one — the
/// same hold-to-record mic in the composer (VoiceHoldRecorder), the same
/// upload queue job (chat_voice, then the message with the job id), the
/// same bubble and player (VoiceMessageBody), «🎤 Voice message 0:04» in
/// previews, and the mini-player leads back to the group.
class _Player extends VoicePlayer {
  final toggled = <String>[];
  List<ChatMessage> next = const [];

  @override
  VoicePlayback build() => const VoicePlayback();

  @override
  void prefetch(ChatMessage m) {}

  @override
  bool get callBusy => false;

  @override
  Future<void> toggle(
    ChatMessage m, {
    List<ChatMessage> then = const [],
    void Function(ChatMessage)? onAutoPlay,
    String? title,
    String? threadId,
  }) async {
    toggled.add('${m.id}@$threadId');
    next = then;
  }
}

api.VoiceNoteDto _note(int ms) => api.VoiceNoteDto(
      url: 'https://signed/voice',
      durationMs: ms,
      waveform: const [10, 60, 100, 30],
      listened: false,
    );

api.GroupMessageDto _voice(
  String id, {
  bool mine = false,
  int minutes = 0,
  api.GroupPersonDto? sender,
}) =>
    message(
      id,
      body: '',
      type: api.GroupMessageDtoType.voice,
      mine: mine,
      minutes: minutes,
      sender: sender,
      voice: _note(4200),
    );

const _key = (groupId: 'g1', topicId: null);

void main() {
  setUpAll(initializeDateFormatting);

  group('the note as data', () {
    const t = StaticTranslatorEn();

    test('previews say «🎤 Voice message 0:04», like the 1:1 list', () {
      final m = _voice('v1');
      expect(groupMessagePreview(t, m), '🎤 Voice message 0:04');
      expect(
        groupMessagePreview(t, m, withSender: true),
        endsWith(': 🎤 Voice message 0:04'),
      );
    });

    test("it is the 1:1 player's ChatMessage; not forwardable", () {
      final m = _voice('v1');
      expect(m.isVoice, isTrue);
      expect(m.canForward, isFalse);
      final c = m.voiceMessage!;
      expect(c.kind, MessageKind.voice);
      expect(c.id, 'v1');
      expect(c.conversationId, 'g1');
      expect(c.voice!.url, 'https://signed/voice');
      expect(c.voice!.durationMs, 4200);
      expect(c.voice!.waveform, [10, 60, 100, 30]);
      // A poll update keeps the note; a tombstone drops it.
      expect(m.withPoll(poll('p1')).voice, isNotNull);
      expect(m.asTombstone().voiceMessage, isNull);
      expect(message('t1', body: 'hi').voiceMessage, isNull);
    });

    test('the mini-player goes back to the group, a 1:1 id stays 1:1', () {
      expect(groupRouteOfVoiceThread(groupVoiceThreadId('g1')), '/group/g1');
      expect(groupRouteOfVoiceThread('c-123'), isNull);
    });
  });

  test(
      'a recorded note goes through the queue as a chat_voice file, then '
      'a voice message with the job id', () async {
    final dir = Directory.systemTemp.createTempSync('rec');
    addTearDown(() => dir.deleteSync(recursive: true));
    final rec = File('${dir.path}/note.m4a')
      ..writeAsBytesSync(List<int>.filled(2048, 3));
    final repo = FakeGroupRepository();
    final uploader = FakeStorageUploader();
    final c = ProviderContainer(
      overrides: [
        groupRepositoryProvider.overrideWithValue(repo),
        realtimeClientProvider.overrideWithValue(null),
        ...uploadQueueOverrides(uploader: uploader),
      ],
    );
    addTearDown(c.dispose);
    final sub = c.listen(groupThreadProvider(_key), (_, __) {});
    addTearDown(sub.close);
    await Future<void>.delayed(const Duration(milliseconds: 80));

    await c.read(groupThreadProvider(_key).notifier).sendVoice(
          path: rec.path,
          durationMs: 4200,
          waveform: const [10, 60, 100, 30],
          replyToId: 'm-1',
        );
    // While queued: a pending voice bubble with the length and the bars.
    final queued = c.read(groupThreadProvider(_key)).pending;
    if (queued.isNotEmpty) {
      expect(queued.single.voice?.durationMs, 4200);
      expect(queued.single.voice?.waveform, [10, 60, 100, 30]);
    }
    await c.read(groupMediaOutboxProvider).drain();
    await Future<void>.delayed(const Duration(milliseconds: 80));

    expect(uploader.uploads.single.purpose, api.FilePurpose.chatVoice);
    expect(uploader.uploads.single.size, 2048);
    final sent = repo.sentBodies.single;
    expect(sent.type, api.SendGroupMessageDtoType.voice);
    expect(sent.fileId, 'file-1');
    expect(sent.durationMs, 4200);
    expect(sent.waveform, [10, 60, 100, 30]);
    expect(sent.replyToId, 'm-1');
    expect(sent.body, isNull);
    final s = c.read(groupThreadProvider(_key));
    expect(s.pending, isEmpty, reason: 'the bubble became the message');
    expect(s.messages.single.isVoice, isTrue);
    expect(s.messages.single.clientMessageId, sent.clientMessageId);
    expect(rec.existsSync(), isFalse, reason: 'moved into the queue folder');
  });

  group('the screen', () {
    late SharedPreferences prefs;
    setUp(() async {
      SharedPreferences.setMockInitialValues({});
      prefs = await SharedPreferences.getInstance();
    });

    Future<_Player> pump(
      WidgetTester tester,
      FakeGroupRepository repo,
    ) async {
      tester.view
        ..devicePixelRatio = 1
        ..physicalSize = const Size(390, 844);
      addTearDown(tester.view.reset);
      final player = _Player();
      await tester.pumpWidget(
        ProviderScope(
          overrides: uxOverrides(
            extra: [
              sharedPreferencesProvider.overrideWithValue(prefs),
              referralOffOverride,
              partnerOffOverride,
              groupRepositoryProvider.overrideWithValue(repo),
              currentUserIdProvider.overrideWithValue('me'),
              realtimeClientProvider.overrideWithValue(null),
              voicePlayerProvider.overrideWith(() => player),
            ],
          ),
          child: MaterialApp(
            theme: AppTheme.light(),
            home: const GroupConversationScreen(groupId: 'g1'),
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 500));
      await tester.pump(const Duration(milliseconds: 500));
      return player;
    }

    Future<void> settle(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 6));
    }

    testWidgets('empty field: the 1:1 hold-to-record mic; text: Send',
        (tester) async {
      final repo = FakeGroupRepository(
        const [],
        groupDetail(withPinned: false),
        [message('m1', body: 'Court is at nine')],
      );
      await pump(tester, repo);
      expect(find.byType(VoiceHoldMic), findsOneWidget);
      expect(
        find.bySemanticsLabel('Hold to record a voice message'),
        findsWidgets,
      );

      await tester.enterText(find.byType(TextField).last, 'On my way');
      await tester.pump();
      expect(find.byType(VoiceHoldMic), findsNothing);
      await settle(tester);
    });

    testWidgets('no media for me here: no mic, the old Send stays',
        (tester) async {
      final detail = groupDetail(withPinned: false, owner: false);
      final repo = FakeGroupRepository(
        const [],
        api.GroupDetailDto.fromJson({
          ...detail.toJson(),
          'whoCanMedia': 'admins',
        }),
        [message('m1', body: 'Court is at nine')],
      );
      await pump(tester, repo);
      expect(find.byType(VoiceHoldMic), findsNothing);
      await settle(tester);
    });

    testWidgets(
        'a note is the 1:1 voice bubble; play goes to the one player '
        'with the next notes of the same person', (tester) async {
      final repo = FakeGroupRepository(
        const [],
        groupDetail(withPinned: false),
        [
          _voice('v2', minutes: 2),
          _voice('v1', minutes: 1),
          message('m0', body: 'Listen'),
        ],
      );
      final player = await pump(tester, repo);
      expect(find.byType(VoiceMessageBody), findsNWidgets(2));
      expect(find.text('0:04'), findsNWidgets(2));

      // The play button of the older note (the list is newest first).
      await tester.tap(
        find
            .descendant(
              of: find.byType(VoiceMessageBody).last,
              matching: find.byType(AppPressable),
            )
            .first,
      );
      await tester.pump();
      expect(player.toggled, ['v1@${groupVoiceThreadId('g1')}']);
      // WhatsApp: the same person's next note plays after it.
      expect(player.next.map((m) => m.id), ['v2']);
      await settle(tester);
    });
  });
}
