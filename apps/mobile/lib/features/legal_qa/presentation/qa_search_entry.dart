import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/features/legal_qa/application/legal_qa_providers.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/legal_qa/legal_qa_routes.dart';
import 'package:lawbid/features/team/application/team_providers.dart';

/// Owner 2026-10-20: a row under the Search field that opens «Вопрос
/// юристу». An attorney also sees how many questions wait for an answer.
/// Hidden while the `legal_qa` flag is off.
class QaSearchEntry extends ConsumerWidget {
  const QaSearchEntry({super.key});

  static const _unanswered = QuestionsQuery(filter: QaFilter.unanswered);

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    if (!ref.watch(legalQaEnabledProvider)) return const SizedBox.shrink();
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final attorney = ref.watch(actsAsAttorneyProvider);
    var hint = t.t('qa.entry.hint');
    if (attorney) {
      final page = ref.watch(questionsProvider(_unanswered)).value;
      if (page != null && page.items.isNotEmpty) {
        final n = ref.watch(l10nFormatsProvider).number(page.items.length);
        hint = t.t('qa.entry.waiting', {'count': page.hasMore ? '$n+' : n});
      }
    }
    return Semantics(
      button: true,
      label: '${t.t('qa.title')}. $hint',
      excludeSemantics: true,
      child: InkWell(
        onTap: () => context.push(LegalQaRoutes.feed),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.screenSide,
              vertical: AppSpacing.xs,
            ),
            child: Row(
              children: [
                AppIcon(AppIcons.helpOutlineRounded, color: colors.goldDark),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Text(
                        t.t('qa.title'),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: type.body.copyWith(
                          color: colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      Text(
                        hint,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                AppIcon(
                  AppIcons.chevronRightRounded,
                  color: colors.textSecondary,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
