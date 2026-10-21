import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/channels/application/channels_providers.dart';
import 'package:lawbid/features/channels/domain/channel_models.dart';
import 'package:lawbid/features/chat/application/chat_providers.dart';
import 'package:lawbid/features/chat/application/post_share.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/chat/data/chat_repository.dart';
import 'package:lawbid/features/chat/domain/chat_models.dart';
import 'package:lawbid/features/groups/application/group_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/post_sheets.dart';
import 'package:lawbid/features/stories/application/stories_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';
import 'package:lawbid_api/lawbid_api.dart' as api;

import '../../helpers/long_locale.dart';
import '../../helpers/pending_strings.dart';
import '../../helpers/ux_harness.dart';
import '../channels/channels_fakes.dart' show fakeChannel;
import '../groups/fake_group_repository.dart';
import '../social/social_fakes.dart';

Conversation _conv(
  String id,
  String name, {
  ConversationStatus status = ConversationStatus.active,
  bool blocked = false,
  MessageRequest request = MessageRequest.none,
}) =>
    Conversation(
      id: id,
      caseId: null,
      caseTitle: null,
      status: status,
      contactsUnlocked: true,
      counterpart: Counterpart(
        isAttorney: true,
        verified: false,
        id: 'u-$id',
        displayName: name,
      ),
      unreadCount: 0,
      updatedAt: DateTime(2026),
      isDirect: true,
      blocked: blocked,
      request: request,
    );

class _Chats implements ChatRepository {
  final queries = <String?>[];

  @override
  Future<CursorPage<Conversation>> conversations({
    String? cursor,
    DateTime? updatedSince,
    bool requests = false,
    ChatListFolder folder = ChatListFolder.all,
    String? q,
  }) async {
    queries.add(q);
    final all = [
      _conv('a', 'Anna Petrova-Konstantinopoulou'),
      _conv('b', 'Boris Ivanov'),
      _conv('c', 'Closed Carl', status: ConversationStatus.closed),
      _conv('d', 'Blocked Dora', blocked: true),
      _conv('e', 'Pending Egor', request: MessageRequest.pending),
      for (var i = 0; i < 9; i++) _conv('x$i', 'Maximilian Featherstone $i'),
    ];
    if (q == null) return CursorPage(items: all);
    return CursorPage(
      items: [
        for (final c in all)
          if (c.counterpart.displayName!.toLowerCase().contains(q)) c,
      ],
    );
  }

  @override
  Future<({int waiting, int requests, int cases, int archived})>
      folderCounts() async => (waiting: 0, requests: 0, cases: 0, archived: 0);

  @override
  dynamic noSuchMethod(Invocation invocation) => Future<void>.value();
}

class _Sender implements PostShareSender {
  final chats = <(String, String, String?)>[];
  final groups = <(String, String, String?)>[];
  final channels = <(String, String, String?)>[];

  @override
  Future<void> toChat(
    String conversationId,
    String postId, {
    String? note,
  }) async =>
      chats.add((conversationId, postId, note));

  @override
  Future<void> toGroup(api.GroupDto group, String link, {String? note}) async =>
      groups.add((group.id, link, note));

  @override
  Future<void> toChannel(String channelId, String link, {String? note}) async =>
      channels.add((channelId, link, note));
}

class _Social extends FakeSocialRepository {
  final shares = <String>[];

  @override
  Future<void> recordPostShare(String postId) async => shares.add(postId);
}

api.GroupDto _group(String id, String title, {required bool canPost}) =>
    api.GroupDto(
      id: id,
      title: title,
      memberCount: 12,
      type: api.GroupType.private,
      joinApproval: false,
      topicsEnabled: false,
      pendingRequests: 0,
      myRole: api.GroupRole.member,
      whoCanPost: api.GroupWho.all,
      whoCanAdd: api.GroupWho.all,
      whoCanEditInfo: api.GroupWho.admins,
      whoCanCall: api.GroupWho.all,
      showServiceMessages: true,
      whoCanMedia: api.GroupWho.all,
      whoCanPoll: api.GroupWho.all,
      whoCanPin: api.GroupWho.admins,
      myRights: const [],
      canPost: canPost,
      canAdd: true,
      canEditInfo: false,
      canCall: true,
      isAdmin: false,
      inviteEnabled: true,
      unreadCount: 0,
      unreadMentions: 0,
      callsMuted: false,
      pinned: false,
      createdAt: DateTime(2026),
      updatedAt: DateTime(2026),
    );

