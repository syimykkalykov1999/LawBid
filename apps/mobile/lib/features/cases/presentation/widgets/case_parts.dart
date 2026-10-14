import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';

/// Owner 2026-10-13: the pieces the case card (feed) and the open case
/// share, so both read the same: practice chips, State · Budget · Deadline
/// in one line, the description as three lines with its paragraphs and a
/// file line that says how many documents and photos wait behind the lock.

/// The qualification chips: the category first (dark), then the practice.
class CaseChipsRow extends StatelessWidget {
  const CaseChipsRow({
    required this.labels,
    this.status,
    this.dense = false,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.md,
      AppSpacing.lg,
      0,
    ),
    super.key,
  });

  /// First is drawn as the main chip.
  final List<String> labels;

  /// A green status chip before the practices ("Accepted by both").
  final String? status;
  final EdgeInsetsGeometry padding;

  /// Owner 2026-10-14: slimmer chips on the feed card.
  final bool dense;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    Widget chip(String label, {bool main = false, bool ok = false}) =>
        Container(
          padding:
              EdgeInsets.symmetric(horizontal: 10, vertical: dense ? 3 : 6),
          decoration: BoxDecoration(
            color: ok
                ? colors.success.withValues(alpha: 0.16)
                : main
                    ? (dark ? colors.border : colors.navy)
                    : colors.chip,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            label,
            maxLines: 1,
            style: type.bodySmall.copyWith(
              fontWeight: FontWeight.w600,
              color: ok
                  ? colors.successText
                  : main
                      ? Colors.white
                      : colors.text,
            ),
          ),
        );
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      physics: const ClampingScrollPhysics(),
      child: Row(
        children: [
          if (status != null) ...[
            chip(status!, ok: true),
            const SizedBox(width: 6),
          ],
          for (final (i, l) in labels.indexed) ...[
            if (i > 0) const SizedBox(width: 6),
            chip(l, main: i == 0 && status == null),
          ],
        ],
      ),
    );
  }
}

/// Deadline · Budget · State, one size, hairline between (owner
/// 2026-10-14: the deadline comes first).
class CaseFigures extends StatelessWidget {
  const CaseFigures({
    required this.t,
    required this.formats,
    required this.states,
    required this.budget,
    required this.urgency,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.lg,
      AppSpacing.lg,
      0,
    ),
    super.key,
  });

  final Translator t;
  final L10nFormats formats;

  /// Primary first: "CA, NY +1".
  final List<String> states;
  final CaseBudget budget;
  final CaseUrgencyInfo urgency;
  final EdgeInsetsGeometry padding;

  static String statesText(List<String> codes) {
    if (codes.length <= 2) return codes.join(', ');
    return '${codes.take(2).join(', ')} +${codes.length - 2}';
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final money = budget.isClarifyLater
        ? t.t('cases.facts.negotiable')
        : CaseFormat.money(formats, budget.amountCents!);
    final deadline = CaseUrgencyText.label(t, formats, urgency);
    Widget fig(String label, String value, {bool last = false}) => Container(
          padding: EdgeInsetsDirectional.only(end: last ? 0 : AppSpacing.md),
          margin: EdgeInsetsDirectional.only(end: last ? 0 : AppSpacing.md),
          decoration: BoxDecoration(
            border: last
                ? null
                : BorderDirectional(end: BorderSide(color: colors.border)),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisSize: MainAxisSize.min,
            children: [
              Text(
                label,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: type.caption.copyWith(color: colors.textSecondary),
              ),
              const SizedBox(height: 2),
              Text(
                value,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: type.body.copyWith(
                  fontWeight: FontWeight.w600,
                  fontSize: 14,
                  height: 1.2,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
          ),
        );
    // A figure keeps its own width (no "$3,00 / 0" at large fonts); when the
    // three do not fit on one line, the last ones go to the next.
    return Padding(
      padding: padding,
      child: Wrap(
        runSpacing: AppSpacing.md,
        children: [
          fig(t.t('cases.facts.deadline'), deadline),
          fig(t.t('cases.facts.budget'), money),
          fig(t.t('cases.facts.state'), statesText(states), last: true),
        ],
      ),
    );
  }
}

/// The description with its paragraphs kept: [lines] lines, then "more".
class CaseText extends StatelessWidget {
  const CaseText({
    required this.text,
    required this.moreLabel,
    this.lines,
    this.onMore,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.md,
      AppSpacing.lg,
      0,
    ),
    super.key,
  });

  final String text;
  final String moreLabel;

  /// Null = the whole text.
  final int? lines;
  final VoidCallback? onMore;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final style = type.body.copyWith(
      fontSize: 14,
      height: 1.45,
      color: colors.text.withValues(alpha: 0.88),
    );
    return Padding(
      padding: padding,
      child: LayoutBuilder(
        builder: (context, box) {
          final clamp = lines;
          if (clamp == null) return Text(text, style: style);
          final painter = TextPainter(
            text: TextSpan(text: text, style: style),
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
            maxLines: clamp,
          )..layout(maxWidth: box.maxWidth);
          if (!painter.didExceedMaxLines) return Text(text, style: style);
          // "more" sits at the end of the last line, over the faded text.
          return Stack(
            children: [
              Text(
                text,
                maxLines: clamp,
                overflow: TextOverflow.clip,
                style: style,
              ),
              PositionedDirectional(
                end: 0,
                bottom: 0,
                child: GestureDetector(
                  onTap: onMore,
                  behavior: HitTestBehavior.opaque,
                  child: Container(
                    padding: const EdgeInsetsDirectional.only(start: 36),
                    decoration: BoxDecoration(
                      gradient: LinearGradient(
                        colors: [
                          colors.surface.withValues(alpha: 0),
                          colors.surface,
                        ],
                        stops: const [0, 0.35],
                      ),
                    ),
                    child: Text(
                      moreLabel,
                      style: style.copyWith(color: colors.textSecondary),
                    ),
                  ),
                ),
              ),
            ],
          );
        },
      ),
    );
  }
}

