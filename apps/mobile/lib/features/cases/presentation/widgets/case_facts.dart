import 'package:flutter/material.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Owner 2026-10-04: what an attorney scans first on a case card, large
/// and side by side: state, urgency, budget.
class CaseKeyFacts extends StatelessWidget {
  const CaseKeyFacts({
    required this.t,
    required this.stateCode,
    required this.urgency,
    required this.budget,
    this.stateSub,
    super.key,
  });

  final Translator t;
  final String stateCode;

  /// City and/or "+N" more states, under the code.
  final String? stateSub;
  final CaseUrgency? urgency;

  /// Formatted amount, or null for "clarify later".
  final String? budget;

  static String urgencyLabel(Translator t, CaseUrgency? u) => switch (u) {
        CaseUrgency.urgent => t.t('cases.urgency.urgent'),
        CaseUrgency.soon => t.t('cases.urgency.soon'),
        CaseUrgency.flexible => t.t('cases.urgency.flexible'),
        _ => t.t('cases.facts.notSet'),
      };

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final big = typography.roleTitle.copyWith(
      fontSize: 21,
      fontWeight: FontWeight.w700,
      color: colors.text,
      height: 1.15,
      fontFeatures: const [FontFeature.tabularFigures()],
    );
    final small = typography.body.copyWith(
      fontSize: 15,
      fontWeight: FontWeight.w700,
      height: 1.15,
    );
    final urgencyColor = switch (urgency) {
      CaseUrgency.urgent => colors.danger,
      CaseUrgency.soon => colors.goldDark,
      _ => colors.textSecondary,
    };

    Widget tile({
      required String label,
      required Widget value,
      String? sub,
      bool accent = false,
    }) =>
        Expanded(
          child: Container(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.sm + 2,
              AppSpacing.sm,
              AppSpacing.sm,
              AppSpacing.sm,
            ),
            decoration: BoxDecoration(
              // Opaque: the compact card's art runs underneath.
              color: accent
                  ? Color.alphaBlend(colors.goldTint, colors.surface)
                  : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.card - 4),
              border: Border.all(
                color:
                    accent ? colors.gold.withValues(alpha: 0.6) : colors.border,
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label.toUpperCase(),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: typography.caption.copyWith(
                    color: colors.textSecondary,
                    fontSize: 10.5,
                    letterSpacing: 0.6,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 3),
                value,
                if (sub != null && sub.isNotEmpty) ...[
                  const SizedBox(height: 2),
                  Text(
                    sub,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: typography.caption
                        .copyWith(color: colors.textSecondary),
                  ),
                ],
              ],
            ),
          ),
        );

    return IntrinsicHeight(
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          tile(
            label: t.t('cases.facts.state'),
            value: Text(stateCode, maxLines: 1, style: big),
            sub: stateSub,
          ),
          const SizedBox(width: AppSpacing.sm),
          tile(
            label: t.t('cases.facts.urgency'),
            value: Row(
              children: [
                if (urgency == CaseUrgency.urgent) ...[
                  AppIcon(
                    AppIcons.timerOutlined,
                    size: 16,
                    color: urgencyColor,
                  ),
                  const SizedBox(width: 3),
                ],
                Flexible(
                  child: Text(
                    urgencyLabel(t, urgency),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: small.copyWith(color: urgencyColor),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(width: AppSpacing.sm),
          tile(
            label: t.t('cases.facts.budget'),
            accent: true,
            value: budget == null
                ? FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(
                      t.t('cases.facts.negotiable'),
                      maxLines: 1,
                      style: small.copyWith(color: colors.text),
                    ),
                  )
                : FittedBox(
                    fit: BoxFit.scaleDown,
                    alignment: Alignment.centerLeft,
                    child: Text(budget!, maxLines: 1, style: big),
                  ),
          ),
        ],
      ),
    );
  }
}