void main() {
  setUpAll(initializeDateFormatting);

  final post = fakePost('p1');

  Future<
      ({
        _Sender sender,
        _Social social,
        _Chats chats,
        List<ChannelListKey> keys
      })> open(
    WidgetTester tester, {
    Translator translator = const StaticTranslatorEn(),
    ThemeData? theme,
    TextDirection dir = TextDirection.ltr,
    double scale = 1,
  }) async {
    useNarrowPhone(tester);
    final sender = _Sender();
    final social = _Social();
    final chats = _Chats();
    final keys = <ChannelListKey>[];
    final overrides = <Override>[
      ...uxOverrides(translator: translator, social: social),
      chatRepositoryProvider.overrideWithValue(chats),
      realtimeClientProvider.overrideWithValue(null),
      currentUserIdProvider.overrideWithValue('me'),
      groupRepositoryProvider.overrideWithValue(
        FakeGroupRepository([
          _group(
            'g1',
            'Tenants of Brooklyn Heights Association',
            canPost: true,
          ),
          _group('g2', 'Read-only announcements', canPost: false),
        ]),
      ),
      channelListProvider.overrideWith((ref, key) async {
        keys.add(key);
        if (key.scope != ChannelScope.managed) return const [];
        return [
          fakeChannel(
            title: 'Immigration law weekly digest for families',
            role: ChannelRole.admin,
          ),
        ];
      }),
      postShareSenderProvider.overrideWithValue(sender),
      storiesEnabledProvider.overrideWithValue(true),
    ];
    await tester.pumpWidget(
      ProviderScope(
        overrides: overrides,
        child: MaterialApp(
          debugShowCheckedModeBanner: false,
          theme: theme ?? AppTheme.light(),
          builder: (context, child) => Directionality(
            textDirection: dir,
            child: MediaQuery(
              data: MediaQuery.of(context).copyWith(
                textScaler: TextScaler.linear(scale),
                disableAnimations: true,
              ),
              child: child!,
            ),
          ),
          home: Scaffold(
            body: Consumer(
              builder: (context, ref, _) => Center(
                child: TextButton(
                  onPressed: () => unawaited(sharePost(context, ref, post)),
                  child: const Text('share'),
                ),
              ),
            ),
          ),
        ),
      ),
    );
    await tester.tap(find.text('share'));
    await tester.pumpAndSettle();
    return (sender: sender, social: social, chats: chats, keys: keys);
  }

  Finder chat(String id) => find.byKey(ValueKey('share-to-chat-$id'));

  testWidgets(
      'pick two chats, a group and a channel, add a note, send: one card '
      'per chat, the link to the group / channel, the share counted once',
      (tester) async {
    final r = await open(tester);
    // Chats I can write in only.
    expect(chat('a'), findsOneWidget);
    expect(chat('b'), findsOneWidget);
    expect(chat('c'), findsNothing);
    expect(chat('d'), findsNothing);
    expect(chat('e'), findsNothing);
    // Nothing picked: the actions row.
    expect(find.byKey(const ValueKey('share-system')), findsOneWidget);
    expect(find.byKey(const ValueKey('share-story')), findsOneWidget);
    expect(find.byKey(const ValueKey('share-copy')), findsOneWidget);
    expect(find.byKey(const ValueKey('share-whatsapp')), findsOneWidget);

    await tester.tap(chat('a'));
    await tester.tap(chat('b'));
    await tester.pump();
    expect(find.byKey(const ValueKey('share-to-send')), findsOneWidget);
    expect(find.byKey(const ValueKey('share-system')), findsNothing);

    await tester.tap(find.text('Communities'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('share-to-group-g1')), findsOneWidget);
    // A group where I cannot write is not offered.
    expect(find.byKey(const ValueKey('share-to-group-g2')), findsNothing);
    await tester.tap(find.byKey(const ValueKey('share-to-group-g1')));
    await tester.pump();

    // Swipe to Channels: only the ones I run.
    await tester.drag(
      find.byKey(const ValueKey('share-to-groups')),
      const Offset(-300, 0),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('share-to-channel-ch-1')), findsOneWidget);
    expect(r.keys.every((k) => k.scope == ChannelScope.managed), isTrue);
    await tester.tap(find.byKey(const ValueKey('share-to-channel-ch-1')));
    await tester.pump();

    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('share-to-note')),
        matching: find.byType(EditableText),
      ),
      'Look at this',
    );
    await tester.tap(find.byKey(const ValueKey('share-to-send')));
    await tester.pumpAndSettle();

    expect(r.sender.chats, [
      ('a', 'p1', 'Look at this'),
      ('b', 'p1', 'Look at this'),
    ]);
    expect(r.sender.groups.single.$1, 'g1');
    expect(r.sender.groups.single.$2, contains('/post/p1'));
    expect(r.sender.channels.single.$1, 'ch-1');
    expect(r.social.shares, ['p1']);
    // The sheet is closed.
    expect(find.byKey(const ValueKey('share-to-send')), findsNothing);
  });

  testWidgets('swipe Groups -> Channels and back, and on to Chats',
      (tester) async {
    await open(tester);
    await tester.tap(find.text('Communities'));
    await tester.pumpAndSettle();
    await tester.drag(
      find.byKey(const ValueKey('share-to-groups')),
      const Offset(-300, 0),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('share-to-channel-ch-1')), findsOneWidget);
    await tester.drag(
      find.byKey(const ValueKey('share-to-channels')),
      const Offset(300, 0),
    );
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('share-to-group-g1')), findsOneWidget);
    // On Groups a swipe back goes on to Chats.
    await tester.drag(
      find.byKey(const ValueKey('share-to-groups')),
      const Offset(300, 0),
    );
    await tester.pumpAndSettle();
    expect(chat('a'), findsOneWidget);
    expect(find.byKey(const ValueKey('share-to-group-g1')), findsNothing);
  });

  testWidgets('search asks the server for chats and filters the groups',
      (tester) async {
    final r = await open(tester);
    await tester.enterText(
      find.descendant(
        of: find.byKey(const ValueKey('share-to-search')),
        matching: find.byType(EditableText),
      ),
      'boris',
    );
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(r.chats.queries, contains('boris'));
    expect(chat('b'), findsOneWidget);
    expect(chat('a'), findsNothing);
    await tester.tap(find.text('Communities'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('share-to-group-g1')), findsNothing);
    expect(find.text('Nothing found'), findsWidgets);
  });

  testWidgets('closing the sheet counts nothing', (tester) async {
    final r = await open(tester);
    await tester.tapAt(const Offset(180, 20));
    await tester.pumpAndSettle();
    expect(r.social.shares, isEmpty);
    expect(r.sender.chats, isEmpty);
  });

  // Owner rule: 4 themes x longest / ru / ne / ar / de / mr at 360 dp, x1 and x1.1.
  final locales = <String, (Translator, TextDirection)>{
    'longest': (
      PendingTranslator.of(LongestTranslator(), 'share', 'longest'),
      TextDirection.ltr,
    ),
    'ru': (
      PendingTranslator.of(
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        'share',
        'ru',
      ),
      TextDirection.ltr,
    ),
    'ne': (
      PendingTranslator.of(ShippedTranslator('ne'), 'share', 'ne'),
      TextDirection.ltr,
    ),
    'ar': (
      PendingTranslator.of(ShippedTranslator('ar'), 'share', 'ar'),
      TextDirection.rtl,
    ),
    'de': (
      PendingTranslator.of(ShippedTranslator('de'), 'share', 'de'),
      TextDirection.ltr,
    ),
    'mr': (
      PendingTranslator.of(ShippedTranslator('mr'), 'share', 'mr'),
      TextDirection.ltr,
    ),
  };
  for (final theme in AppThemeId.values) {
    for (final MapEntry(key: name, value: (t, dir)) in locales.entries) {
      for (final scale in [1.0, 1.1]) {
        testWidgets('no overflow at 360 dp: ${theme.name}, $name, x$scale',
            (tester) async {
          await open(
            tester,
            translator: t,
            theme: AppTheme.of(theme),
            dir: dir,
            scale: scale,
          );
          expect(tester.takeException(), isNull);
          // The send panel.
          await tester.tap(chat('a'));
          await tester.pump();
          expect(tester.takeException(), isNull);
          // Communities: groups and channels.
          await tester.tap(find.text(t.t('share.to.communities')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
          await tester.tap(find.text(t.t('share.to.channels')));
          await tester.pumpAndSettle();
          expect(tester.takeException(), isNull);
        });
      }
    }
  }
}
