import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/navigation/app_router.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/core/navigation/safe_back.dart';
import 'package:lawbid/core/persistence/persistence_providers.dart';
import 'package:lawbid/core/session/session_providers.dart';
import 'package:lawbid/features/channels/channels_routes.dart';
import 'package:lawbid/features/chat/chat_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/plans/presentation/bid_packs_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_profile_edit_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/delete_account_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/firm_screen.dart';
import 'package:lawbid/features/promotions/presentation/my_promotions_screen.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/profile/profile_fakes.dart';
import '../../helpers/onboarding_harness.dart' show FixedUserController;
import '../../helpers/overflow_harness.dart' show AttorneySession;
import '../../helpers/referral_overrides.dart';
import '../../helpers/ux_harness.dart';

/// Row 161 (detective R2-A #2, 14.11): a screen opened by its link, after a
/// web refresh or a payment return stands alone on its navigator. Its back
/// control did nothing (`maybePop`), had no arrow at all (a Material
/// `AppBar` implies none without a page below), or threw «nothing to pop».
/// Now every one leads to its parent screen (go_router's documented
/// `canPop() ? pop() : go(parent)` idiom, `core/navigation/safe_back.dart`).

/// One screen: where its back control lives, the address it is opened at,
/// and the screen back must lead to when it stands alone.
class _Row {
  const _Row(
    this.label,
    this.file,
    this.location,
    this.parent, {
    this.explicit = false,
  });

  final String label;
  final String file;
  final String location;
  final String parent;

  /// The screen names its parent (`safeBack(fallback: …)`), as the nearest
  /// shorter path is not the logical one.
  final bool explicit;
}

const _rows = <_Row>[
  _Row(
    'account: change phone/email',
    'features/settings/account/presentation/screens/account_contact_flow_screen.dart',
    '/profile/settings/account/contact/phone',
    '/profile/settings/account',
  ),
  _Row(
    'active devices',
    'features/settings/active_devices/presentation/active_devices_screen.dart',
    AppRoutes.activeDevices,
    AppRoutes.profileSettings,
  ),
  _Row(
    'chats archive',
    'features/chat/presentation/archive_screen.dart',
    ChatRoutes.archive,
    ChatRoutes.inbox,
  ),
  _Row(
    'chats (inbox)',
    'features/chat/presentation/inbox_screen.dart',
    ChatRoutes.inbox,
    AppRoutes.feed,
  ),
  _Row(
    'chat conversation',
    'features/chat/presentation/desktop_chats.dart',
    '/chat/c1',
    ChatRoutes.inbox,
    explicit: true,
  ),
  _Row(
    'create post',
    'features/social/presentation/screens/create_post_screen.dart',
    AppRoutes.create,
    AppRoutes.feed,
  ),
  _Row(
    'create (after publishing)',
    'features/create/presentation/screens/create_screen.dart',
    AppRoutes.create,
    AppRoutes.feed,
  ),
  _Row(
    'verification wizard',
    'features/verification/presentation/screens/verification_wizard_screen.dart',
    AppRoutes.verificationWizard,
    AppRoutes.verification,
  ),
  _Row(
    'review form',
    'features/profile/presentation/screens/review_form_screen.dart',
    '/profile/review/c1',
    AppRoutes.profile,
  ),
  _Row(
    'tasks archive',
    'features/team/presentation/tasks_tab.dart',
    '/tasks/archive',
    AppRoutes.mine,
    explicit: true,
  ),
  _Row(
    'phone contacts',
    'features/contacts_sync/presentation/contacts_screen.dart',
    AppRoutes.contacts,
    AppRoutes.profileSettings,
  ),
  _Row(
    'legal document',
    'features/onboarding/presentation/screens/legal_document_screen.dart',
    '/legal/terms',
    AppRoutes.feed,
  ),
  _Row(
    'story viewer',
    'features/stories/presentation/story_viewer_screen.dart',
    '/stories/view/u1',
    AppRoutes.feed,
  ),
  _Row(
    'delete account',
    'features/profile/presentation/screens/delete_account_screen.dart',
    AppRoutes.deleteAccount,
    AppRoutes.profileSettings,
  ),
  _Row(
    'settings',
    'features/profile/presentation/screens/settings_screen.dart',
    AppRoutes.profileSettings,
    AppRoutes.profile,
  ),
  _Row(
    'attorney profile edit',
    'features/profile/presentation/screens/attorney_profile_edit_screen.dart',
    AppRoutes.profileEdit,
    AppRoutes.profile,
  ),
  _Row(
    'client profile edit',
    'features/profile/presentation/screens/client_profile_edit_screen.dart',
    AppRoutes.profileEdit,
    AppRoutes.profile,
  ),
  _Row(
    'channel',
    'features/channels/presentation/channel_screen.dart',
    '/c/lawbid',
    ChannelsRoutes.list,
    explicit: true,
  ),
  _Row(
    'channels',
    'features/channels/presentation/channels_screen.dart',
    ChannelsRoutes.list,
    AppRoutes.feed,
  ),
  _Row(
    'channels archive',
    'features/channels/presentation/sections_archive.dart',
    ChannelsRoutes.archive,
    ChannelsRoutes.list,
  ),
  _Row(
    'channel admins (channels gate)',
    'features/channels/presentation/channel_widgets.dart',
    '/channels/ch1/admins',
    '/channels/ch1',
  ),
  _Row(
    'channel composer',
    'features/channels/presentation/channel_composer_screen.dart',
    '/channels/ch1/compose',
    '/channels/ch1',
  ),
  _Row(
    'channel form',
    'features/channels/presentation/channel_form_screen.dart',
    '/channels/ch1/edit',
    '/channels/ch1',
  ),
  _Row(
    'create group',
    'features/groups/presentation/create_group_screen.dart',
    '/group/new',
    ChatRoutes.inbox,
    explicit: true,
  ),
  _Row(
    'any lazy screen while loading (deferred screen)',
    'core/navigation/deferred_screen.dart',
    AppRoutes.stars,
    AppRoutes.profileSettings,
  ),
  _Row(
    'bid packs',
    'features/plans/presentation/bid_packs_screen.dart',
    AppRoutes.bidPacks,
    AppRoutes.profileSettings,
  ),
  _Row(
    'stars',
    'features/stars/presentation/stars_screen.dart',
    AppRoutes.stars,
    AppRoutes.profileSettings,
  ),
  _Row(
    'my gifts',
    'features/stars/presentation/my_gifts_screen.dart',
    AppRoutes.myGifts,
    AppRoutes.stars,
  ),
  _Row(
    'post insights',
    'features/social/presentation/screens/post_insights_screen.dart',
    '/post/p1/insights',
    '/post/p1',
  ),
  _Row(
    'attorney stats',
    'features/profile/presentation/screens/attorney_stats_screen.dart',
    AppRoutes.myStats,
    AppRoutes.profileSettings,
  ),
  _Row(
    'promotion stats',
    'features/promotions/presentation/promotion_stats_screen.dart',
    '/profile/settings/promotions/pr1',
    AppRoutes.myPromotions,
  ),
  _Row(
    'my promotions',
    'features/promotions/presentation/my_promotions_screen.dart',
    AppRoutes.myPromotions,
    AppRoutes.profileSettings,
  ),
  _Row(
    'firm',
    'features/profile/presentation/screens/firm_screen.dart',
    AppRoutes.myFirm,
    AppRoutes.profileSettings,
  ),
];

