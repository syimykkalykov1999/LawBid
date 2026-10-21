import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/display/app_network_image.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/legal_qa/domain/qa_models.dart';
import 'package:lawbid/features/onboarding/presentation/widgets/option_picker_sheet.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/profile/application/profile_providers.dart';
import 'package:lawbid/features/social/presentation/widgets/social_format.dart';

/// The localized name of a question's practice area.
String qaAreaLabel(Translator t, QaPracticeArea a) =>
    CaseFormat.practice(t, a.i18nKey, a.nameEn);

/// A topic (category or subcategory) picked by id; null = dismissed,
/// an empty id = «all topics».
typedef QaAreaPick = ({String id, String label});

Future<QaAreaPick?> pickQaArea(
  BuildContext context,
  WidgetRef ref, {
  required String title,
  String? current,
}) async {
  final t = ref.read(translatorProvider);
  final tree = await ref.read(practiceTreeProvider.future);
  if (!context.mounted) return null;
  final labels = <String, String>{};
  final picked = await OptionPickerSheet.show(
    context,
    title: title,
    searchHint: t.t('practice.search.hint'),
    options: [
      for (final c in tree) ...[
        PickerOption(
          value: c.id,
          label: labels[c.id] = CaseFormat.practice(t, c.i18nKey, c.nameEn),
        ),
        for (final l in c.children)
          PickerOption(
            value: l.id,
            label: labels[l.id] = CaseFormat.practice(t, l.i18nKey, l.nameEn),
            group: CaseFormat.practice(t, c.i18nKey, c.nameEn),
            nested: true,
          ),
      ],
    ],
    initial: {if (current != null) current},
    remoteSearch: (q) async {
      final byCode = await practiceRemoteSearch(ref)(q);
      final ids = <String, String?>{};
      for (final c in tree) {
        if (byCode.containsKey(practiceCodeOf(c.i18nKey))) {
          ids[c.id] = byCode[practiceCodeOf(c.i18nKey)];
        }
        for (final l in c.children) {
          if (byCode.containsKey(practiceCodeOf(l.i18nKey))) {
            ids[l.id] = byCode[practiceCodeOf(l.i18nKey)];
          }
        }
      }
      return ids;
    },
  );
  if (picked == null) return null;
  if (picked.isEmpty) return (id: '', label: '');
  final id = picked.first;
  return (id: id, label: labels[id] ?? '');
}

/// Small rounded tag: «Family law», «NY».
class QaTag extends StatelessWidget {
  const QaTag({required this.label, this.icon, super.key});

  final String label;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final icon = this.icon;
    return Container(
      padding: const EdgeInsetsDirectional.symmetric(
        horizontal: AppSpacing.sm,
        vertical: AppSpacing.xs,
      ),
      decoration: BoxDecoration(
        color: colors.chip,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            AppIcon(icon, size: 14, color: colors.textSecondary),
            const SizedBox(width: AppSpacing.xs),
          ],
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.caption.copyWith(color: colors.textSecondary),
            ),
          ),
        ],
      ),
    );
  }
}

/// «Best answer» / «Solved» badge — green, with a check (never colour
/// alone).
class QaBestBadge extends ConsumerWidget {
  const QaBestBadge({required this.label, this.iconOnly = false, super.key});

  final String label;

  /// Owner 2026-10-20: in a feed card only the tick (the words did not
  /// fit at 360 dp); the label stays for screen readers.
  final bool iconOnly;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    if (iconOnly) {
      return Semantics(
        label: label,
        child: AppIcon(
          AppIcons.checkCircleRounded,
          size: 16,
          color: colors.success,
        ),
      );
    }
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        AppIcon(AppIcons.checkCircleRounded, size: 16, color: colors.success),
        const SizedBox(width: AppSpacing.xs),
        Flexible(
          child: Text(
            label,
            maxLines: 1,
            overflow: TextOverflow.ellipsis,
            style: type.caption.copyWith(
              color: colors.successText,
              fontWeight: FontWeight.w600,
            ),
          ),
        ),
      ],
    );
  }
}

