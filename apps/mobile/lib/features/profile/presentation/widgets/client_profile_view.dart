import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/config/app_environment.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/onboarding/application/current_user_controller.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/profile/domain/profile_models.dart';
import 'package:lawbid/features/profile/presentation/widgets/profile_avatar.dart';

/// The client's private profile (docs/03 §5): photo, name, state — no
/// follower counters — and the "My cases" tab: a lock + "Visible only to
/// you" and, until file 04 brings cases, the empty state "You have no
/// cases yet". Nobody else can open this profile (the API answers 404).
class ClientProfileView extends ConsumerWidget {
  const ClientProfileView({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final profile = ref.watch(clientProfileProvider);
    void retry() => ref.invalidate(clientProfileProvider);

    return AnimatedSwitcher(
      duration: context.reduceMotion ? Duration.zero : AppMotion.stateChange,
      child: profile.when(
        skipLoadingOnReload: true,
        loading: () => const _ClientSkeleton(key: ValueKey('loading')),
        error: (error, _) => isOfflineError(error)
            ? AppOfflineState(
                key: const ValueKey('offline'),
                title: t.t('offline.title'),
                message: t.t('offline.message'),
                action: AppButton(
                  label: t.t('error.retry'),
                  icon: Icons.refresh_rounded,
                  variant: AppButtonVariant.secondary,
                  height: AppSizes.touchTarget,
                  onPressed: retry,
                ),
              )
            : AppErrorState(
                key: const ValueKey('error'),
                message: t.t('profile.error'),
                retryLabel: t.t('error.retry'),
                onRetry: retry,
              ),
        data: (p) => RefreshIndicator(
          key: const ValueKey('data'),
          color: Theme.of(context).extension<AppColorTokens>()!.gold,
          onRefresh: () async {
            ref.invalidate(clientProfileProvider);
            try {
              await ref.read(clientProfileProvider.future);
            } catch (_) {
              // Rendered by the error state.
            }
          },
          child: _ClientBody(profile: p, t: t),
        ),
      ),
    );
  }
}

class _ClientBody extends ConsumerWidget {
  const _ClientBody({required this.profile, required this.t});

  final ClientProfileDetails profile;
  final Translator t;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final avatarUrl = ref.watch(currentUserControllerProvider.select((s) => s.user?.avatarUrl));
    final showReviewEntry = !ref.watch(appEnvironmentProvider).isProd;
    final name = profile.fullName;

