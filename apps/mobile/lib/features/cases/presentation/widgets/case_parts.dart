import 'package:flutter/material.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_format.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_status.dart';
import 'package:lawbid/features/cases/presentation/widgets/case_urgency_picker.dart';
import 'package:lawbid/features/cases/presentation/widgets/practice_art.dart';

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
    this.accent,
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

  /// Owner 2026-10-15: the practice's colour for the main chip.
  final Color? accent;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final dark = Theme.of(context).brightness == Brightness.dark;
    Widget chip(String label, {bool main = false, bool ok = false}) =>
        Container(
          padding: EdgeInsets.symmetric(horizontal: 8, vertical: dense ? 3 : 4),
          decoration: BoxDecoration(
            color: ok
                ? colors.success.withValues(alpha: 0.16)
                : main
                    ? (accent ?? (dark ? colors.border : colors.navy))
                    : colors.chip,
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(
            label,
            maxLines: dense ? 1 : 2,
            style: (dense ? type.bodySmall : type.caption).copyWith(
              fontWeight: FontWeight.w600,
              color: ok
                  ? colors.successText
                  : main
                      ? (accent == null
                          ? Colors.white
                          : onPracticeAccent(accent!))
                      : colors.text,
            ),
          ),
        );
    final chips = [
      if (status != null) chip(status!, ok: true),
      for (final (i, l) in labels.indexed)
        chip(l, main: i == 0 && status == null),
    ];
    // Owner 2026-10-15: the detail screens wrap the chips onto a second
    // line instead of cutting them at the edge; the feed card keeps one
    // scrolling line.
    if (!dense) {
      return Padding(
        padding: padding,
        child: Wrap(spacing: 6, runSpacing: 6, children: chips),
      );
    }
    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      padding: padding,
      physics: const ClampingScrollPhysics(),
      child: Row(
        children: [
          for (final (i, c) in chips.indexed) ...[
            if (i > 0) const SizedBox(width: 6),
            c,
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
    if (text.trim().isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: padding,
      child: LayoutBuilder(
        builder: (context, box) {
          final clamp = lines;
          if (clamp == null) return Text(text, style: style);
          final measured = DefaultTextStyle.of(context).style.merge(style);
          final painter = TextPainter(
            text: TextSpan(text: text, style: measured),
            textDirection: Directionality.of(context),
            textScaler: MediaQuery.textScalerOf(context),
            maxLines: clamp,
          )..layout(maxWidth: box.maxWidth);
          if (!painter.didExceedMaxLines) return Text(text, style: style);
          // Owner 2026-10-15: "more" ends the last line inside the text
          // (nothing is drawn over it, so it reads on any theme, glass too):
          // the longest start of the text that, followed by "… more", still
          // fits [clamp] lines.
          final tail = '… $moreLabel';
          bool fits(int n) {
            final p = TextPainter(
              text: TextSpan(
                text: text.substring(0, n) + tail,
                style: measured,
              ),
              textDirection: Directionality.of(context),
              textScaler: MediaQuery.textScalerOf(context),
              maxLines: clamp,
            )..layout(maxWidth: box.maxWidth);
            return !p.didExceedMaxLines;
          }

          var lo = 0;
          var hi = text.length;
          while (lo < hi) {
            final mid = (lo + hi + 1) ~/ 2;
            if (fits(mid)) {
              lo = mid;
            } else {
              hi = mid - 1;
            }
          }
          // A couple of characters of slack: the measured and the drawn
          // text differ by a hair (kerning at the line end).
          final head = text.substring(0, lo > 3 ? lo - 3 : 0).trimRight();
          return GestureDetector(
            onTap: onMore,
            behavior: HitTestBehavior.opaque,
            child: Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: '$head… '),
                  TextSpan(
                    text: moreLabel,
                    style: TextStyle(color: colors.textSecondary),
                  ),
                ],
                style: style,
              ),
              maxLines: clamp,
            ),
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
class CaseTextTabs extends StatefulWidget {
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
  State<CaseTextTabs> createState() => _CaseTextTabsState();
}

class _CaseTextTabsState extends State<CaseTextTabs> {
  late List<GlobalKey> _keys =
      List.generate(widget.items.length, (_) => GlobalKey());

  @override
  void didUpdateWidget(CaseTextTabs old) {
    super.didUpdateWidget(old);
    if (_keys.length != widget.items.length) {
      _keys = List.generate(widget.items.length, (_) => GlobalKey());
    }
    // Owner 2026-10-15: the chosen tab slides to the middle, never cut off.
    if (old.index != widget.index) {
      WidgetsBinding.instance.addPostFrameCallback((_) {
        final ctx =
            _keys[widget.index.clamp(0, _keys.length - 1)].currentContext;
        if (ctx != null && ctx.mounted) {
          Scrollable.ensureVisible(
            ctx,
            alignment: 0.5,
            duration: const Duration(milliseconds: 200),
          );
        }
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final items = widget.items;
    final index = widget.index;
    final onChanged = widget.onChanged;
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    return DecoratedBox(
      decoration: BoxDecoration(
        border: Border(bottom: BorderSide(color: colors.border)),
      ),
      child: SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: AppSpacing.screenSide),
        child: Row(
          children: [
            for (final (i, it) in items.indexed)
              Semantics(
                key: _keys[i],
                button: true,
                selected: i == index,
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onChanged(i),
                  child: Container(
                    // Owner 2026-10-15: smaller tabs, like Instagram — 13sp
                    // (the active one semibold), ~44dp high, 2dp indicator.
                    margin: const EdgeInsetsDirectional.only(end: 18),
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
                          style: type.bodySmall.copyWith(
                            fontWeight:
                                i == index ? FontWeight.w600 : FontWeight.w500,
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
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6),
                            decoration: BoxDecoration(
                              color: colors.chip,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              context.digits(it.count ?? 0),
                              style: type.caption.copyWith(
                                color: colors.text,
                                fontWeight: FontWeight.w600,
                              ),
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

/// Owner 2026-10-15 («Экран кейса», the approved mockup): the head of a case
/// for both sides — a header tinted with the practice colour (icon and name,
/// the status), the title in two lines at most, the deadline / budget / state
/// as chips, and the five-stage scale with «Stage N of 5: name».
class CaseHero extends StatelessWidget {
  const CaseHero({
    required this.t,
    required this.formats,
    required this.practiceName,
    required this.categoryCode,
    required this.statusLabel,
    required this.statusTone,
    required this.title,
    required this.states,
    required this.budget,
    required this.urgency,
    required this.stage,
    required this.publishedAt,
    super.key,
  });

  final Translator t;
  final L10nFormats formats;
  final String practiceName;
  final String? categoryCode;
  final String statusLabel;
  final StatusTone statusTone;
  final String title;
  final List<String> states;
  final CaseBudget budget;
  final CaseUrgencyInfo urgency;

  /// 0..4 (the Active card's scale).
  final int stage;
  final DateTime publishedAt;

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final base = practiceCardBase(colors);
    final accent = practiceAccent(categoryCode, surface: base);
    final top = Color.alphaBlend(accent.withValues(alpha: 0.2), base);
    final fg = readableOn(accent, top);
    final money = budget.isClarifyLater
        ? t.t('cases.facts.negotiable')
        : CaseFormat.money(formats, budget.amountCents!);
    final deadline = CaseUrgencyText.label(t, formats, urgency);
    Widget fact(IconData icon, String text) => Container(
          height: 26,
          padding: const EdgeInsets.symmetric(horizontal: 9),
          decoration: BoxDecoration(
            color: colors.text.withValues(alpha: 0.06),
            borderRadius: BorderRadius.circular(13),
          ),
          child: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              AppIcon(icon, size: 14, color: colors.textSecondary),
              const SizedBox(width: 5),
              Flexible(
                child: Text(
                  text,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.text),
                ),
              ),
            ],
          ),
        );
    final lit = stage.clamp(0, 4) + 1;
    return Container(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.lg,
        AppSpacing.sm,
        AppSpacing.lg,
        AppSpacing.md,
      ),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: [top, base],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            children: [
              AppIcon(practiceGlyph(categoryCode), size: 15, color: fg),
              const SizedBox(width: 7),
              Expanded(
                child: Text(
                  practiceName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption
                      .copyWith(color: fg, fontWeight: FontWeight.w600),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              ConstrainedBox(
                constraints: BoxConstraints(
                  maxWidth: MediaQuery.sizeOf(context).width * 0.5,
                ),
                child: StatusPill(label: statusLabel, tone: statusTone),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Semantics(
            header: true,
            child: Text(
              title,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: type.titleMedium.copyWith(
                color: colors.text,
                fontWeight: FontWeight.w600,
                height: 1.25,
              ),
            ),
          ),
          const SizedBox(height: 9),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              fact(AppIcons.scheduleRounded, deadline),
              fact(AppIcons.sellOutlined, money),
              fact(AppIcons.placeOutlined, CaseFigures.statesText(states)),
            ],
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              for (var i = 0; i < 5; i++) ...[
                if (i > 0) const SizedBox(width: 4),
                Expanded(
                  child: Container(
                    height: 4,
                    decoration: BoxDecoration(
                      color: i < lit ? accent : colors.border,
                      borderRadius: BorderRadius.circular(2),
                    ),
                  ),
                ),
              ],
            ],
          ),
          const SizedBox(height: 5),
          Row(
            children: [
              Expanded(
                child: Text(
                  t.t('cases.hero.stage', {
                    'n': '$lit',
                    'name': t.t('cases.stage.${lit - 1}'),
                  }),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(
                    color: colors.text,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
              const SizedBox(width: AppSpacing.sm),
              Flexible(
                child: Text(
                  t.t('cases.hero.published', {
                    'date': formats.dayMonth(publishedAt),
                  }),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: type.caption.copyWith(color: colors.textSecondary),
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }
}
