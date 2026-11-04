import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/search/presentation/screens/search_screen.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

import '../../helpers/ux_harness.dart';
import '../social/social_fakes.dart';

Question _q(String id, String title) => Question(
      id: id,
      title: title,
      body: 'Body of the question, two lines at most on the card.',
      isAnonymous: false,
      isMine: false,
      answerCount: 1,
      canAnswer: true,
      createdAt: DateTime(2026, 11, 3),
      practiceArea: const QaPracticeArea(
        id: 'a1',
        i18nKey: 'qa.entry.hint',
        nameEn: 'Family law',
      ),
      stateCode: 'NY',
      author: const QaPerson(id: 'u2', displayName: 'Anna K.'),
    );

/// R-401 (owner 2026-11-04): Search → Cases for a verified attorney starts
/// with «Recommended questions» (the nightly snapshot) above the cases, as
/// the Q&A question cards; nothing is drawn while the list is empty.
void main() {
  setUpAll(initializeDateFormatting);

  Future<void> pump(
    WidgetTester tester, {
    required List<Question> questions,
  }) async {
    await tester.pumpWidget(
      uxApp(
        const SearchScreen(),
        theme: AppTheme.light(),
        overrides: [
          ...uxOverrides(
            search: FakeSearchRepository(),
            social: FakeSocialRepository(),
            recommendedQuestions: questions,
          ),
          currentUserIdProvider.overrideWithValue('u1'),
          actsAsAttorneyProvider.overrideWithValue(true),
          attorneyNeedsVerificationProvider.overrideWithValue(false),
        ],
      ),
    );
    await tester.pumpAndSettle();
  }

  Future<void> done(WidgetTester tester) async {
    await tester.pumpWidget(const SizedBox());
    await tester.pump(const Duration(seconds: 3));
  }

  testWidgets('attorney: the section with the question cards above the cases',
      (tester) async {
    await pump(
      tester,
      questions: [
        _q('q1', 'Can my landlord keep the deposit?'),
        _q('q2', 'Who gets the house in a divorce?'),
      ],
    );
    await tester.tap(find.text('Cases'));
    await tester.pumpAndSettle();
    expect(find.text('Recommended questions'), findsOneWidget);
    expect(
      find.byKey(const ValueKey('search-reco-question-q1')),
      findsOneWidget,
    );
    expect(find.text('Who gets the house in a divorce?'), findsOneWidget);
    await done(tester);
  });

  testWidgets('empty list: no section, the cases title stays first',
      (tester) async {
    await pump(tester, questions: const []);
    await tester.tap(find.text('Cases'));
    await tester.pumpAndSettle();
    expect(find.text('Recommended questions'), findsNothing);
    expect(find.byKey(const ValueKey('search-reco-question-q1')), findsNothing);
    await done(tester);
  });
}
