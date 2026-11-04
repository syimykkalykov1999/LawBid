import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/feature_flags/default_feature_flags.dart';
import 'package:lawbid/core/feature_flags/feature_flags_providers.dart';
import 'package:lawbid/core/feature_flags/feature_flags_state.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/client_public_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/profile_screen.dart';

import 'profile_fakes.dart';

/// Owner 2026-11-04 05:15 (R-381): «Для клиентов вкладка рилсов в профиле
/// тоже убирается, когда выключу, и добавляется, когда включу». By the
/// role of the profile shown, not the viewer's; attorneys keep the tab.
class _Flags extends FeatureFlagsController {
  _Flags({required this.clientReels});

  final bool clientReels;

  @override
  FeatureFlagsState build() => FeatureFlagsState(
        flags: {...defaultFeatureFlags}
          ..['video_posts'] = true
          ..['reels_client_publish'] = clientReels,
        appConfig: const {},
      );

  @override
  Future<void> refreshInBackground({
    String? knownVersion,
    Map<String, bool>? flags,
  }) async {}
}

Future<void> _pump(
  WidgetTester tester,
  Widget screen, {
  required CurrentUser user,
  required bool clientReels,
}) async {
  tester.view.physicalSize = const Size(390, 844) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final wrap = await profileWrapper(
    AppTheme.light(),
    user: user,
    overrides: <Override>[
      ...profileOverrides(),
      featureFlagsControllerProvider
          .overrideWith(() => _Flags(clientReels: clientReels)),
    ],
  );
  await tester.pumpWidget(wrap(screen));
  await tester.pumpAndSettle();
}

Future<void> _teardown(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

void main() {
  setUpAll(initializeDateFormatting);

  final clientReelsTab = find.byKey(const ValueKey('client-tab-reels'));

  testWidgets('switch off: no «Рилсы» tab on the own client profile', (
    tester,
  ) async {
    await _pump(
      tester,
      const ProfileScreen(),
      user: clientMe(),
      clientReels: false,
    );
    expect(find.byKey(const ValueKey('client-tab-posts')), findsOneWidget);
    expect(clientReelsTab, findsNothing);
    expect(find.byKey(const ValueKey('client-tab-reposts')), findsOneWidget);
    expect(find.byKey(const ValueKey('client-tab-reviews')), findsOneWidget);
    await _teardown(tester);
  });

  testWidgets(
      'switch off: no «Рилсы» tab on a client profile an attorney '
      'opens', (tester) async {
    await _pump(
      tester,
      const ClientPublicProfileScreen(username: 'mini.client'),
      user: attorneyMe(),
      clientReels: false,
    );
    expect(find.byKey(const ValueKey('client-tab-posts')), findsOneWidget);
    expect(clientReelsTab, findsNothing);
    await _teardown(tester);
  });

  testWidgets('switch on: the «Рилсы» tab is back', (tester) async {
    await _pump(
      tester,
      const ProfileScreen(),
      user: clientMe(),
      clientReels: true,
    );
    expect(clientReelsTab, findsOneWidget);
    await _teardown(tester);
  });

  testWidgets("switch off: an attorney's profile keeps «Рилсы»", (
    tester,
  ) async {
    await _pump(
      tester,
      const AttorneyProfileScreen(username: 'jane.doe'),
      user: clientMe(),
      clientReels: false,
    );
    expect(find.byKey(const ValueKey('profile-tab-reels')), findsOneWidget);
    await _teardown(tester);
  });
}
