import 'dart:async';
import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/app_language.dart';
import 'package:lawbid/core/l10n/l10n_translator.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/chat/application/realtime_providers.dart';
import 'package:lawbid/features/notifications/application/notifications_providers.dart';
import 'package:lawbid/features/notifications/application/system_notifications.dart';
import 'package:lawbid/features/notifications/data/notifications_repository.dart';
import 'package:lawbid/features/notifications/presentation/notification_settings_screen.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/user_role.dart';

import '../../helpers/long_locale.dart';
import '../../helpers/pending_strings.dart';
import '../../helpers/ux_harness.dart';

/// The server's switches (apps/api notification-topics.ts), in its order.
List<TopicSetting> _topics() => const [
      TopicSetting(key: 'messages', block: 'chats', push: true),
      TopicSetting(key: 'groups', block: 'chats', push: true),
      TopicSetting(key: 'channels', block: 'chats', push: true),
      TopicSetting(key: 'calls', block: 'chats', push: true),
      TopicSetting(key: 'chatMentions', block: 'chats', push: true),
      TopicSetting(key: 'likes', block: 'feed', push: true),
      TopicSetting(key: 'comments', block: 'feed', push: true),
      TopicSetting(key: 'replies', block: 'feed', push: true),
      TopicSetting(key: 'followers', block: 'feed', push: true),
      TopicSetting(key: 'mentions', block: 'feed', push: true),
      TopicSetting(key: 'reactions', block: 'feed', push: true),
      TopicSetting(key: 'following', block: 'feed', push: false),
      TopicSetting(key: 'bidNew', block: 'bids', push: true),
      TopicSetting(key: 'bidDecision', block: 'bids', push: true),
      TopicSetting(
        key: 'newCases',
        block: 'cases',
        push: false,
        attorneyOnly: true,
      ),
      TopicSetting(
        key: 'legalQa',
        block: 'cases',
        push: false,
        attorneyOnly: true,
      ),
      TopicSetting(key: 'caseMessages', block: 'cases', push: true),
      TopicSetting(key: 'caseDeadlines', block: 'cases', push: true),
      TopicSetting(key: 'casePayments', block: 'cases', push: true),
      TopicSetting(key: 'caseUpdates', block: 'cases', push: true),
      TopicSetting(key: 'tasks', block: 'cases', push: true),
      TopicSetting(
        key: 'assistants',
        block: 'assistants',
        push: true,
        attorneyOnly: true,
      ),
      TopicSetting(
        key: 'assistantCases',
        block: 'assistants',
        push: true,
        attorneyOnly: true,
        parent: 'assistants',
      ),
      TopicSetting(
        key: 'assistantBids',
        block: 'assistants',
        push: true,
        attorneyOnly: true,
        parent: 'assistants',
      ),
      TopicSetting(
        key: 'assistantTasks',
        block: 'assistants',
        push: true,
        attorneyOnly: true,
        parent: 'assistants',
      ),
      TopicSetting(
        key: 'assistantMessages',
        block: 'assistants',
        push: true,
        attorneyOnly: true,
        parent: 'assistants',
      ),
      TopicSetting(key: 'security', block: 'system', push: true, locked: true),
      TopicSetting(key: 'account', block: 'system', push: true),
      TopicSetting(key: 'partner', block: 'system', push: true),
      TopicSetting(key: 'news', block: 'system', push: true),
    ];

class _Repo implements NotificationsRepository {
  _Repo() : s = NotificationSettings(categories: _cats(), topics: _topics());

  NotificationSettings s;
  final calls = <String>[];

  static List<CategorySetting> _cats() => [
        for (final c in NotifCategory.values)
          CategorySetting(
            category: c,
            push: c != NotifCategory.marketing,
            email: true,
            locked: c == NotifCategory.system,
          ),
      ];

  @override
  Future<NotificationSettings> settings() async => s;

  @override
  Future<Badges> badges() async =>
      Badges(chats: 2, notifications: 1, iconBadge: s.iconBadge);

  @override
  Future<NotificationSettings> setIconBadge({required bool enabled}) async {
    calls.add('icon:$enabled');
    return s = s.copyWith(iconBadge: enabled);
  }

  @override
  Future<NotificationSettings> updateTopics(List<TopicSetting> items) async {
    calls.add('topics:${items.map((i) => '${i.key}=${i.push}').join(',')}');
    final by = {for (final i in items) i.key: i};
    // A topic of an old category writes that category (server rule).
    return s = s.copyWith(
      topics: [for (final x in s.topics) by[x.key] ?? x],
      categories: [
        for (final c in s.categories)
          // ignore: prefer_if_elements_to_conditional_expressions
          c.category == NotifCategory.messages && by['messages'] != null
              ? c.copyWith(push: by['messages']!.push)
              : c,
      ],
    );
  }

  @override
  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);
}

/// Every count the app put on its icon (app_badge_plus channel).
final _iconCounts = <int>[];

