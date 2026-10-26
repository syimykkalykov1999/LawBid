import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/chat/application/presence_providers.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/presentation/screens/settings_screen.dart';
import 'package:lawbid/features/support/application/support_providers.dart';

import '../../helpers/referral_overrides.dart';
import 'profile_fakes.dart';

class _ActivityOn extends ActivityStatusNotifier {
  @override
  Future<bool> build() async => true;
}

final List<Override> _quiet = [
  referralOffOverride,
  promotionsOffOverride,
  partnerOffOverride,
  templatesOffOverride,
  activityStatusProvider.overrideWith(_ActivityOn.new),
  supportUnreadProvider.overrideWithValue(false),
];

Future<void> pumpSettings(WidgetTester tester, CurrentUser user) async {
  tester.view.physicalSize = const Size(390, 2400) * 3;
  tester.view.devicePixelRatio = 3;
  addTearDown(tester.view.reset);
  final wrap = await profileWrapper(
    AppTheme.light(),
    user: user,
    overrides: _quiet,
  );
  await tester.pumpWidget(wrap(const SettingsScreen()));
  await tester.pumpAndSettle();
}

Future<void> tearDownSettings(WidgetTester tester) async {
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(Duration.zero);
}

/// Owner 2026-10-22 (product audit #4): Settings rows that must be the same
/// for both roles.
void main() {
  group('password after the code is optional (§2)', () {
    for (final (role, user) in [
      ('client', clientMe(passwordRequired: true)),
      ('attorney', attorneyMe(passwordRequired: true)),
    ]) {
      testWidgets('$role without a password: «Set a password»',
          (tester) async {
        await pumpSettings(tester, user);
        expect(
          find.byKey(const ValueKey('settings-set-password')),
          findsOneWidget,
        );
        expect(
          find.byKey(const ValueKey('settings-change-password')),
          findsNothing,
        );
        await tearDownSettings(tester);
      });
    }

    testWidgets('with a password: «Change password»', (tester) async {
      await pumpSettings(tester, clientMe());
      expect(
        find.byKey(const ValueKey('settings-change-password')),
        findsOneWidget,
      );
      expect(find.byKey(const ValueKey('settings-set-password')), findsNothing);
      await tearDownSettings(tester);
    });
  });
}
