import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';

/// One compact (56 dp) tappable line: icon, up to two lines of text, arrow.
class _QaLine extends StatelessWidget {
  const _QaLine({
    required this.text,
    required this.onTap,
    this.subtitle,
    this.prominent = false,
    super.key,
  });

  /// The feed card: edge to edge, a warmer fill and border, bold text.
  final bool prominent;

  final String text;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: prominent
          ? Color.alphaBlend(
              colors.gold.withValues(alpha: 0.14),
              colors.surface,
            )
          : colors.surface,
      shape: prominent
          ? Border.symmetric(
              horizontal: BorderSide(color: colors.gold.withValues(alpha: 0.6)),
            )
          : RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(AppRadii.card),
              side: BorderSide(color: colors.border),
            ),
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 56),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                // Owner 2026-10-20: on the feed card the «?» is a solid red
                // dot so an attorney cannot miss it; elsewhere champagne.
                DecoratedBox(
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: prominent
                        ? colors.danger
                        : colors.gold.withValues(alpha: 0.16),
                  ),
                  child: Padding(
                    padding: const EdgeInsets.all(AppSpacing.xs),
                    child: AppIcon(
                      AppIcons.helpOutlineRounded,
                      color: prominent ? colors.onDanger : colors.iconTint,
                    ),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        text,
                        maxLines: 2,
                        style: type.bodySmall.copyWith(
                          color: colors.text,
                          fontWeight:
                              prominent ? FontWeight.w700 : FontWeight.w600,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          maxLines: 2,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.xs),
                AppIcon(
                  AppIcons.chevronRightRounded,
                  color: colors.textSecondary,
                  size: 20,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-20: in the attorney's post feed, once a day when there are
/// new unanswered questions of their practice — a compact banner. Tap opens
/// the «Unanswered» list; a swipe puts it away until tomorrow. No push, no
/// badge.
class QaNewQuestionsBanner extends ConsumerWidget {
  const QaNewQuestionsBanner({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(qaBannerVisibleProvider)) return const SizedBox.shrink();
    final count = ref.watch(qaSummaryProvider).value?.newCount ?? 0;
    final t = ref.watch(translatorProvider);
    return Dismissible(
      key: const ValueKey('qa-new-banner'),
      onDismissed: (_) =>
          ref.read(qaBannerLastUsedProvider.notifier).markUsed(),
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.xs),
        child: _QaLine(
          prominent: true,
          text: t.t('qa.new.banner', {'count': '$count'}),
          onTap: () {
            ref.read(qaBannerLastUsedProvider.notifier).markUsed();
            context.push(LegalQaRoutes.unanswered);
          },
        ),
      ),
    );
  }
}

/// Owner 2026-10-20: in the «Rating» tab of an attorney's own profile, under
/// the rating block — a call to answer questions with «Answers N · best M»
/// (taps into «Вопрос юристу»). Nobody else sees it.
class QaProfileRow extends ConsumerWidget {
  const QaProfileRow({
    required this.answers,
    required this.best,
    required this.isSelf,
    super.key,
  });

  final int answers;
  final int best;
  final bool isSelf;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(legalQaEnabledProvider)) return const SizedBox.shrink();
    if (!isSelf) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final cta = ref.watch(qaSummaryProvider).value?.profileCtaEnabled ?? true;
    final stats = t.t('qa.stats', {'answers': '$answers', 'best': '$best'});
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.md),
      child: _QaLine(
        key: const ValueKey('profile-qa'),
        text: cta ? t.t('qa.cta') : stats,
        subtitle: cta ? stats : null,
        onTap: () => context.push(LegalQaRoutes.feed),
      ),
    );
  }
}

/// Owner 2026-10-20: puts the «New questions» card above the second post of
/// an attorney's feed (above the first when there is only one). The card
/// draws nothing for clients, without fresh questions, or once shown.
Widget withQaBanner(int index, int total, Widget post) =>
    index == (total >= 2 ? 1 : 0)
        ? Column(children: [const QaNewQuestionsBanner(), post])
        : post;