/// The old back controls that are dead when the screen stands alone.
final _dead = <RegExp>[
  // An arrow that only pops: nothing to pop after a refresh.
  RegExp(
    r'onPressed: (?:\w+ \? (?:null|\(\) \{\}) : )?\(\) =>\s*'
    r'Navigator\.of\(context\)\.maybePop\(\)',
  ),
  RegExp(r'widget\.onBack \?\?\s*\(\) =>\s*Navigator\.of\(context\)'),
  // `canPop() ? pop() : maybePop()` — the fallback pops nothing as well.
  RegExp(r'context\.pop\(\)\s*:\s*Navigator\.of\(context\)\.maybePop\(\)'),
  RegExp(r'\} else \{\s*Navigator\.of\(context\)\.maybePop\(\);\s*\}'),
  RegExp(r'if \(!_c\.back\(\)\) Navigator\.of\(context\)\.maybePop\(\)'),
  RegExp(r'_step = 0\);\s*\} else \{\s*unawaited\(Navigator'),
  // After saving / leaving: a lone screen stayed open.
  RegExp(r'if \(mounted\) Navigator\.of\(context\)\.(?:maybePop|pop)\(\);'),
  RegExp(r'await Navigator\.of\(context\)\.maybePop\(true\)'),
  // A Material AppBar alone on its page shows no back arrow at all.
  RegExp(r'appBar: AppBar\(\s*title:'),
  RegExp(r'leading: const BackButton\(\)'),
];

/// A signed-in attorney (or client) with no network, as the overflow tests.
Future<List<Override>> _overrides({bool client = false}) async {
  SharedPreferences.setMockInitialValues({});
  final prefs = await SharedPreferences.getInstance();
  return [
    ...uxOverrides(),
    sharedPreferencesProvider.overrideWithValue(prefs),
    referralOffOverride,
    partnerOffOverride,
    templatesOffOverride,
    sessionControllerProvider.overrideWith(
      () => AttorneySession(role: client ? 'client' : 'attorney'),
    ),
    currentUserControllerProvider.overrideWith(
      () => FixedUserController(
        CurrentUserState.ready(client ? clientMe() : attorneyMe()),
      ),
    ),
    assistantMeProvider.overrideWith(_NoAssistant.new),
  ];
}

class _NoAssistant extends AssistantMeController {
  @override
  Future<AssistantMe> build() async => AssistantMe.none;
}

