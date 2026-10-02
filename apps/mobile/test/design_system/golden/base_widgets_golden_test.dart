import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:golden_toolkit/golden_toolkit.dart';

import 'package:lawbid/core/design_system/design_system.dart';

/// Golden coverage for the stage 1.5 base widgets (docs/01 §15 stage 1.5
/// "Golden-тесты базовых виджетов в обеих темах"; docs/07 §9 "состояния:
/// ошибка поля ...") plus the p12 leaf-1.6 additions (feed header,
/// content card, connectivity banner, pagination footer). Strings are test
/// fixtures, not UI copy.
void main() {
  // Static caret so focused-field goldens are deterministic.
  setUpAll(() => EditableText.debugDeterministicCursor = true);
  tearDownAll(() => EditableText.debugDeterministicCursor = false);

  final themes = {
    'light': AppTheme.light(),
    'dark': AppTheme.dark(),
  };

  Future<void> golden(
    WidgetTester tester,
    String name,
    ThemeData theme,
    Widget child, {
    Size size = const Size(390, 160),
    Future<void> Function(WidgetTester tester)? before,
  }) async {
    await tester.pumpWidgetBuilder(
      Container(
        color: theme.scaffoldBackgroundColor,
        padding: const EdgeInsets.all(AppSpacing.lg),
        alignment: Alignment.topLeft,
        child: child,
      ),
      wrapper: materialAppWrapper(theme: theme),
      surfaceSize: size,
    );
    if (before != null) await before(tester);
    // Fixed-time pump instead of pumpAndSettle: loading spinners never
    // settle, and a fixed frame keeps them deterministic.
    await screenMatchesGolden(
      tester,
      name,
      customPump: (tester) => tester.pump(const Duration(milliseconds: 400)),
    );
  }

  for (final entry in themes.entries) {
    final name = entry.key;
    final theme = entry.value;

    testGoldens('AppTextField normal - $name', (tester) async {
      await golden(
        tester,
        'app_text_field_normal_$name',
        theme,
        const AppTextField(label: 'Full name', hintText: 'Jane Doe'),
      );
    });

    testGoldens('AppTextField focus - $name', (tester) async {
      await golden(
        tester,
        'app_text_field_focus_$name',
        theme,
        const AppTextField(label: 'Full name', hintText: 'Jane Doe'),
        before: (tester) async {
          await tester.tap(find.byType(TextField));
          await tester.pump();
        },
      );
    });

    testGoldens('AppTextField error - $name', (tester) async {
      await golden(
        tester,
        'app_text_field_error_$name',
        theme,
        AppTextField(
          label: 'Email',
          controller: TextEditingController(text: 'jane@'),
          errorText: 'Enter a valid email',
        ),
      );
    });

    testGoldens('AppOtpField - $name', (tester) async {
      await golden(
        tester,
        'app_otp_field_$name',
        theme,
        Column(
          children: [
            AppOtpField(
              semanticLabel: 'Verification code',
              onCompleted: (_) {},
              autofocus: false,
            ),
            const SizedBox(height: AppSpacing.lg),
            AppOtpField(
              semanticLabel: 'Verification code',
              onCompleted: (_) {},
              autofocus: false,
              errorText: 'Wrong code',
            ),
          ],
        ),
        size: const Size(390, 200),
      );
    });

    testGoldens('AppIconButton - $name', (tester) async {
      await golden(
        tester,
        'app_icon_button_$name',
        theme,
        Row(
          children: [
            AppIconButton(
              icon: const Icon(AppIcons.mailOutlineRounded),
              semanticLabel: 'Email',
              onPressed: () {},
            ),
            const SizedBox(width: AppSpacing.sm),
            AppIconButton(
              icon: const Icon(Icons.apple),
              semanticLabel: 'Apple',
              onPressed: () {},
              isLoading: true,
            ),
          ],
        ),
        size: const Size(390, 80),
      );
    });

    testGoldens('AppChip - $name', (tester) async {
      await golden(
        tester,
        'app_chip_$name',
        theme,
        Wrap(
          spacing: AppSpacing.sm,
          runSpacing: AppSpacing.sm,
          children: [
            AppChip(label: 'DUI', onTap: () {}),
            AppChip(label: 'Family law', selected: true, onTap: () {}),
            const AppChip(
              label: '+1',
              leading: Icon(AppIcons.flagOutlined, size: AppSizes.iconSm),
              trailing: Icon(AppIcons.expandMoreRounded, size: 15),
            ),
          ],
        ),
        size: const Size(390, 80),
      );
    });

    testGoldens('AppCard and AppContentCard - $name', (tester) async {
      await golden(
        tester,
        'app_card_$name',
        theme,
        Column(
          children: [
            const AppCard(child: Text('Plain card')),
            const SizedBox(height: AppSpacing.md),
            AppContentCard(
              leading: const AppAvatar(initials: 'JD'),
              title: 'What to do after a DUI stop',
              meta: 'Jane Doe · Criminal defense · CA',
              body: 'Stay calm, keep your hands visible and ask whether '
                  'you are free to leave. You may decline field sobriety '
                  'tests in most states.',
              tags: const [AppChip(label: '#dui'), AppChip(label: 'CA')],
              highlighted: true,
              onTap: () {},
            ),
            const SizedBox(height: AppSpacing.md),
            const AppContentCardSkeleton(shimmer: false),
          ],
        ),
        size: const Size(390, 560),
      );
    });

    testGoldens('AppAvatar - $name', (tester) async {
      await golden(
        tester,
        'app_avatar_$name',
        theme,
        const Row(
          children: [
            AppAvatar(initials: 'JD', semanticLabel: 'Jane Doe'),
            SizedBox(width: AppSpacing.md),
            AppAvatar(initials: 'AB', size: 56),
            SizedBox(width: AppSpacing.md),
            AppAvatar(size: 32),
          ],
        ),
        size: const Size(390, 100),
      );
    });

    testGoldens('AppTopBar - $name', (tester) async {
      await golden(
        tester,
        'app_top_bar_$name',
        theme,
        AppTopBar(
          leading: AppBackButton(semanticLabel: 'Back', onPressed: () {}),
          title: const Text('Active devices'),
          actions: [
            AppIconButton(
              icon: const Icon(AppIcons.moreHorizRounded),
              semanticLabel: 'More',
              onPressed: () {},
            ),
          ],
        ),
        size: const Size(390, 100),
      );
    });

    testGoldens('AppFeedHeader with static ScalesLogo - $name', (tester) async {
      await golden(
        tester,
        'feed_header_$name',
        theme,
        const AppFeedHeader(logoSemanticLabel: 'LawBid'),
        size: const Size(390, 120),
      );
    });

    testGoldens('AppConnectivityBanner - $name', (tester) async {
      await golden(
        tester,
        'app_connectivity_banner_$name',
        theme,
        Column(
          children: [
            AppConnectivityBanner(
              message: 'No internet connection',
              actionLabel: 'Retry',
              onAction: () {},
            ),
            const SizedBox(height: AppSpacing.md),
            const AppConnectivityBanner(
              message: 'Back online',
              tone: AppConnectivityBannerTone.restored,
            ),
          ],
        ),
        size: const Size(390, 170),
      );
    });

    testGoldens('AppPaginationFooter - $name', (tester) async {
      await golden(
        tester,
        'app_pagination_footer_$name',
        theme,
        Column(
          children: [
            for (final status in [
              AppPaginationStatus.error,
              AppPaginationStatus.end,
            ])
              AppPaginationFooter(
                status: status,
                labels: const AppPaginationLabels(
                  loadingMore: 'Loading more',
                  error: "Couldn't load more",
                  retry: 'Retry',
                  end: "That's everything",
                ),
                onRetry: () {},
              ),
          ],
        ),
        size: const Size(390, 260),
      );
    });
  }
}
