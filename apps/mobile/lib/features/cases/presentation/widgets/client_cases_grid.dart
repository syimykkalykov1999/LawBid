import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/navigation/app_routes.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/async_views.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';

/// docs/04 §11.3 — the client profile's "Мои кейсы": the same cases as
/// "Моё → Мои кейсы" as a two-column grid of locked cards. [empty] is the
/// profile's own "no cases yet" card (docs/03 skeleton).
class ClientCasesGrid extends ConsumerWidget {
  const ClientCasesGrid({required this.empty, super.key});

  final Widget empty;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final value = ref.watch(myCasesProvider(MyCasesFilter.active));
    return switch (value) {
      AsyncData(:final value) when value.items.isEmpty => empty,
      AsyncData(:final value) => Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            GridView.builder(
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              gridDelegate: const SliverGridDelegateWithMaxCrossAxisExtent(
                maxCrossAxisExtent: 220,
                mainAxisSpacing: AppSpacing.md,
                crossAxisSpacing: AppSpacing.md,
                childAspectRatio: 0.95,
              ),
              itemCount: value.items.length.clamp(0, 6),
              itemBuilder: (context, i) {
                final c = value.items[i];
                return AppEntrance(
                  index: i + 1,
                  child: AppCard(
                    elevated: true,
                    padding: const EdgeInsets.all(AppSpacing.md),
                    onTap: () => context.push(AppRoutes.myCase(c.id)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Icon(Icons.lock_outline_rounded,
                                size: AppSpacing.md + 2,
                                color: colors.goldDark),
                            const Spacer(),
                            CaseStatusPill(status: c.status, t: t),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        Expanded(
                          child: Text(
                            c.title,
                            maxLines: 3,
                            overflow: TextOverflow.ellipsis,
                            style: typography.body.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600),
                          ),
                        ),
                        Text(
                          CaseFormat.practice(
                              t, c.practice.i18nKey, c.practice.nameEn),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: typography.caption
                              .copyWith(color: colors.textSecondary),
                        ),
                      ],
                    ),
                  ),
                );
              },
            ),
            if (value.items.length > 6 || value.hasMore) ...[
              const SizedBox(height: AppSpacing.md),
              AppButton(
                label: t.t('profile.client.allCases'),
                variant: AppButtonVariant.secondary,
                height: AppSizes.touchTarget,
                onPressed: () => context.go(AppRoutes.mine),
              ),
            ],
          ],
        ),
      AsyncError(:final error) => CasesErrorView(
          error: error,
          t: t,
          onRetry: () => ref.invalidate(myCasesProvider(MyCasesFilter.active)),
        ),
      _ => const AppContentCardSkeleton(),
    };
  }
}
