import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

/// Texts of the verification gate live in the synced bundle.
class _Tr extends StaticTranslatorEn {
  const _Tr();

  @override
  String t(String key, [Map<String, String>? params]) =>
      key.startsWith('gate.') || key.startsWith('search.recommended')
          ? key
          : super.t(key, params);
}

/// Owner 2026-10-28: Search behaves the same in both roles where the
/// screen is the same (People, Posts, Topics — one matcher, one endpoint);
/// Cases is the attorney's tab, and an attorney not verified yet is told
/// why it is empty instead of «nothing found».
void main() {
  setUpAll(initializeDateFormatting);

  Future<FakeSearchRepository> pump(
    WidgetTester tester, {
    required bool attorney,
    bool needsVerification = false,
  }) async {
    final search = FakeSearchRepository();
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(search: search, translator: const _Tr()),
          currentUserIdProvider.overrideWithValue('u1'),
          actsAsAttorneyProvider.overrideWithValue(attorney),
          attorneyNeedsVerificationProvider
              .overrideWithValue(needsVerification),
        ],
      ),
    );
    await tester.pumpAndSettle();
    return search;
  }

  Future<void> done(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  }

  Future<void> searchPeople(WidgetTester tester, String q) async {
    await tester.enterText(find.byType(TextField), q);
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
  }

  testWidgets('People: the same request for a client and an attorney',
      (tester) async {
    for (final attorney in [false, true]) {
      final search = await pump(tester, attorney: attorney);
      await searchPeople(tester, 'kal');
      expect(search.attorneyQueries, ['kal'], reason: 'attorney=$attorney');
      await done(tester);
    }
  });

  testWidgets('Cases: an attorney tab; a client has none', (tester) async {
    await pump(tester, attorney: false);
    expect(find.text('Cases'), findsNothing);
    await done(tester);
    await pump(tester, attorney: true);
    expect(find.text('Cases'), findsOneWidget);
    await done(tester);
  });

  testWidgets(
      'Cases for an attorney not verified yet: the reason, '
      'before and after typing', (tester) async {
    await pump(tester, attorney: true, needsVerification: true);
    await tester.tap(find.text('Cases'));
    await tester.pumpAndSettle();
    final gate = find.byKey(const ValueKey('verification-required'));
    expect(gate, findsOneWidget);
    await tester.enterText(find.byType(TextField), 'divorce');
    await tester.testTextInput.receiveAction(TextInputAction.search);
    await tester.pump(const Duration(milliseconds: 400));
    await tester.pumpAndSettle();
    expect(gate, findsOneWidget);
    expect(find.text('No results'), findsNothing);
    await done(tester);
  });

  testWidgets('Cases for a verified attorney: no gate', (tester) async {
    await pump(tester, attorney: true);
    await tester.tap(find.text('Cases'));
    await tester.pumpAndSettle();
    expect(find.byKey(const ValueKey('verification-required')), findsNothing);
    await done(tester);
  });
}
