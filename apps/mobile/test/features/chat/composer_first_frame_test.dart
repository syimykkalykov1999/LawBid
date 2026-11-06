import 'dart:async';

import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import 'contact_info_test.dart';

/// R-380 (owner 2026-11-04, Samsung recording): the chat opened and the
/// field + mic came 1–2 frames after the messages. The composer waited for
/// the server's copy of the conversation; now the chats list's own row
/// gives it at once (Telegram's ChatActivity opens on the dialog in memory).
class _SlowServerChat extends FakeContactChat {
  _SlowServerChat(super.conv);

  /// The server never answers during the test: whatever shows came from
  /// memory.
  final _never = Completer<Conversation>();

  @override
  Future<Conversation> conversation(String id) => _never.future;

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: [conv]);
}

/// The chats list (keeps [conversationsProvider] alive, like the inbox).
class _Inbox extends ConsumerWidget {
  const _Inbox();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final list = ref.watch(conversationsProvider);
    return Scaffold(body: Text(list.hasValue ? 'inbox ready' : 'inbox'));
  }
}

Finder _mic({bool skipOffstage = true}) => find.byWidgetPredicate(
      (w) => w is AppIcon && w.icon == AppIcons.micRounded,
      skipOffstage: skipOffstage,
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

  testWidgets(
      'R-380: the field and the mic are in the very first frame of the chat',
      (tester) async {
    final chat = _SlowServerChat(makeConv());
    await pumpContact(
      tester,
      contactTestApp(chat, const _Inbox(), pushed: []),
    );
    expect(find.text('inbox ready'), findsOneWidget);

    unawaited(
      Navigator.of(tester.element(find.text('inbox ready'))).push(
        MaterialPageRoute<void>(
          builder: (_) => const ConversationScreen(conversationId: 'c1'),
        ),
      ),
    );
    // ONE frame — no pumpAndSettle, the server has not answered. (The
    // route is built in this frame; Flutter's hero pass may keep it offstage
    // for it, so the finders look offstage too.)
    await tester.pump();
    void composerIsThere() {
      final screen = find.byType(ConversationScreen, skipOffstage: false);
      expect(screen, findsOneWidget);
      expect(
        find.descendant(
          of: screen,
          matching: find.byType(TextField, skipOffstage: false),
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      expect(
        find.descendant(
          of: screen,
          matching: _mic(skipOffstage: false),
          skipOffstage: false,
        ),
        findsOneWidget,
      );
      // The header is there in the same frame as well.
      expect(
        find.text('Anna Kowalski', skipOffstage: false),
        findsOneWidget,
      );
    }

    composerIsThere();
    // The first frame the user sees (on stage): the same.
    await tester.pump(const Duration(milliseconds: 16));
    expect(find.byType(ConversationScreen), findsOneWidget);
    composerIsThere();
    final screen = find.byType(ConversationScreen);

    // The composer keeps its place while the screen slides in: the same
    // field, no jump, frame after frame.
    final field = find.descendant(of: screen, matching: find.byType(TextField));
    final h0 = tester.getSize(field).height;
    for (var i = 0; i < 20; i++) {
      await tester.pump(const Duration(milliseconds: 16));
      expect(tester.getSize(field).height, h0);
    }

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });

  testWidgets(
      'no chats list in memory (opened from a push): the screen still '
      'opens on the skeleton, then the composer with the server copy',
      (tester) async {
    final chat = FakeContactChat(makeConv());
    await tester.pumpWidget(
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    await tester.pump(const Duration(milliseconds: 100));
    await tester.pump(const Duration(milliseconds: 100));
    expect(find.byType(TextField), findsOneWidget);
    expect(_mic(), findsOneWidget);

    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}
