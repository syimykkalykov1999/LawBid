import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/onboarding/application/onboarding_actions.dart';
import 'package:lawbid/features/onboarding/domain/onboarding_step_id.dart';
import 'package:lawbid/features/onboarding/onboarding_routes.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/onboarding_scaffold.dart';
import 'package:lawbid/shared/domain/user_role.dart';

/// `/onboarding/tour` — Шаг 5 (docs/01_FOUNDATION_AUTH.md §11): 3 short,
/// skippable pages per role. Client: describe the case → get offers →
/// choose an attorney. Attorney: verify the license → browse cases → send
/// offers. "Skip" and "Get started" both complete onboarding
/// (`POST /users/me/onboarding/complete`); a 403 re-reads me and the guard
/// sends the user to whatever is still missing.
class TourStepScreen extends ConsumerStatefulWidget {
  const TourStepScreen({super.key});

  static const pageCount = 3;

  @override
  ConsumerState<TourStepScreen> createState() => _TourStepScreenState();
}

class _TourStepScreenState extends ConsumerState<TourStepScreen> {
  final _pages = PageController();
  int _index = 0;

  @override
  void dispose() {
    _pages.dispose();
    super.dispose();
  }

  void _next() {
    if (_index < TourStepScreen.pageCount - 1) {
      _pages.nextPage(
        duration: context.reduceMotion
            ? const Duration(milliseconds: 1)
            : AppMotion.pageEnter,
        curve: AppMotion.enterCurve,
      );
    } else {
      ref.read(onboardingActionsProvider.notifier).complete();
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    final role = ref.watch(currentUserRoleProvider);
    final action = ref.watch(onboardingActionsProvider);
    final variant = role == UserRole.attorney ? 'attorney' : 'client';
    final previous = OnboardingStepId.tour.previousFor(role)!;
    const icons = {
      'client': [
        AppIcons.editNoteRounded,
        AppIcons.localOfferOutlined,
        AppIcons.handshakeOutlined,
      ],
      'attorney': [
        AppIcons.verifiedUserOutlined,
        AppIcons.travelExploreRounded,
        AppIcons.sendRounded,
      ],
    };
    final last = _index == TourStepScreen.pageCount - 1;

    return Scaffold(
      backgroundColor: colors.bg,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide - AppSpacing.sm,
                AppSpacing.sm,
                AppSpacing.screenSide - AppSpacing.sm,
                0,
              ),
              child: Row(
                children: [
                  AppBackButton(
                    semanticLabel: t.t('common.back'),
                    onPressed: () =>
                        context.go(OnboardingRoutes.forStep(previous)),
                  ),
                  const Spacer(),
                  if (!last)
                    TextButton(
                      style: TextButton.styleFrom(
                        minimumSize: const Size(
                          AppSizes.touchTarget,
                          AppSizes.touchTarget,
                        ),
                        foregroundColor: colors.textSecondary,
                      ),
                      onPressed: action.busy
                          ? null
                          : () => ref
                              .read(onboardingActionsProvider.notifier)
                              .complete(),
                      child: Text(
                        t.t('onboarding.tour.skip'),
                        style: typography.button,
                      ),
                    ),
                ],
              ),
            ),
            Expanded(
              child: PageView.builder(
                controller: _pages,
                itemCount: TourStepScreen.pageCount,
                onPageChanged: (i) => setState(() => _index = i),
                itemBuilder: (context, i) => _TourPage(
                  icon: icons[variant]![i],
                  step: i + 1,
                  title: t.t('onboarding.tour.$variant.${i + 1}.title'),
                  body: t.t('onboarding.tour.$variant.${i + 1}.body'),
                  stepLabel: t.t('common.stepOf', {
                    'current': '${i + 1}',
                    'total': '${TourStepScreen.pageCount}',
                  }),
                ),
              ),
            ),
            Padding(
              padding: const EdgeInsets.fromLTRB(
                AppSpacing.screenSide,
                AppSpacing.sm,
                AppSpacing.screenSide,
                AppSpacing.lg,
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  _Dots(count: TourStepScreen.pageCount, index: _index),
                  const SizedBox(height: AppSpacing.lg),
                  if (action.error != null) ...[
                    ActionErrorBanner(error: action.error!),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  AppButton(
                    label: t.t(
                      last ? 'onboarding.tour.start' : 'onboarding.tour.next',
                    ),
                    isLoading: action.busy,
                    onPressed: _next,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TourPage extends StatelessWidget {
  const _TourPage({
    required this.icon,
    required this.step,
    required this.title,
    required this.body,
    required this.stepLabel,
  });

  final IconData icon;
  final int step;
  final String title;
  final String body;
  final String stepLabel;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    return SingleChildScrollView(
      padding: const EdgeInsets.symmetric(
        horizontal: AppSpacing.screenSide,
        vertical: AppSpacing.xl,
      ),
      child: Column(
        children: staggeredEntrance([
          const SizedBox(height: AppSpacing.xxl),
          Stack(
            alignment: Alignment.center,
            children: [
              const ExcludeSemantics(
                child:
                    Opacity(opacity: 0.6, child: WatermarkScales()),
              ),
              AppIconMedallion(
                icon: icon,
                size: AppSizes.stateMedallion * 1.4,
                iconSize: AppSizes.stateIcon * 1.4,
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.xxl),
          Text(
            stepLabel,
            style: typography.caption.copyWith(color: colors.goldDark),
          ),
          const SizedBox(height: AppSpacing.sm),
          Semantics(
            header: true,
            child: Text(
              title,
              textAlign: TextAlign.center,
              style: typography.titleLarge.copyWith(color: colors.text),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            body,
            textAlign: TextAlign.center,
            style: typography.body.copyWith(color: colors.textSecondary),
          ),
        ]),
      ),
    );
  }
}

class _Dots extends StatelessWidget {
  const _Dots({required this.count, required this.index});

  final int count;
  final int index;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final duration =
        context.reduceMotion ? Duration.zero : AppMotion.stateChange;
    return ExcludeSemantics(
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          for (var i = 0; i < count; i++)
            AnimatedContainer(
              duration: duration,
              curve: AppMotion.enterCurve,
              margin: const EdgeInsets.symmetric(horizontal: AppSpacing.xs),
              width: i == index ? AppSpacing.xl : AppSpacing.sm,
              height: AppSpacing.sm,
              decoration: BoxDecoration(
                color: i == index ? colors.gold : colors.border,
                borderRadius: BorderRadius.circular(AppRadii.pill),
              ),
            ),
        ],
      ),
    );
  }
}
