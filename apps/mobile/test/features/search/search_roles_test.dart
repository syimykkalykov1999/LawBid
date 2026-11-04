import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/static_translator.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/social/domain/social_models.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/shared/domain/cursor_page.dart';

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

const _rec = AttorneyRow(
  id: 'rec1',
  username: 'rec.one',
  firstName: 'Rita',
  lastName: 'Cole',
  verified: true,
  ratingAvg: 0,
  ratingCount: 0,
  states: [],
  practiceKeys: [],
  isFollowing: false,
);

/// Suggestions with a counter of reads (R-389); the first [failFirst]
/// reads fail.
class _Social extends FakeSocialRepository {
  _Social(this.rows, {this.failFirst = 0});

  final List<AttorneyRow> rows;
  final int failFirst;
  int reads = 0;

  @override
  Future<CursorPage<AttorneyRow>> suggestions({String? cursor}) async {
    reads++;
    if (reads <= failFirst) throw StateError('offline');
    return CursorPage(items: rows);
  }
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
    FakeSocialRepository? social,
  }) async {
    final search = FakeSearchRepository();
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(
            search: search,
            social: social,
            translator: const _Tr(),
          ),
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

  // R-389 (owner 04.11): under «Recent» a client sees the same grid of
  // recommended attorneys as an attorney; none — no section at all.
  for (final attorney in [false, true]) {
    final who = attorney ? 'an attorney' : 'a client';

    testWidgets('People: $who sees the recommended grid', (tester) async {
      await pump(tester, attorney: attorney, social: _Social(const [_rec]));
      expect(find.text('search.recommended'), findsOneWidget);
      expect(find.byKey(const ValueKey('rec-rec1')), findsOneWidget);
      await done(tester);
    });

    testWidgets('People: $who with no recommendations sees no section',
        (tester) async {
      await pump(tester, attorney: attorney, social: _Social(const []));
      expect(find.text('search.recommended'), findsNothing);
      await done(tester);
    });
  }

  test('People: leaving Search and coming back reads the grid once', () async {
    final social = _Social(const [_rec]);
    final c = ProviderContainer(overrides: uxOverrides(social: social));
    addTearDown(c.dispose);
    final first = c.listen(suggestionsProvider, (_, __) {});
    await c.read(suggestionsProvider.future);
    first.close();
    // The screen let go of it; a return within 10 minutes reuses it.
    await Future<void>.delayed(Duration.zero);
    c.listen(suggestionsProvider, (_, __) {});
    await c.read(suggestionsProvider.future);
    expect(social.reads, 1);
  });

  test('People: a failed read is not kept — the next visit asks again',
      () async {
    final social = _Social(const [_rec], failFirst: 1);
    final c = ProviderContainer(overrides: uxOverrides(social: social));
    addTearDown(c.dispose);
    final first = c.listen(suggestionsProvider, (_, __) {});
    await expectLater(c.read(suggestionsProvider.future), throwsStateError);
    first.close();
    await Future<void>.delayed(Duration.zero);
    c.listen(suggestionsProvider, (_, __) {});
    final page = await c.read(suggestionsProvider.future);
    expect(page.items.single.id, 'rec1');
    expect(social.reads, 2);
  });
}