void _mockIconChannel() {
  TestDefaultBinaryMessengerBinding.instance.defaultBinaryMessenger
      .setMockMethodCallHandler(const MethodChannel('app_badge_plus'),
          (call) async {
    if (call.method == 'isSupported') return true;
    if (call.method == 'updateBadge') {
      _iconCounts.add((call.arguments as Map)['count'] as int);
    }
    return null;
  });
}

List<Override> _overrides(
  _Repo repo, {
  UserRole role = UserRole.attorney,
  Translator? translator,
}) =>
    [
      ...uxOverrides(translator: translator ?? const StaticTranslatorEn()),
      notificationsRepositoryProvider.overrideWithValue(repo),
      currentUserIdProvider.overrideWithValue('u1'),
      currentUserRoleProvider.overrideWithValue(role),
      isAssistantProvider.overrideWithValue(false),
      systemNotificationsEnabledProvider.overrideWith((ref) async => true),
      realtimeEventsProvider
          .overrideWithValue(const Stream<RealtimeEvent>.empty()),
    ];

Widget _app(ProviderContainer c, {Size size = const Size(390, 844)}) =>
    UncontrolledProviderScope(
      container: c,
      child: MaterialApp(
        theme: AppTheme.of(AppThemeId.values.first),
        home: MediaQuery(
          data: MediaQueryData(size: size),
          child: const NotificationSettingsScreen(),
        ),
      ),
    );

bool _switch(WidgetTester t, String key) =>
    t.widget<SwitchListTile>(find.byKey(ValueKey(key))).value;

void _tall(WidgetTester t, {double width = 390}) {
  t.view
    ..devicePixelRatio = 1
    ..physicalSize = Size(width, 4000);
  addTearDown(t.view.reset);
}

