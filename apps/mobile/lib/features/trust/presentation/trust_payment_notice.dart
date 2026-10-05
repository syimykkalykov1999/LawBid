import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/trust/application/trust_providers.dart';
import 'package:lawbid/features/trust/domain/trust_models.dart';
import 'package:lawbid/features/trust/presentation/trust_level_chip.dart';
import 'package:lawbid/features/trust/presentation/trust_links.dart';

/// Owner 2026-10-05 — the client's pre-payment card: the attorney's level
/// chip, one sentence (payments to an attorney below the identity level are
/// not accepted by LawBid / how this attorney's identity was confirmed) and
/// «Проверить в реестре». Loads `GET /trust/attorneys/:id` itself; the
/// payment sheet wires it in, `TrustLevelSheet` shows it too.
class TrustPaymentNotice extends ConsumerWidget {
  const TrustPaymentNotice({
    required this.attorneyId,
    super.key,
    this.showRegistryLinks = true,
  });

  final String attorneyId;

  /// Off inside the sheet, which lists the registries itself.
  final bool showRegistryLinks;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final async = ref.watch(attorneyTrustProvider(attorneyId));

    return async.when(
      loading: () => const AppSkeleton(height: 72, borderRadius: AppRadii.card),
      error: (_, __) => _Frame(
        tint: colors.dangerTint,
        border: colors.dangerText,
        child: Text(
          t.t('trust.payment.unavailable'),
          style: typography.bodySmall.copyWith(color: colors.text),
        ),
      ),
      data: (trust) {
        final ok = trust.acceptsPayments;
        final sentence =
            ok ? t.t(_okKey(trust.signals)) : t.t('trust.payment.blocked');
        final c = trustLevelColors(colors, trust.level);
        return _Frame(
          tint: ok ? c.fill : colors.dangerTint,
          border: ok ? c.border : colors.dangerText,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIcon(
                    ok
                        ? AppIcons.verifiedUserOutlined
                        : AppIcons.warningAmberRounded,
                    size: AppSizes.iconSm,
                    color: ok ? c.fg : colors.dangerText,
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Text(
                      t.t('trust.payment.title'),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: typography.bodySmall.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  TrustLevelChip(level: trust.level, attorneyId: attorneyId),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Text(
                sentence,
                style: typography.bodySmall
                    .copyWith(color: colors.text, height: 1.35),
              ),
              if (showRegistryLinks && trust.registryLinks.isNotEmpty) ...[
                const SizedBox(height: AppSpacing.xs),
                RegistryLinksList(links: trust.registryLinks, t: t),
              ],
            ],
          ),
        );
      },
    );
  }

  static String _okKey(TrustSignals s) {
    if (s.documentsVerified) return 'trust.payment.ok.documents';
    if (s.stripeIdentity) return 'trust.payment.ok.stripe';
    if (s.firmLinkConfirmed) return 'trust.payment.ok.firm';
    return 'trust.payment.ok.generic';
  }
}

class _Frame extends StatelessWidget {
  const _Frame({
    required this.tint,
    required this.border,
    required this.child,
  });

  final Color tint;
  final Color border;
  final Widget child;

  @override
  Widget build(BuildContext context) => Container(
        width: double.infinity,
        padding: const EdgeInsets.all(AppSpacing.md),
        decoration: BoxDecoration(
          color: tint,
          borderRadius: BorderRadius.circular(AppRadii.card),
          border: Border.all(color: border.withValues(alpha: 0.45)),
        ),
        child: child,
      );
}
