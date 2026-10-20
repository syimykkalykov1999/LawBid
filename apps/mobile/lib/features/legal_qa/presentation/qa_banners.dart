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
    super.key,
  });

  final String text;
  final String? subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return Material(
      color: colors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(AppRadii.card),
        side: BorderSide(color: colors.border),
      ),
      child: InkWell(
        borderRadius: BorderRadius.circular(AppRadii.card),
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
                AppIcon(AppIcons.helpOutlineRounded, color: colors.goldDark),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        text,
                        maxLines: 2,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      if (subtitle != null)
                        Text(
                          subtitle!,
                          maxLines: 2,
                          style: type.body.copyWith(
                            color: colors.textSecondary,
                            fontSize: 12,
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
    final count = ref.watch(qaNewCountProvider).value ?? 0;
    if (count <= 0 || ref.watch(qaBannerHiddenProvider)) {
      return const SizedBox.shrink();
    }
    final t = ref.watch(translatorProvider);
    return Dismissible(
      key: const ValueKey('qa-new-banner'),
      onDismissed: (_) => ref.read(qaBannerHiddenProvider.notifier).hideToday(),
      child: Padding(
        padding: const EdgeInsets.symmetric(
          horizontal: AppSpacing.screenSide,
          vertical: AppSpacing.xs,
        ),
        child: _QaLine(
          text: t.t('qa.new.banner', {'count': '$count'}),
          onTap: () {
            ref.read(qaBannerHiddenProvider.notifier).hideToday();
            context.push(LegalQaRoutes.unanswered);
          },
        ),
      ),
    );
  }
}

/// Owner 2026-10-20: «Мои» (attorney) — «Вопрос юристу · N новых»; hidden
/// without fresh questions and while the flag is off.
class QaMineEntry extends ConsumerWidget {
  const QaMineEntry({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(legalQaEnabledProvider)) return const SizedBox.shrink();
    final count = ref.watch(qaNewCountProvider).value ?? 0;
    if (count <= 0) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    return Padding(
      padding: const EdgeInsetsDirectional.only(
        start: AppSpacing.screenSide,
        end: AppSpacing.screenSide,
        bottom: AppSpacing.sm,
      ),
      child: _QaLine(
        key: const ValueKey('mine-qa'),
        text: '${t.t('qa.title')} · ${t.t('qa.newShort', {'count': '$count'})}',
        onTap: () => context.push(LegalQaRoutes.unanswered),
      ),
    );
  }
}

/// Owner 2026-10-20: under the rating on an attorney's profile — «Answers
/// N · best M». On one's own profile with a call to answer questions (taps
/// into «Вопрос юристу»); on others', only the numbers, and only if any.
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
    if (!isSelf && answers == 0) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final stats = t.t('qa.stats', {'answers': '$answers', 'best': '$best'});
    return Padding(
      padding: const EdgeInsets.only(top: AppSpacing.sm),
      child: _QaLine(
        key: const ValueKey('profile-qa'),
        text: isSelf ? t.t('qa.cta') : stats,
        subtitle: isSelf ? stats : null,
        onTap: () => context.push(LegalQaRoutes.feed),
      ),
    );
  }
}
