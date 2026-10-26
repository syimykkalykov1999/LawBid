import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/social/application/social_providers.dart';
import 'package:lawbid/features/trust/application/trust_providers.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';
import 'package:lawbid/features/trust/presentation/trust_links.dart';
import 'package:lawbid/features/trust/presentation/trust_payment_notice.dart';
import 'package:lawbid/features/trust/presentation/trust_signals_list.dart';

/// Opens [TrustLevelSheet] for [attorneyId]; [level] is the value already
/// on the card, shown while the signals load.
Future<void> showTrustLevelSheet(
  BuildContext context, {
  required String attorneyId,
  required int level,
}) =>
    showAppBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (_) => TrustLevelSheet(attorneyId: attorneyId, level: level),
    );

/// Owner 2026-10-05 — what each trust level means, which checks this
/// attorney passed (and which not), the client's pre-payment notice and
/// the state registry links so the client can check the bar number
/// themselves (`GET /trust/attorneys/:id`).
class TrustLevelSheet extends ConsumerWidget {
  const TrustLevelSheet({
    required this.attorneyId,
    required this.level,
    super.key,
  });

  final String attorneyId;
  final int level;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(attorneyTrustProvider(attorneyId));
    final self = ref.watch(currentUserIdProvider) == attorneyId;
    final trust = async.value;
    final lv = trust?.level ?? level;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.88;

    Widget section(String title) => Padding(
          padding: const EdgeInsets.only(
            top: AppSpacing.lg,
            bottom: AppSpacing.xs,
          ),
          child: Text(
            title,
            style: typography.roleTitle.copyWith(color: colors.text),
          ),
        );

    return ConstrainedBox(
      constraints: BoxConstraints(maxHeight: maxHeight),
      child: SafeArea(
        top: false,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const AppSheetHandle(),
            Flexible(
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenSide,
                  AppSpacing.sm,
                  AppSpacing.screenSide,
                  AppSpacing.lg,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Semantics(
                            header: true,
                            child: Text(
                              t.t('trust.sheet.title'),
                              style: typography.titleMedium
                                  .copyWith(color: colors.text),
                            ),
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        TrustLevelChip(level: lv, compact: false),
                      ],
                    ),
                    const SizedBox(height: AppSpacing.xs),
                    Text(
                      t.t('trust.levelOf', {
                        'level': '$lv',
                        'max': '${TrustLevels.max}',
                      }),
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      t.t('trust.sheet.intro'),
                      style: typography.bodySmall
                          .copyWith(color: colors.textSecondary, height: 1.35),
                    ),
                    section(t.t('trust.sheet.levels')),
                    TrustLevelLadder(level: lv, t: t),
                    section(t.t('trust.sheet.signals')),
                    async.when(
                      loading: () => const Column(
                        children: [
                          AppSkeleton(),
                          SizedBox(height: AppSpacing.sm),
                          AppSkeleton(),
                          SizedBox(height: AppSpacing.sm),
                          AppSkeleton(),
                        ],
                      ),
                      error: (e, _) => AppErrorState(
                        message: errorText(t, e),
                        retryLabel: t.t('error.retry'),
                        onRetry: () =>
                            ref.invalidate(attorneyTrustProvider(attorneyId)),
                      ),
                      data: (p) => TrustSignalsList(trust: p, t: t, self: self),
                    ),
                    const SizedBox(height: AppSpacing.lg),
                    TrustPaymentNotice(
                      attorneyId: attorneyId,
                      showRegistryLinks: false,
                    ),
                    if (trust != null && trust.registryLinks.isNotEmpty) ...[
                      section(t.t('trust.sheet.registry')),
                      Text(
                        t.t('trust.sheet.registry.hint'),
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                      const SizedBox(height: AppSpacing.xs),
                      RegistryLinksList(links: trust.registryLinks, t: t),
                    ],
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
