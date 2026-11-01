// ignore_for_file: lines_longer_than_80_chars
import 'package:drift/drift.dart' show driftRuntimeOptions;
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/bars/app_side_nav.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/navigation/shell/desktop_input.dart';
import 'package:lawbid/core/navigation/shell/shell_layout.dart';
import 'package:lawbid/core/navigation/shell/web_page_frame.dart';
import 'package:lawbid/features/blocks/application/blocks_providers.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/chat/presentation/conversation_screen.dart';
import 'package:lawbid/features/chat/presentation/inbox_screen.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../features/groups/fake_group_repository.dart';
import '../helpers/ux_harness.dart';

/// Desktop web plan 2026-10-28, PR 1–2: on a desktop window the chats are
/// «list | chat» (WhatsApp Web). The list stays the same widget while chats
/// are switched, the URL follows, Esc and Alt+↑/↓ work, and the side menu
/// carries Messages / Notifications with their counts.
Conversation _conv(String id, String name, String last, {int unread = 0}) =>
    Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: ConversationStatus.active,
      contactsUnlocked: true,
      isDirect: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: true,
        id: 'u-$id',
        displayName: name,
        username: id,
      ),
      unreadCount: unread,
      updatedAt: DateTime(2026, 10, 17),
      lastMessage: ChatMessage(
        id: 'last-$id',
        conversationId: id,
        kind: MessageKind.text,
        body: last,
        senderId: 'u-$id',
        createdAt: DateTime(2026, 10, 17, 12),
      ),
    );

final _convs = [
  _conv('c1', 'Айбек Беков', 'Документы получил, спасибо', unread: 2),
  _conv('c2', 'Айгуль Токтосунова', 'Заседание перенесли на 2 ноября'),
  _conv('c3', 'Нурлан Асанов', 'Отправила скан договора'),
];

class _Chats implements ChatRepository {
  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async =>
      CursorPage(items: _convs);

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  Future<Conversation> conversation(String id) async =>
      _convs.firstWhere((c) => c.id == id);

  @override
  Future<CursorPage<ChatMessage>> messages(String id, {String? cursor}) async =>
      CursorPage(
        items: [
          ChatMessage(
            id: '$id-2',
            conversationId: id,
            kind: MessageKind.text,
            body: 'Отправила скан, посмотрите, пожалуйста.',
            senderId: 'me',
            createdAt: DateTime(2026, 10, 17, 12, 5),
          ),
          ChatMessage(
            id: '$id-1',
            conversationId: id,
            kind: MessageKind.text,
            body: 'Здравствуйте! Пришлите, пожалуйста, договор.',
            senderId: 'u-$id',
            createdAt: DateTime(2026, 10, 17, 12),
          ),
        ],
      );

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Badges extends BadgesNotifier {
  @override
  Badges build() => const Badges(chats: 3, notifications: 5);
}

final _root = GlobalKey<NavigatorState>();

GoRouter _router() => GoRouter(
      navigatorKey: _root,
      routes: [
        GoRoute(
          path: '/',
          builder: (_, __) => const Scaffold(body: Text('home')),
        ),
        ...chatRoutes(_root),
      ],
    );

List<Override> _overrides() => [
      ...uxOverrides(translator: const StaticTranslatorRu()),
      chatRepositoryProvider.overrideWithValue(_Chats()),
      groupRepositoryProvider.overrideWithValue(FakeGroupRepository()),
      currentUserIdProvider.overrideWithValue('me'),
      currentUserRoleProvider.overrideWithValue(UserRole.client),
      channelsEnabledProvider.overrideWithValue(false),
      realtimeClientProvider.overrideWithValue(null),
      actsAsAttorneyProvider.overrideWithValue(false),
      blockedIdsProvider.overrideWith((ref) async => <String>{}),
      badgesProvider.overrideWith(_Badges.new),
    ];

Future<GoRouter> _open(
  WidgetTester t,
  Size size, {
  ThemeData? theme,
  String location = ChatRoutes.inbox,
}) async {
  t.view.physicalSize = size;
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.reset);
  adaptiveShellOverride = true;
  addTearDown(() => adaptiveShellOverride = null);
  final router = _router();
  await t.pumpWidget(
    ProviderScope(
      overrides: _overrides(),
      child: MaterialApp.router(
        debugShowCheckedModeBanner: false,
        theme: theme ?? AppTheme.light(),
        routerConfig: router,
        scrollBehavior: const AppScrollBehavior(),
        builder: (context, child) =>
            DesktopShortcuts(onSearch: () {}, child: child!),
      ),
    ),
  );
  await t.pump();
  router.push<void>(location).ignore();
  await _settle(t);
  return router;
}

Future<void> _settle(WidgetTester t) async {
  for (var i = 0; i < 6; i++) {
    await t.pump(const Duration(milliseconds: 200));
  }
}