    final children = <Widget>[
      AppCard(
        elevated: true,
        child: Row(
          children: [
            ProfileAvatar(
              size: AppSizes.stateMedallion - AppSpacing.lg,
              url: avatarUrl,
              initials: initialsOf(profile.firstName, profile.lastName),
              semanticLabel: t.t('profile.avatar.label'),
            ),
            const SizedBox(width: AppSpacing.lg),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Semantics(
                    header: true,
                    child: Text(
                      name.isEmpty ? t.t('profile.client.noName') : name,
                      style: typography.titleWelcome.copyWith(color: colors.text),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Row(
                    children: [
                      Icon(Icons.location_on_outlined, size: AppSpacing.lg, color: colors.goldStroke),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          profile.state.name,
                          style: typography.bodySmall.copyWith(color: colors.textSecondary),
                        ),
                      ),
                    ],
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
      AppButton(
        label: t.t('profile.action.edit'),
        icon: Icons.edit_outlined,
        variant: AppButtonVariant.secondary,
        height: AppSizes.touchTarget,
        onPressed: () => context.push(AppRoutes.profileEdit),
      ),
      Row(
        children: [
          Icon(Icons.folder_outlined, size: AppSizes.iconSm, color: colors.text),
          const SizedBox(width: AppSpacing.sm),
          Expanded(
            child: Semantics(
              header: true,
              child: Text(t.t('profile.client.myCases'), style: typography.roleTitle.copyWith(color: colors.text)),
            ),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: AppSpacing.sm, vertical: AppSpacing.xs),
            decoration: BoxDecoration(
              color: colors.goldTint,
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Icon(Icons.lock_outline_rounded, size: AppSpacing.md + 2, color: colors.text),
                const SizedBox(width: AppSpacing.xs),
                Text(t.t('profile.client.onlyYou'), style: typography.badge.copyWith(color: colors.text)),
              ],
            ),
          ),
        ],
      ),
      AppCard(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: AppSpacing.lg),
          child: Column(
            children: [
              const AppIconMedallion(icon: Icons.lock_outline_rounded, size: AppSizes.stateMedallion - AppSpacing.xl, iconSize: AppSizes.iconLg),
              const SizedBox(height: AppSpacing.md),
              Text(
                t.t('profile.client.noCases'),
                textAlign: TextAlign.center,
                style: typography.roleTitle.copyWith(color: colors.text),
              ),
              const SizedBox(height: AppSpacing.xs),
              Text(
                t.t('profile.client.noCases.body'),
                textAlign: TextAlign.center,
                style: typography.body.copyWith(color: colors.textSecondary),
              ),
            ],
          ),
        ),
      ),
      // Placeholder entry to the review form until file 04 lists closed
      // cases (non-production builds only).
      // TODO(docs/04 closed cases): replace with the "Leave a review"
      // action on each closed case card.
      if (showReviewEntry)
        AppListRow(
          icon: Icons.rate_review_outlined,
          label: t.t('reviews.placeholder.entry'),
          onTap: () => _openReviewPlaceholder(context, t),
        ),
    ];

    return ListView(
      physics: const AlwaysScrollableScrollPhysics(),
      padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.lg),
          AppEntrance(index: i, child: children[i]),
        ],
      ],
    );
  }

  Future<void> _openReviewPlaceholder(BuildContext context, Translator t) async {
    final controller = TextEditingController();
    final caseId = await showAppBottomSheet<String>(
      context: context,
      builder: (sheetContext) {
        final colors = Theme.of(sheetContext).extension<AppColorTokens>()!;
        final typography = Theme.of(sheetContext).extension<AppTypographyTokens>()!;
        return Padding(
          padding: EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.lg + MediaQuery.viewInsetsOf(sheetContext).bottom,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const AppSheetHandle(),
              Text(t.t('reviews.placeholder.entry'), style: typography.titleMedium.copyWith(color: colors.text)),
              const SizedBox(height: AppSpacing.sm),
              Text(t.t('reviews.placeholder.body'), style: typography.body.copyWith(color: colors.textSecondary)),
              const SizedBox(height: AppSpacing.lg),
              AppTextField(controller: controller, label: t.t('reviews.placeholder.caseId'), autofocus: true),
              const SizedBox(height: AppSpacing.lg),
              AppButton(
                label: t.t('common.confirm'),
                height: AppSizes.touchTarget,
                onPressed: () => Navigator.of(sheetContext).pop(controller.text.trim()),
              ),
            ],
          ),
        );
      },
    );
    controller.dispose();
    if (caseId != null && caseId.isNotEmpty && context.mounted) {
      await context.push(AppRoutes.reviewFormFor(caseId));
    }
  }
}

class _ClientSkeleton extends StatelessWidget {
  const _ClientSkeleton({super.key});

  @override
  Widget build(BuildContext context) => ListView(
        physics: const NeverScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(AppSpacing.screenSide, AppSpacing.sm, AppSpacing.screenSide, AppSpacing.xxl),
        children: const [
          AppSkeletonCard(),
          SizedBox(height: AppSpacing.lg),
          AppSkeleton(height: AppSizes.touchTarget, borderRadius: AppRadii.button),
          SizedBox(height: AppSpacing.lg),
          AppSkeleton(height: 160, borderRadius: AppRadii.card),
        ],
      );
}