/// "3 docs · 2 photos · locked" with a padlock, or "No files".
class CaseFileLine extends StatelessWidget {
  const CaseFileLine({
    required this.t,
    required this.dossier,
    this.locked = true,
    this.padding = const EdgeInsets.fromLTRB(
      AppSpacing.lg,
      AppSpacing.md,
      AppSpacing.lg,
      0,
    ),
    super.key,
  });

  final Translator t;
  final CaseDossier dossier;
  final bool locked;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final empty = dossier.documentsCount + dossier.imagesCount == 0;
    final parts = [
      if (dossier.documentsCount > 0)
        t.plural('cases.dossier.docs', dossier.documentsCount),
      if (dossier.imagesCount > 0)
        t.plural('cases.dossier.photos', dossier.imagesCount),
    ];
    final label = empty ? t.t('cases.dossier.noFiles') : parts.join(' · ');
    return Padding(
      padding: padding,
      child: Row(
        children: [
          AppIcon(
            !empty && locked
                ? AppIcons.lockOutlineRounded
                : AppIcons.folderOutlined,
            size: 18,
            color: colors.textSecondary,
          ),
          const SizedBox(width: AppSpacing.sm),
          Flexible(
            child: Text(
              !empty && locked ? '$label · ${t.t('cases.card.locked')}' : label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: type.bodySmall.copyWith(
                color: empty ? colors.textSecondary : colors.text,
                fontWeight: empty ? FontWeight.w400 : FontWeight.w600,
              ),
            ),
          ),
        ],
      ),
    );
  }
}

/// One text tab of the case ("Overview", "Files 13", "Updates 4").
class CaseTabItem {
  const CaseTabItem(this.label, {this.count, this.locked = false});

  final String label;

  /// A plain grey number after the label (new updates, files).
  final int? count;
  final bool locked;
}

/// Text tabs with a gold underline, no frames (like Posts / Reels / Cases).
class CaseTextTabs extends StatelessWidget {
  const CaseTextTabs({
    required this.items,
    required this.index,
    required this.onChanged,
    super.key,
  });

  final List<CaseTabItem> items;
  final int index;
  final ValueChanged<int> onChanged;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.lg),
        child: Row(
          children: [
            for (final (i, it) in items.indexed)
              Semantics(
                button: true,
                selected: i == index,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(i),
                  child: Container(
                    margin: const EdgeInsetsDirectional.only(end: 22),
                    padding: const EdgeInsets.only(top: 14, bottom: 10),
                    decoration: BoxDecoration(
                      border: Border(
                        bottom: BorderSide(
                          width: 2,
                          color: i == index ? colors.gold : Colors.transparent,
                        ),
                      ),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          it.label,
                          style: type.body.copyWith(
                            fontWeight: FontWeight.w600,
                            color:
                                i == index ? colors.text : colors.textSecondary,
                          ),
                        ),
                        if (it.locked) ...[
                          const SizedBox(width: 4),
                          AppIcon(
                            AppIcons.lockOutlineRounded,
                            size: 14,
                            color: colors.textSecondary,
                          ),
                        ],
                        if (it.count != null && it.count! > 0) ...[
                          const SizedBox(width: 5),
                          Text(
                            '${it.count}',
                            style: type.bodySmall.copyWith(
                              color: colors.textSecondary,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                        ],
                      ],
                    ),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}