void main() {
  setUp(() {
    _iconCounts.clear();
    _mockIconChannel();
  });

  testWidgets(
      'icon counter: off clears the app icon, and the screen opened again '
      '(bell or Profile) shows the same state', (t) async {
    _tall(t);
    final repo = _Repo();
    final c = ProviderContainer(overrides: _overrides(repo));
    addTearDown(c.dispose);
    // The badges are live in the app (the icon shows 3).
    c.listen(badgesProvider, (_, __) {});
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    expect(c.read(badgesProvider).iconCount, 3);
    expect(_iconCounts.last, 3);
    expect(find.text('Badge counter on the app icon'), findsOne);
    expect(_switch(t, 'notif-icon-badge'), isTrue);

    await t.tap(find.byKey(const ValueKey('notif-icon-badge')));
    await t.pumpAndSettle();
    expect(repo.calls, ['icon:false']);
    expect(_switch(t, 'notif-icon-badge'), isFalse);
    // The icon is cleared; the in-app counters stay.
    expect(_iconCounts.last, 0);
    expect(c.read(badgesProvider).iconCount, 0);
    expect(c.read(badgesProvider).total, 3);

    // Opened again from the other place: the same state.
    await t.pumpWidget(const SizedBox());
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    expect(_switch(t, 'notif-icon-badge'), isFalse);

    await t.tap(find.byKey(const ValueKey('notif-icon-badge')));
    await t.pumpAndSettle();
    expect(_iconCounts.last, 3);
  });

  testWidgets('a kind switched off is the one state everywhere', (t) async {
    _tall(t);
    final repo = _Repo();
    final c = ProviderContainer(overrides: _overrides(repo));
    addTearDown(c.dispose);
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    expect(find.text('Likes'), findsOne);
    expect(find.text('Notifications from assistants'), findsOne);

    await t.tap(find.byKey(const ValueKey('notif-topic-likes')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('notif-topic-messages')));
    await t.pumpAndSettle();
    expect(repo.calls, ['topics:likes=false', 'topics:messages=false']);
    // The chimes read the same state (no second copy).
    expect(
      await c.read(mutedCategoriesProvider.future),
      contains(NotifCategory.messages),
    );

    await t.pumpWidget(const SizedBox());
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    expect(_switch(t, 'notif-topic-likes'), isFalse);
    expect(_switch(t, 'notif-topic-comments'), isTrue);
    expect(_switch(t, 'notif-topic-messages'), isFalse);
  });

  testWidgets(
      'opened from the bell and from Profile at once: toggling one updates '
      'the other', (t) async {
    _tall(t);
    final repo = _Repo();
    final c = ProviderContainer(overrides: _overrides(repo));
    addTearDown(c.dispose);
    final nav = GlobalKey<NavigatorState>();
    await t.pumpWidget(
      UncontrolledProviderScope(
        container: c,
        child: MaterialApp(
          navigatorKey: nav,
          theme: AppTheme.of(AppThemeId.values.first),
          // The bell's screen underneath…
          home: const NotificationSettingsScreen(),
        ),
      ),
    );
    await t.pumpAndSettle();
    // …and Profile → Settings → Notifications pushed over it.
    unawaited(
      nav.currentState!.push(
        MaterialPageRoute<void>(
          builder: (_) => const NotificationSettingsScreen(),
        ),
      ),
    );
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('notif-icon-badge')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const ValueKey('notif-topic-replies')));
    await t.pumpAndSettle();
    expect(repo.calls, ['icon:false', 'topics:replies=false']);
    nav.currentState!.pop();
    await t.pumpAndSettle();
    expect(find.byType(NotificationSettingsScreen), findsOne);
    expect(_switch(t, 'notif-icon-badge'), isFalse);
    expect(_switch(t, 'notif-topic-replies'), isFalse);
    expect(_switch(t, 'notif-topic-comments'), isTrue);
    // And back the other way, from the bell's screen.
    await t.tap(find.byKey(const ValueKey('notif-topic-replies')));
    await t.pumpAndSettle();
    final replies = c
        .read(notificationSettingsProvider)
        .requireValue
        .topics
        .firstWhere((x) => x.key == 'replies');
    expect(replies.push, isTrue);
  });

  testWidgets('system serious notices are locked; assistants nest', (t) async {
    _tall(t);
    final repo = _Repo();
    final c = ProviderContainer(overrides: _overrides(repo));
    addTearDown(c.dispose);
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    final security = t.widget<SwitchListTile>(
      find.byKey(const ValueKey('notif-topic-security')),
    );
    expect(security.value, isTrue);
    expect(security.onChanged, isNull);
    expect(
      t
          .widget<SwitchListTile>(
            find.byKey(const ValueKey('notif-topic-news')),
          )
          .onChanged,
      isNotNull,
    );

    await t.tap(find.byKey(const ValueKey('notif-topic-assistants')));
    await t.pumpAndSettle();
    final tasks = t.widget<SwitchListTile>(
      find.byKey(const ValueKey('notif-topic-assistantTasks')),
    );
    // Keeps its own value, greyed out under the off parent.
    expect(tasks.value, isTrue);
    expect(tasks.onChanged, isNull);
  });

  testWidgets('a client sees no attorney blocks', (t) async {
    _tall(t);
    final c = ProviderContainer(
      overrides: _overrides(_Repo(), role: UserRole.client),
    );
    addTearDown(c.dispose);
    await t.pumpWidget(_app(c));
    await t.pumpAndSettle();
    expect(find.byKey(const ValueKey('notif-block-assistants')), findsNothing);
    expect(find.byKey(const ValueKey('notif-topic-newCases')), findsNothing);
    expect(find.byKey(const ValueKey('notif-topic-likes')), findsOne);
  });

  test('the bell and Profile → Settings open this one screen', () {
    // 29b: one screen, one state — both entry points push the same route.
    const route = 'ChatRoutes.notificationSettings';
    for (final f in [
      'lib/features/profile/presentation/screens/settings_screen.dart',
      'lib/features/chat/presentation/inbox_screen.dart',
    ]) {
      expect(File(f).readAsStringSync(), contains(route), reason: f);
    }
  });

  group('overflow 360 dp', () {
    final locales = <String, (Translator, TextDirection)>{
      'ru': (
        L10nTranslator(language: AppLanguage.ru, cache: const {}),
        TextDirection.ltr,
      ),
      'ne': (withPending(ShippedTranslator('ne'), 'ne'), TextDirection.ltr),
      'ar': (withPending(ShippedTranslator('ar'), 'ar'), TextDirection.rtl),
      'de': (withPending(ShippedTranslator('de'), 'de'), TextDirection.ltr),
      'mr': (withPending(ShippedTranslator('mr'), 'mr'), TextDirection.ltr),
      'longest': (withPending(LongestTranslator(), null), TextDirection.ltr),
    };
    for (final id in AppThemeId.values) {
      for (final scale in [1.0, 1.1]) {
        for (final e in locales.entries) {
          testWidgets('${id.name} ${e.key} x$scale', (t) async {
            t.view
              ..devicePixelRatio = 1
              ..physicalSize = const Size(360, 4200);
            addTearDown(t.view.reset);
            final (tr, dir) = e.value;
            final c = ProviderContainer(
              overrides: _overrides(_Repo(), translator: tr),
            );
            addTearDown(c.dispose);
            await t.pumpWidget(
              UncontrolledProviderScope(
                container: c,
                child: MaterialApp(
                  theme: AppTheme.of(id),
                  home: MediaQuery(
                    data: MediaQueryData(
                      size: const Size(360, 4200),
                      textScaler: TextScaler.linear(scale),
                      disableAnimations: true,
                    ),
                    child: Directionality(
                      textDirection: dir,
                      child: const NotificationSettingsScreen(),
                    ),
                  ),
                ),
              ),
            );
            await t.pumpAndSettle();
            expect(t.takeException(), isNull);
            expect(find.byKey(const ValueKey('notif-icon-badge')), findsOne);
            expect(find.byKey(const ValueKey('notif-topic-news')), findsOne);
          });
        }
      }
    }
  });
}
