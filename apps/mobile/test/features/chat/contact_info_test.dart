// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/chat_files_screen.dart';
import 'package:lawbid/features/chat/presentation/contact_info_screen.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

import '../../helpers/ux_harness.dart';

ChatMessage contactTestFile(
  String id,
  String name, {
  String? mime,
  bool image = false,
}) =>
    ChatMessage(
      id: id,
      conversationId: 'c1',
      kind: MessageKind.attachment,
      body: '',
      createdAt: DateTime(2026, 10, 17, 12),
      attachment: ChatAttachment(
        fileId: id,
        name: name,
        isImage: image,
        mime: mime,
        sizeBytes: 2048,
      ),
    );

ChatMessage _text(String id, String body) => ChatMessage(
      id: id,
      conversationId: 'c1',
      kind: MessageKind.text,
      body: body,
      createdAt: DateTime(2026, 10, 17, 13),
    );

class FakeContactChat implements ChatRepository {
  FakeContactChat(this.conv, {this.attachmentItems = const []});

  Conversation conv;
  final List<ChatMessage> attachmentItems;
  final textMessages = <ChatMessage>[];

  @override
  Future<Conversation> conversation(String id) async => conv;

  final callsMutes = <bool>[];
  final mutes = <DateTime?>[];

  @override
  Future<Conversation> muteCalls(String id, {required bool muted}) async {
    callsMutes.add(muted);
    return conv;
  }

  @override
  Future<Conversation> mute(String id, DateTime? until) async {
    mutes.add(until);
    return conv;
  }

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      CursorPage(items: textMessages);

  @override
  Future<CursorPage<ChatMessage>> attachments(
    String id, {
    String? cursor,
  }) async =>
      CursorPage(items: attachmentItems);

  @override
  Future<ChatStorageSummary> storage(String id) async => (
        photos: 1,
        documents: 2,
        voice: 0,
        usedBytes: 4096,
        quotaBytes: null,
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

Conversation makeConv({
  Counterpart counterpart = const Counterpart(
    isAttorney: true,
    verified: true,
    id: 'u2',
    displayName: 'Anna Kowalski',
    username: 'anna',
    online: true,
  ),
  String? caseId,
  String? caseTitle,
  bool unlocked = true,
}) =>
    Conversation(
      id: 'c1',
      caseId: caseId,
      caseTitle: caseTitle,
      status: ConversationStatus.active,
      contactsUnlocked: unlocked,
      counterpart: counterpart,
      unreadCount: 0,
      updatedAt: DateTime(2026),
    );

Widget contactTestApp(
  FakeContactChat chat,
  Widget home, {
  required List<String> pushed,
  ThemeData? theme,
}) {
  final router = GoRouter(
    routes: [
      GoRoute(path: '/', builder: (_, __) => home),
      GoRoute(
        path: '/:a/:b',
        builder: (_, state) {
          pushed.add(state.uri.path);
          return const Scaffold(body: Text('routed'));
        },
      ),
      GoRoute(
        path: '/:a/:b/:c',
        builder: (_, state) {
          pushed.add(state.uri.path);
          return const Scaffold(body: Text('routed'));
        },
      ),
    ],
  );
  final overrides = <Override>[
    ...uxOverrides(translator: const StaticTranslatorRu()),
    chatRepositoryProvider.overrideWithValue(chat),
    currentUserIdProvider.overrideWithValue('me'),
    realtimeClientProvider.overrideWithValue(null),
    actsAsAttorneyProvider.overrideWithValue(false),
    blockedIdsProvider.overrideWith((ref) async => <String>{}),
  ];
  return ProviderScope(
    overrides: overrides,
    child: MaterialApp.router(
      theme: theme ?? AppTheme.light(),
      routerConfig: router,
    ),
  );
}

Future<void> pumpContact(WidgetTester tester, Widget app) async {
  tester.view.physicalSize = const Size(390, 844);
  tester.view.devicePixelRatio = 1;
  addTearDown(tester.view.reset);
  await tester.pumpWidget(app);
  await tester.pump(const Duration(milliseconds: 100));
  await tester.pump(const Duration(milliseconds: 100));
}

/// A widget test that disposes the tree and lets drift's zero timers fire.
void _test(String name, Future<void> Function(WidgetTester) body) {
  testWidgets(name, (tester) async {
    await body(tester);
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 1));
  });
}

