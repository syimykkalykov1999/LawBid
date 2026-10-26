import 'package:flutter/material.dart';
import 'package:flutter_riverpod/misc.dart' show Override;
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/features/onboarding/domain/current_user.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/screens/attorney_profile_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/practices_screen.dart';
import 'package:lawbid/features/profile/presentation/screens/review_form_screen.dart';
import 'package:lawbid/features/profile/presentation/widgets/attorney_profile_view.dart';
import 'package:lawbid/features/profile/presentation/widgets/review_widgets.dart';

import '../profile_fakes.dart';

/// Goldens (light + dark) for docs/03 stage 3.9: the public attorney
/// profile with reviews and in the "New — no reviews" state, the practices
/// screen, a review card and the review form.
void main() {
  setUpAll(initializeDateFormatting);

  final reviewsRepo = FakeReviewsRepo(
    pages: [
      [
        review(0, edited: true),
        review(
          1,
          rating: 4,
          body: 'Explained every option in plain English and kept me updated.',
        ),
      ],
    ],
    summaryValue: summaryWithReviews,
  );

  final cases = <String, (Widget, CurrentUser, List<Override>, Size)>{
    'attorney_profile_reviews': (
      const AttorneyProfileScreen(
        username: 'jane.doe',
        initialTab: AttorneyProfileTab.reviews,
      ),
      clientMe(),
      profileOverrides(reviews: reviewsRepo),
      const Size(390, 1900),
    ),
    'attorney_profile_new': (
      const AttorneyProfileScreen(
        username: 'sam.new',
        initialTab: AttorneyProfileTab.reviews,
      ),
      clientMe(),
      profileOverrides(
        attorneys: FakeAttorneyRepo(
          profile: attorneyProfile(
            withReviews: false,
            verified: false,
            username: 'sam.new',
          ),
        ),
      ),
      const Size(390, 1500),
    ),
    'practices': (
      const PracticesScreen(),
      attorneyMe(),
      profileOverrides(
        practices: FakePracticesRepo(
          selected: const [
            SelectedPractice(
              id: 'l-div',
              i18nKey: 'practice.family.divorce',
              nameEn: 'Divorce',
              categoryId: 'cat-family',
              categoryI18nKey: 'practice.family',
            ),
            SelectedPractice(
              id: 'l-vis',
              i18nKey: 'practice.imm.visas',
              nameEn: 'Work Visas',
              categoryId: 'cat-imm',
              categoryI18nKey: 'practice.imm',
            ),
          ],
        ),
      ),
      const Size(390, 844),
    ),
    'review_form': (
      const ReviewFormScreen(caseId: 'case-1'),
      clientMe(),
      profileOverrides(),
      const Size(390, 844),
    ),
    'review_card': (
      Scaffold(
        body: Padding(
          padding: const EdgeInsets.all(AppSpacing.screenSide),
          child: Column(
            children: [
              ReviewCard(review: review(0, edited: true)),
              const SizedBox(height: AppSpacing.md),
              ReviewCard(
                review: review(
                  2,
                  rating: 3,
                  body: 'Good result, but replies sometimes took a few days.',
                ),
              ),
            ],
          ),
        ),
      ),
      clientMe(),
      profileOverrides(),
      const Size(390, 520),
    ),
  };

  for (final entry in cases.entries) {
    for (final brightness in [Brightness.light, Brightness.dark]) {
      final name = brightness == Brightness.light ? 'light' : 'dark';
      final theme =
          brightness == Brightness.light ? AppTheme.light() : AppTheme.dark();
      final (screen, user, overrides, size) = entry.value;

      testGoldens('${entry.key} - $name', (tester) async {
        await tester.pumpWidgetBuilder(
          screen,
          wrapper:
              await profileWrapper(theme, user: user, overrides: overrides),
          surfaceSize: size,
        );
        await screenMatchesGolden(tester, '${entry.key}_$name');
        await tester.pumpWidget(const SizedBox.shrink());
        await tester.pump(Duration.zero);
      });
    }
  }
}