/// One question in the feed.
class QuestionCard extends ConsumerWidget {
  const QuestionCard({
    required this.question,
    required this.onTap,
    this.attorney = false,
    super.key,
  });

  final Question question;

  /// An attorney sees «N of 10» instead of the bare count.
  final bool attorney;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final area = question.practiceArea;
    final answers = t.t('qa.answers', {
      'count': formats.number(question.answerCount),
    });
    return Semantics(
      button: true,
      label: '${question.title}. $answers'
          '${question.solved ? '. ${t.t('qa.best')}' : ''}',
      excludeSemantics: true,
      child: AppCard(
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              question.title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.titleMedium.copyWith(
                color: colors.text,
                fontFamily: type.body.fontFamily,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              question.body,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.body.copyWith(color: colors.textSecondary),
            ),
            const SizedBox(height: AppSpacing.sm),
            Wrap(
              spacing: AppSpacing.sm,
              runSpacing: AppSpacing.xs,
              children: [
                if (area != null)
                  ConstrainedBox(
                    constraints: BoxConstraints(
                      maxWidth: MediaQuery.sizeOf(context).width * 0.6,
                    ),
                    child: QaTag(label: qaAreaLabel(t, area)),
                  ),
                if (question.stateCode != null)
                  QaTag(label: question.stateCode!),
                if (question.closed) QaTag(label: t.t('qa.closed')),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            // Owner 2026-10-21: the time sits at the far end of the row.
            Row(
              children: [
                Expanded(
                  child: Row(
                    children: [
                      AppIcon(
                        AppIcons.chatBubbleOutlineRounded,
                        size: 16,
                        color: colors.textSecondary,
                      ),
                      const SizedBox(width: AppSpacing.xs),
                      Flexible(
                        child: Text(
                          question.answersEnough && attorney
                              ? t.t('qa.enough')
                              : attorney
                                  ? t.t('qa.count.of', {
                                      'n': formats.number(question.answerCount),
                                      'max': formats.number(10),
                                    })
                                  : SocialFormat.count(
                                      formats,
                                      question.answerCount,
                                    ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: type.caption.copyWith(
                            color: colors.textSecondary,
                          ),
                        ),
                      ),
                      if (question.solved) ...[
                        const SizedBox(width: AppSpacing.md),
                        QaBestBadge(label: t.t('qa.best'), iconOnly: true),
                      ],
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Text(
                  SocialFormat.ago(t, formats, question.createdAt),
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Avatar + name of a person; the green tick marks a verified attorney.
class QaPersonRow extends ConsumerWidget {
  const QaPersonRow({
    required this.name,
    this.avatarUrl,
    this.verified = false,
    this.subtitle,
    this.onTap,
    super.key,
  });

  final String name;
  final String? avatarUrl;
  final bool verified;
  final String? subtitle;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final row = Row(
      children: [
        AppAvatar(
          imageProvider:
              avatarUrl == null ? null : appNetworkImage(avatarUrl!, 120),
          initials: name.isEmpty ? '·' : name.characters.first.toUpperCase(),
        ),
        const SizedBox(width: AppSpacing.md),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Flexible(
                    child: Text(
                      name,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: type.body.copyWith(
                        color: colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                  ),
                  if (verified) ...[
                    const SizedBox(width: AppSpacing.xs),
                    Semantics(
                      label: t.t('qa.verified'),
                      child: AppIcon(
                        AppIcons.verifiedRounded,
                        size: 16,
                        color: colors.success,
                      ),
                    ),
                  ],
                ],
              ),
              if (subtitle != null)
                Text(
                  subtitle!,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
            ],
          ),
        ),
      ],
    );
    if (onTap == null) return row;
    return Semantics(
      button: true,
      label: name,
      excludeSemantics: true,
      child: InkWell(
        onTap: onTap,
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 44),
          child: row,
        ),
      ),
    );
  }
}