/// The page on top (pushed pages do not change the browser's address
/// unless go_router is told to; the app leaves that as it was).
String _location(GoRouter r) {
  final top = r.routerDelegate.currentConfiguration.matches.last;
  return top is ImperativeRouteMatch
      ? top.matches.uri.toString()
      : r.routerDelegate.currentConfiguration.uri.toString();
}

Future<void> _dispose(WidgetTester t) async {
  await t.pumpWidget(const SizedBox());
  await t.pump(const Duration(seconds: 1));
}

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

  testWidgets('list | chat: the chat opens beside the list, in place',
      (t) async {
    final router = await _open(t, const Size(1440, 900));
    expect(find.byType(InboxScreen), findsOneWidget);
    expect(find.byKey(const ValueKey('desktop-chat-empty')), findsOneWidget);
    expect(t.getSize(find.byType(AppSideNav)).width, 76);
    for (final item in ['messages', 'notifications']) {
      expect(
        find.byKey(ValueKey('side-nav-count-side-nav-$item')),
        findsOneWidget,
      );
    }
    final listState = t.state(find.byType(InboxScreen));

    await t.tap(find.text('Айбек Беков'));
    await _settle(t);
    expect(_location(router), '/chat/c1');
    expect(find.byType(ConversationScreen), findsOneWidget);
    // The same list (not rebuilt from scratch, scroll and search kept).
    expect(t.state(find.byType(InboxScreen)), same(listState));
    // The chat sits right of the 400 list.
    expect(t.getTopLeft(find.byType(ConversationScreen)).dx, 76 + 400 + 1);

    // Another chat replaces the first; still one page on top of home.
    await t.tap(find.text('Нурлан Асанов'));
    await _settle(t);
    expect(_location(router), '/chat/c3');
    expect(t.state(find.byType(InboxScreen)), same(listState));
    expect(router.routerDelegate.currentConfiguration.matches.length, 2);

    // Alt+↑: the previous chat in the list.
    await t.sendKeyDownEvent(LogicalKeyboardKey.altLeft);
    await t.sendKeyEvent(LogicalKeyboardKey.arrowUp);
    await t.sendKeyUpEvent(LogicalKeyboardKey.altLeft);
    await _settle(t);
    expect(_location(router), '/chat/c2');

    // Esc: back to «no chat open».
    await t.sendKeyEvent(LogicalKeyboardKey.escape);
    await _settle(t);
    expect(_location(router), '/inbox');
    expect(find.byKey(const ValueKey('desktop-chat-empty')), findsOneWidget);
    expect(t.state(find.byType(InboxScreen)), same(listState));
    await _dispose(t);
  });

  testWidgets('tablet 900: the inbox is the phone screen, a chat is pushed',
      (t) async {
    final router = await _open(t, const Size(900, 700));
    expect(find.byKey(const ValueKey('desktop-chat-empty')), findsNothing);
    expect(find.byKey(const ValueKey('side-nav-messages')), findsNothing);
    await t.tap(find.text('Айбек Беков'));
    await _settle(t);
    expect(_location(router), '/chat/c1');
    expect(find.byType(InboxScreen), findsNothing);
    expect(router.routerDelegate.currentConfiguration.matches.length, 3);
    await _dispose(t);
  });

  group('goldens', () {
    // Any other page: the 680 column and the menu with names, Messages and
    // Notifications with their counts (owner Q1).
    for (final (size, name) in [
      (const Size(1440, 900), '1440x900'),
      (const Size(1280, 800), '1280x800'),
    ]) {
      testWidgets('side menu with names, $name', (t) async {
        t.view.physicalSize = size;
        t.view.devicePixelRatio = 1;
        addTearDown(t.view.reset);
        adaptiveShellOverride = true;
        addTearDown(() => adaptiveShellOverride = null);
        await t.pumpWidget(
          uxApp(
            const Scaffold(
              body: WebPageFrame(
                location: '/profile/settings',
                child: Scaffold(body: Center(child: Text('LawBid'))),
              ),
            ),
            theme: AppTheme.light(),
            size: size,
            overrides: _overrides(),
          ),
        );
        await t.pump();
        await expectLater(
          find.byType(MaterialApp),
          matchesGoldenFile('goldens/side_menu_$name.png'),
        );
      });
    }

    for (final (size, name) in [
      (const Size(1440, 900), '1440x900'),
      (const Size(1280, 800), '1280x800'),
    ]) {
      for (final dark in [false, true]) {
        final theme = dark ? AppTheme.dark() : AppTheme.light();
        final tone = dark ? 'dark' : 'light';
        testWidgets('chats, no chat open, $name $tone', (t) async {
          await _open(t, size, theme: theme);
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile('goldens/chats_empty_${name}_$tone.png'),
          );
          await _dispose(t);
        });
        testWidgets('chats, a chat open, $name $tone', (t) async {
          await _open(t, size, theme: theme, location: '/chat/c1');
          await expectLater(
            find.byType(MaterialApp),
            matchesGoldenFile('goldens/chats_open_${name}_$tone.png'),
          );
          await _dispose(t);
        });
      }
    }
  });
}