void main() {
  setUpAll(initializeDateFormatting);

  group('row 161: every back control of the 35 screens leads to a parent', () {
    for (final row in _rows) {
      test('${row.label}: no dead back control in ${row.file}', () {
        final src = File('lib/${row.file}').readAsStringSync();
        final dead = [
          for (final re in _dead)
            if (re.hasMatch(src)) re.firstMatch(src)![0],
        ];
        expect(dead, isEmpty, reason: 'dead back control in ${row.file}');
        expect(
          src.contains(RegExp(r'safeBack(?:Leading)?\(|safeLeave\(')),
          isTrue,
          reason: '${row.file} must use core/navigation/safe_back.dart',
        );
      });
    }
  });

  test('row 161: on the real route table each screen has its parent', () async {
    final container = ProviderContainer(overrides: await _overrides());
    addTearDown(container.dispose);
    final sub = container.listen(appRouterProvider, (_, __) {});
    addTearDown(sub.close);
    final config = sub.read().configuration;
    bool known(String path) {
      final m = config.findMatch(Uri.parse(path));
      return m.isNotEmpty && !m.isError;
    }

    final wrong = <String>[];
    for (final row in _rows) {
      if (!known(row.location)) {
        wrong.add('${row.label}: ${row.location} is not a route');
        continue;
      }
      if (!known(row.parent)) {
        wrong.add('${row.label}: parent ${row.parent} is not a route');
        continue;
      }
      if (row.explicit) {
        final src = File('lib/${row.file}').readAsStringSync();
        if (!src.contains('safeBack(fallback: ')) {
          wrong.add('${row.label}: names no parent');
        }
        continue;
      }
      final parent = parentPathOf(config, Uri.parse(row.location));
      if (parent != row.parent) {
        wrong.add('${row.label}: back goes to $parent, not ${row.parent}');
      }
    }
    expect(wrong, isEmpty);
  });

  group('row 161: real screens opened by their link go back to the parent', () {
    Future<void> pumpAlone(
      WidgetTester tester, {
      required String location,
      required String parent,
      required Widget screen,
      bool client = false,
    }) async {
      tester.view.physicalSize = const Size(390, 844) * 3;
      tester.view.devicePixelRatio = 3;
      addTearDown(tester.view.reset);
      final router = GoRouter(
        initialLocation: location,
        routes: [
          GoRoute(
            path: AppRoutes.feed,
            builder: (_, __) => const Scaffold(body: Text('FEED')),
          ),
          GoRoute(
            path: parent,
            builder: (_, __) => const Scaffold(body: Text('PARENT')),
          ),
          GoRoute(path: location, builder: (_, __) => screen),
        ],
      );
      addTearDown(router.dispose);
      await tester.pumpWidget(
        ProviderScope(
          overrides: await _overrides(client: client),
          child: MaterialApp.router(
            debugShowCheckedModeBanner: false,
            theme: AppTheme.of(AppThemeId.day),
            routerConfig: router,
          ),
        ),
      );
      await tester.pump();
      await tester.pump(const Duration(milliseconds: 600));
    }

    Future<void> tapBack(WidgetTester tester) async {
      final back = find.byType(AppBackButton).evaluate().isNotEmpty
          ? find.byType(AppBackButton)
          : find.byType(BackButton);
      expect(back, findsWidgets, reason: 'the screen shows a back arrow');
      await tester.tap(back.first);
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
    }

    Future<void> finish(WidgetTester tester) async {
      await tester.pumpWidget(const SizedBox());
      await tester.pump(const Duration(minutes: 5));
    }

    final cases = <String, (String, String, Widget Function(), bool)>{
      'delete account (attorney)': (
        AppRoutes.deleteAccount,
        AppRoutes.profileSettings,
        () => const DeleteAccountScreen(),
        false,
      ),
      'delete account (client)': (
        AppRoutes.deleteAccount,
        AppRoutes.profileSettings,
        () => const DeleteAccountScreen(),
        true,
      ),
      'client profile edit': (
        AppRoutes.profileEdit,
        AppRoutes.profile,
        () => const ClientProfileEditScreen(),
        true,
      ),
      'firm (Material bar)': (
        AppRoutes.myFirm,
        AppRoutes.profileSettings,
        () => const FirmScreen(),
        false,
      ),
      'bid packs (Material bar)': (
        AppRoutes.bidPacks,
        AppRoutes.profileSettings,
        () => const BidPacksScreen(),
        false,
      ),
      'my promotions (Material bar)': (
        AppRoutes.myPromotions,
        AppRoutes.profileSettings,
        () => const MyPromotionsScreen(),
        false,
      ),
    };

    for (final MapEntry(key: label, value: (location, parent, build, client))
        in cases.entries) {
      testWidgets(label, (tester) async {
        await pumpAlone(
          tester,
          location: location,
          parent: parent,
          screen: build(),
          client: client,
        );
        expect(find.text('PARENT'), findsNothing);
        await tapBack(tester);
        expect(find.text('PARENT'), findsOneWidget);
        expect(tester.takeException(), isNull);
        await finish(tester);
      });
    }
  });
}
