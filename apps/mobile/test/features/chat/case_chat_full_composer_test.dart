import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/chat/presentation/voice_widgets.dart';
import 'package:lawbid/features/social/presentation/widgets/post_card.dart';
import 'package:material_ui/material_ui.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'contact_info_test.dart';

/// Owner 24.11: a chat with the person I work with on an accepted case has
/// everything a normal chat has — the paperclip (photos, video, files),
/// the camera, the mic, and their photo in the header. Once the server says
/// the chat is open (contacts unlocked), the composer is the same for the
/// case chat and for the direct chat the Chats row opens (R-404).
Finder _icon(IconData icon) =>
    find.byWidgetPredicate((w) => w is AppIcon && w.icon == icon);

Future<void> _open(
  WidgetTester tester,
  Conversation conv, {
  List<ChatMessage> messages = const [],
  Widget home = const ConversationScreen(conversationId: 'c1'),
}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await pumpContact(
    tester,
    contactTestApp(
      FakeContactChat(conv)..textMessages.addAll(messages),
      home,
      pushed: [],
      extra: [sharedPreferencesProvider.overrideWithValue(prefs)],
    ),
  );
  await tester.pump(const Duration(milliseconds: 300));
}

/// The screen's timers (typing, presence) end with the tree.
Future<void> _close(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox());
  await tester.pump(const Duration(seconds: 1));
}

const _attorney = Counterpart(
  isAttorney: true,
  verified: true,
  id: 'u2',
  displayName: 'Anna Kowalski',
  username: 'anna',
  avatarUrl: 'https://media.test/anna_256.jpg',
  avatarFullUrl: 'https://media.test/anna.jpg',
);

/// The client as the attorney sees them once the bid is accepted.
const _client = Counterpart(
  isAttorney: false,
  verified: false,
  id: 'u3',
  displayName: 'Clara Full',
  avatarUrl: 'https://media.test/clara_256.jpg',
  avatarFullUrl: 'https://media.test/clara.jpg',
);

ChatMessage _voiceFrom(String sender) => ChatMessage(
      id: 'v-$sender',
      conversationId: 'c1',
      senderId: sender,
      kind: MessageKind.voice,
      body: '',
      createdAt: DateTime(2026, 11, 24, 12),
      voice: const VoiceNote(
        url: 'https://x/v.m4a',
        durationMs: 3000,
        waveform: [10, 50, 90],
        listened: false,
      ),
    );

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);
  setUp(() {
    TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
        .setMockMethodCallHandler(
      const MethodChannel('com.llfbandit.record/messages'),
      (_) async => null,
    );
  });

  for (final (name, caseId) in [
    ('the accepted case chat', 'case-1'),
    ('the direct chat of a working pair', null),
  ]) {
    testWidgets('$name: paperclip, camera, mic and the photo', (tester) async {
      await _open(
        tester,
        makeConv(
          counterpart: _attorney,
          caseId: caseId,
          caseTitle: caseId == null ? null : 'Lease dispute',
        ),
      );
      expect(_icon(AppIcons.attachFileRounded), findsOneWidget);
      expect(find.byKey(const ValueKey('chat-camera')), findsOneWidget);
      expect(_icon(AppIcons.micRounded), findsOneWidget);
      final avatar = tester.widget<GoldRingAvatar>(
        find.byType(GoldRingAvatar).first,
      );
      expect(avatar.url, isNotNull);
      expect(find.text('Anna Kowalski'), findsWidgets);
      await _close(tester);
    });
  }

  testWidgets('before acceptance the case chat stays locked (privacy)', (
    tester,
  ) async {
    await _open(
      tester,
      makeConv(
        counterpart: _attorney,
        caseId: 'case-1',
        caseTitle: 'Lease dispute',
        unlocked: false,
      ),
    );
    expect(_icon(AppIcons.attachFileRounded), findsNothing);
    expect(find.byKey(const ValueKey('chat-camera')), findsNothing);
    await _close(tester);
  });

  // Owner 24.11: «в кейсовских чатах не показываются аватарки» — the photo
  // of the other side in the «Кейсы» list row, the chat header and the
  // voice bubble, for both sides of an accepted case chat.
  for (final (who, other) in [
    ('the client sees the attorney', _attorney),
    ('the attorney sees the client', _client),
  ]) {
    testWidgets('$who: photo in the Cases row', (tester) async {
      final conv = makeConv(
        counterpart: other,
        caseId: 'case-1',
        caseTitle: 'Lease dispute',
      );
      await _open(
        tester,
        conv,
        home: Scaffold(body: ConversationRow(conversation: conv)),
      );
      final avatar = tester.widget<GoldRingAvatar>(find.byType(GoldRingAvatar));
      expect(avatar.url, isNotNull);
      expect(find.text(other.displayName!), findsOneWidget);
      await _close(tester);
    });

    testWidgets('$who: photo in the header and on the voice bubble', (
      tester,
    ) async {
      await _open(
        tester,
        makeConv(
          counterpart: other,
          caseId: 'case-1',
          caseTitle: 'Lease dispute',
        ),
        messages: [_voiceFrom(other.id!)],
      );
      final header = tester.widget<GoldRingAvatar>(
        find.descendant(
          of: find.byKey(const ValueKey('chat-header')),
          matching: find.byType(GoldRingAvatar),
        ),
      );
      expect(header.url, isNotNull);
      final voice = tester.widget<VoiceMessageBody>(
        find.byType(VoiceMessageBody),
      );
      expect(voice.avatarUrl, other.avatarUrl);
      await _close(tester);
    });
  }
}
