import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
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

Future<void> _open(WidgetTester tester, Conversation conv) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  await pumpContact(
    tester,
    contactTestApp(
      FakeContactChat(conv),
      const ConversationScreen(conversationId: 'c1'),
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
}