void main() {
  driftRuntimeOptions.dontWarnAboutMultipleDatabases = true;
  setUpAll(initializeDateFormatting);

  _test('header shows the name and the status, no @username', (tester) async {
    final chat = FakeContactChat(
      makeConv(caseId: 'k1', caseTitle: 'Speeding ticket'),
    );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(find.text('Anna Kowalski'), findsOneWidget);
    expect(find.text('в сети'), findsOneWidget);
    expect(find.textContaining('@anna'), findsNothing);
    expect(find.textContaining('Speeding ticket'), findsNothing);
  });

  _test('«Заглушить звонки» is a switch of this chat only', (tester) async {
    final chat = FakeContactChat(makeConv());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ContactInfoScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('contact-calls-mute')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('contact-calls-mute')));
    await tester.pumpAndSettle();
    expect(chat.callsMutes, [true]);
    expect(chat.mutes, isEmpty);
  });

  _test('«Без звука» asks for how long: an hour, 8 hours, a week, always',
      (tester) async {
    final chat = FakeContactChat(makeConv());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ContactInfoScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('contact-mute')),
      200,
      scrollable: find.byType(Scrollable).first,
    );
    await tester.tap(find.byKey(const ValueKey('contact-mute')));
    await tester.pumpAndSettle();
    await tester.tap(find.text('На 8 часов'));
    await tester.pumpAndSettle();
    expect(chat.mutes, hasLength(1));
    final left = chat.mutes.single!.difference(DateTime.now());
    expect(left.inHours, inInclusiveRange(7, 8));
  });

  _test('tapping the header opens «Данные контакта»; Profile routes',
      (tester) async {
    final pushed = <String>[];
    final chat = FakeContactChat(
      makeConv(),
      attachmentItems: [
        contactTestFile('f1', 'a.jpg', image: true, mime: 'image/jpeg'),
        contactTestFile('f2', 'Contract.pdf', mime: 'application/pdf'),
      ],
    );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ConversationScreen(conversationId: 'c1'),
        pushed: pushed,
      ),
    );
    await tester.tap(find.byKey(const ValueKey('chat-header')));
    await tester.pumpAndSettle();
    expect(find.text('Данные контакта'), findsOneWidget);
    expect(find.byKey(const ValueKey('contact-name')), findsOneWidget);
    expect(find.text('Проверенный адвокат'), findsOneWidget);
    expect(find.text('Медиа, ссылки и документы'), findsOneWidget);
    // Count from the chat's storage: 1 photo + 2 documents.
    expect(find.text('3'), findsOneWidget);
    final contactScroll = find
        .descendant(
          of: find.byType(ContactInfoScreen),
          matching: find.byType(Scrollable),
        )
        .first;
    await tester.scrollUntilVisible(
      find.text('Заблокировать Anna Kowalski'),
      200,
      scrollable: contactScroll,
    );
    expect(find.text('Заблокировать Anna Kowalski'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.text('Пожаловаться на Anna Kowalski'),
      200,
      scrollable: contactScroll,
    );
    expect(find.text('Пожаловаться на Anna Kowalski'), findsOneWidget);
    await tester.scrollUntilVisible(
      find.byKey(const ValueKey('contact-profile')),
      -200,
      scrollable: contactScroll,
    );

    await tester.tap(find.byKey(const ValueKey('contact-profile')));
    await tester.pumpAndSettle();
    expect(pushed, ['/lawyer/anna']);
  });

  _test('a client counterpart routes to the client profile', (tester) async {
    final pushed = <String>[];
    final chat = FakeContactChat(
      makeConv(
        counterpart: const Counterpart(
          isAttorney: false,
          verified: false,
          id: 'u3',
          displayName: 'Ivan',
          username: 'ivan',
        ),
      ),
    );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ContactInfoScreen(conversationId: 'c1'),
        pushed: pushed,
      ),
    );
    await tester.tap(find.byKey(const ValueKey('contact-profile')));
    await tester.pumpAndSettle();
    expect(pushed, ['/client/ivan']);
    // No audio button without a call handler.
    expect(find.byKey(const ValueKey('contact-audio')), findsNothing);
  });

  _test('audio shows when calls are allowed and starts the call',
      (tester) async {
    var calls = 0;
    final chat = FakeContactChat(makeConv());
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        ContactInfoScreen(conversationId: 'c1', onCall: () => calls++),
        pushed: [],
      ),
    );
    await tester.tap(find.byKey(const ValueKey('contact-audio')));
    expect(calls, 1);
  });

  _test('hidden-identity case chat: no profile, no photo, case row',
      (tester) async {
    final pushed = <String>[];
    final chat = FakeContactChat(
      makeConv(
        counterpart: const Counterpart(isAttorney: false, verified: false),
        caseId: 'k1',
        caseTitle: 'Speeding ticket',
        unlocked: false,
      ),
    );
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        ContactInfoScreen(conversationId: 'c1', onCall: () {}),
        pushed: pushed,
      ),
    );
    expect(find.byKey(const ValueKey('contact-profile')), findsNothing);
    expect(find.byKey(const ValueKey('contact-audio')), findsNothing);
    expect(find.byKey(const ValueKey('contact-media')), findsNothing);
    expect(find.textContaining('Speeding ticket'), findsWidgets);
    expect(find.byKey(const ValueKey('contact-block')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('contact-case')));
    await tester.pumpAndSettle();
    expect(pushed, ['/mine/case/k1']);
  });

  _test('files screen: media tab counts photos and videos', (tester) async {
    final chat = FakeContactChat(
      makeConv(),
      attachmentItems: [
        contactTestFile('p1', 'a.jpg', image: true, mime: 'image/jpeg'),
        contactTestFile('p2', 'b.jpg', image: true, mime: 'image/jpeg'),
        contactTestFile('v1', 'clip.mp4', mime: 'video/mp4'),
        contactTestFile('d1', 'Contract.pdf', mime: 'application/pdf'),
      ],
    )..textMessages.addAll([
        _text('t1', 'see https://example.com/page, ok'),
        _text('t2', 'and www.lawbid.dev.'),
      ]);
    await pumpContact(
      tester,
      contactTestApp(
        chat,
        const ChatFilesScreen(conversationId: 'c1'),
        pushed: [],
      ),
    );
    expect(find.text('Фото: 2 · Видео: 1'), findsOneWidget);
    expect(find.byKey(const ValueKey('media-video-v1')), findsOneWidget);
    await tester.tap(find.text('Документы'));
    await tester.pumpAndSettle();
    expect(find.text('Документов: 1'), findsOneWidget);
    expect(find.text('Contract.pdf'), findsOneWidget);
    await tester.tap(find.text('Ссылки'));
    await tester.pumpAndSettle();
    expect(find.text('Ссылок: 2'), findsOneWidget);
    expect(find.text('example.com'), findsOneWidget);
    expect(find.text('lawbid.dev'), findsOneWidget);
    await tester.tap(find.text('Голосовые'));
    await tester.pumpAndSettle();
    expect(find.text('Нет голосовых сообщений.'), findsOneWidget);
  });

  test('extractChatLinks trims punctuation and adds a scheme to www.', () {
    final links = extractChatLinks([
      _text('1', 'a (https://x.org/a?b=1). b www.y.com/z!'),
    ]);
    expect(
      links.map((l) => l.url),
      ['https://x.org/a?b=1', 'https://www.y.com/z'],
    );
    expect(links.map((l) => l.domain), ['x.org', 'y.com']);
  });
}
