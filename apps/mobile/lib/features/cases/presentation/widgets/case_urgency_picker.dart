import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/application/cases_providers.dart';
import 'package:lawbid/features/cases/domain/case_draft.dart';
import 'package:lawbid/features/cases/domain/case_models.dart';

/// Owner 2026-10-05: how a case's urgency reads — a level, or the date
/// with what it is and how far off it is. One place for the cards, the
/// case screens and the wizard summary.
abstract final class CaseUrgencyText {
  /// The main line: the date (`Nov 3`) or the level; "Not set" otherwise.
  static String label(Translator t, L10nFormats f, CaseUrgencyInfo u) {
    final d = u.deadline;
    if (d != null) return f.dayMonth(d);
    return levelLabel(t, u.shownLevel);
  }

  static String levelLabel(Translator t, CaseUrgencyLevel? level) =>
      switch (level) {
        CaseUrgencyLevel.flexible => t.t('cases.urgency.flexible'),
        CaseUrgencyLevel.withinMonth => t.t('cases.urgency.within_month'),
        CaseUrgencyLevel.soon => t.t('cases.urgency.soon'),
        CaseUrgencyLevel.urgent => t.t('cases.urgency.urgent'),
        CaseUrgencyLevel.veryUrgent => t.t('cases.urgency.very_urgent'),
        CaseUrgencyLevel.overdue => t.t('cases.urgency.overdue'),
        _ => t.t('cases.facts.notSet'),
      };

  /// How far off the date is: today / tomorrow / in N days / passed.
  static String? relative(Translator t, CaseUrgencyInfo u, [DateTime? now]) {
    final days = u.daysLeft(now);
    if (days == null) return null;
    if (days < 0) return t.t('cases.urgency.overdue');
    if (days == 0) return t.t('cases.deadline.today');
    if (days == 1) return t.t('cases.deadline.tomorrow');
    return t.plural('cases.deadline.inDays', days);
  }

  static String kindLabel(Translator t, String kind) =>
      t.t('cases.deadline.kind.$kind');

  /// The line under the main one: what the date is and how far off.
  static String? sub(Translator t, CaseUrgencyInfo u, [DateTime? now]) {
    if (u.deadline == null) return null;
    return [
      if (u.kind != null) kindLabel(t, u.kind!.json!),
      relative(t, u, now),
    ].whereType<String>().join(' · ');
  }

  /// Everything in one phrase (summary rows, screen readers).
  static String full(
    Translator t,
    L10nFormats f,
    CaseUrgencyInfo u, [
    DateTime? now,
  ]) {
    final s = sub(t, u, now);
    return s == null || s.isEmpty ? label(t, f, u) : '${label(t, f, u)}, $s';
  }

  static Color tone(
    AppColorTokens colors,
    CaseUrgencyInfo u, {
    bool light = true,
  }) =>
      switch (u.shownLevel) {
        CaseUrgencyLevel.veryUrgent ||
        CaseUrgencyLevel.urgent ||
        CaseUrgencyLevel.overdue =>
          colors.danger,
        CaseUrgencyLevel.soon => light ? colors.goldDark : colors.gold,
        _ => colors.textSecondary,
      };
}

/// The picker's value: a level, or `by_date` with the day and its kind.
@immutable
class CaseUrgencyChoice {
  const CaseUrgencyChoice({required this.urgency, this.deadline, this.kind});

  factory CaseUrgencyChoice.ofDraft(CaseDraft d) => CaseUrgencyChoice(
        urgency: d.urgency ?? kDefaultCaseUrgency,
        deadline: parseIsoDay(d.deadlineAt),
        kind: d.deadlineKind,
      );

  factory CaseUrgencyChoice.ofInfo(CaseUrgencyInfo u) => CaseUrgencyChoice(
        urgency: u.deadline != null
            ? 'by_date'
            : (u.choice?.json ?? kDefaultCaseUrgency),
        deadline: u.deadline,
        kind: u.kind?.json,
      );

  final String urgency;
  final DateTime? deadline;
  final String? kind;

  bool get isDated => urgency == 'by_date';
  bool get valid => !isDated || deadline != null;

  /// Clears the old date first, so an unpicked kind or date really goes.
  CaseDraft applyTo(CaseDraft d) {
    final cleared = d.copyWith(urgency: urgency, clearDeadline: true);
    if (!isDated) return cleared;
    return cleared.copyWith(
      deadlineAt: deadline == null ? null : isoDay(deadline!),
      deadlineKind: kind,
    );
  }
}

/// Owner 2026-10-05: the urgency picker — one row per level (a short
/// hint under each, so long translations wrap instead of squeezing a
/// segmented control) and "By a date", which opens the date and its kind.
class CaseUrgencyPicker extends ConsumerWidget {
  const CaseUrgencyPicker({
    required this.value,
    required this.onChanged,
    this.showDateError = false,
    super.key,
  });

  final CaseUrgencyChoice value;
  final ValueChanged<CaseUrgencyChoice> onChanged;
  final bool showDateError;

  Future<void> _pickDate(BuildContext context) async {
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final current = value.deadline;
    final picked = await showDatePicker(
      context: context,
      initialDate:
          current != null && !current.isBefore(today) ? current : today,
      firstDate: today,
      lastDate: today.add(const Duration(days: kCaseDeadlineMaxDays)),
    );
    if (picked == null) return;
    onChanged(
      CaseUrgencyChoice(
        urgency: 'by_date',
        deadline: DateTime(picked.year, picked.month, picked.day),
        kind: value.kind,
      ),
    );
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;

    Widget option(String key) {
      final selected = value.urgency == key;
      final urgent = key == 'urgent' || key == 'very_urgent';
      return Semantics(
        button: true,
        selected: selected,
        label:
            '${t.t('cases.urgency.$key')}. ${t.t('cases.urgency.hint.$key')}',
        excludeSemantics: true,
        child: AppPressable(
          onTap: () => onChanged(
            key == 'by_date'
                ? CaseUrgencyChoice(
                    urgency: key,
                    deadline: value.deadline,
                    kind: value.kind,
                  )
                : CaseUrgencyChoice(urgency: key),
          ),
          child: AnimatedContainer(
            duration:
                context.reduceMotion ? Duration.zero : AppMotion.stateChange,
            padding: const EdgeInsets.symmetric(
              horizontal: AppSpacing.md,
              vertical: AppSpacing.sm + 2,
            ),
            decoration: BoxDecoration(
              color: selected
                  ? Color.alphaBlend(colors.goldTint, colors.surface)
                  : colors.surface,
              borderRadius: BorderRadius.circular(AppRadii.field),
              border: Border.all(
                color: selected ? colors.gold : colors.border,
                width: selected ? 1.5 : 1,
              ),
            ),
            child: Row(
              children: [
                AppIcon(
                  selected
                      ? AppIcons.radioButtonCheckedRounded
                      : AppIcons.radioButtonUncheckedRounded,
                  size: 20,
                  color: selected ? colors.goldDark : colors.textSecondary,
                ),
                const SizedBox(width: AppSpacing.md),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        t.t('cases.urgency.$key'),
                        style: typography.body.copyWith(
                          color:
                              urgent && selected ? colors.danger : colors.text,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        t.t('cases.urgency.hint.$key'),
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                    ],
                  ),
                ),
                if (key == 'by_date') ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppIcon(
                    AppIcons.eventOutlined,
                    size: 20,
                    color: colors.textSecondary,
                  ),
                ] else if (urgent) ...[
                  const SizedBox(width: AppSpacing.sm),
                  AppIcon(
                    AppIcons.timerOutlined,
                    size: 20,
                    color: colors.textSecondary,
                  ),
                ],
              ],
            ),
          ),
        ),
      );
    }

    final deadline = value.deadline;
    final info = CaseUrgencyInfo(deadline: deadline);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        for (final key in kCaseUrgencyChoices) ...[
          option(key),
          const SizedBox(height: AppSpacing.sm),
        ],
        if (value.isDated) ...[
          const SizedBox(height: AppSpacing.xs),
          Semantics(
            button: true,
            label: deadline == null
                ? t.t('cases.deadline.pick')
                : '${t.t('cases.deadline.date')}: '
                    '${formats.dateLong(deadline)}',
            excludeSemantics: true,
            child: AppPressable(
              onTap: () => _pickDate(context),
              child: Container(
                constraints: const BoxConstraints(minHeight: 52),
                padding: const EdgeInsets.symmetric(
                  horizontal: AppSpacing.lg,
                  vertical: AppSpacing.sm,
                ),
                decoration: BoxDecoration(
                  color: colors.surface,
                  borderRadius: BorderRadius.circular(AppRadii.field),
                  border: Border.all(
                    color: showDateError && deadline == null
                        ? colors.danger
                        : colors.border,
                  ),
                ),
                child: Row(
                  children: [
                    AppIcon(AppIcons.eventOutlined, color: colors.goldDark),
                    const SizedBox(width: AppSpacing.md),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            deadline == null
                                ? t.t('cases.deadline.pick')
                                : formats.dateLong(deadline),
                            style: typography.body.copyWith(
                              color: deadline == null
                                  ? colors.textSecondary
                                  : colors.text,
                              fontWeight: FontWeight.w600,
                            ),
                          ),
                          if (deadline != null)
                            Text(
                              CaseUrgencyText.relative(t, info) ?? '',
                              style: typography.caption
                                  .copyWith(color: colors.textSecondary),
                            ),
                        ],
                      ),
                    ),
                    AppIcon(
                      AppIcons.expandMoreRounded,
                      color: colors.textSecondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
          if (showDateError && deadline == null) ...[
            const SizedBox(height: AppSpacing.xs),
            Text(
              t.t('cases.deadline.required'),
              style: typography.caption.copyWith(color: colors.danger),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          Text(
            t.t('cases.deadline.kindTitle'),
            style: typography.bodySmall.copyWith(color: colors.textSecondary),
          ),
          const SizedBox(height: AppSpacing.sm),
          // Wraps: chips never shrink for long translations.
          Wrap(
            spacing: AppSpacing.sm,
            runSpacing: AppSpacing.sm,
            children: [
              for (final kind in kCaseDeadlineKinds)
                AppChip(
                  label: CaseUrgencyText.kindLabel(t, kind),
                  selected: value.kind == kind,
                  onTap: () => onChanged(
                    CaseUrgencyChoice(
                      urgency: 'by_date',
                      deadline: value.deadline,
                      kind: value.kind == kind ? null : kind,
                    ),
                  ),
                ),
            ],
          ),
        ],
      ],
    );
  }
}

/// Owner 2026-10-05: "Change date" on a case — the client while the case
/// is open or in work, the hired attorney after hiring. Returns true when
/// saved (the other side is told by the server).
Future<bool> showCaseUrgencySheet(
  BuildContext context, {
  required String caseId,
  required CaseUrgencyInfo current,
  bool hired = false,
}) async {
  final saved = await showAppBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    builder: (_) => _UrgencySheet(
      caseId: caseId,
      initial: CaseUrgencyChoice.ofInfo(current),
      hired: hired,
    ),
  );
  return saved ?? false;
}

class _UrgencySheet extends ConsumerStatefulWidget {
  const _UrgencySheet({
    required this.caseId,
    required this.initial,
    required this.hired,
  });

  final String caseId;
  final CaseUrgencyChoice initial;
  final bool hired;

  @override
  ConsumerState<_UrgencySheet> createState() => _UrgencySheetState();
}

class _UrgencySheetState extends ConsumerState<_UrgencySheet> {
  late CaseUrgencyChoice _value = widget.initial;
  bool _busy = false;
  bool _tried = false;
  String? _error;

  Future<void> _save() async {
    setState(() => _tried = true);
    if (!_value.valid) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final t = ref.read(translatorProvider);
    try {
      await ref.read(casesRepositoryProvider).setCaseUrgency(
            widget.caseId,
            urgency: _value.urgency,
            deadline: _value.deadline,
            deadlineKind: _value.kind,
          );
      if (mounted) Navigator.of(context).pop(true);
    } on Object catch (e) {
      if (mounted) {
        setState(() {
          _busy = false;
          _error = errorText(t, e);
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final t = ref.watch(translatorProvider);
    return Padding(
      padding: EdgeInsets.only(bottom: MediaQuery.viewInsetsOf(context).bottom),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.md,
            AppSpacing.screenSide,
            AppSpacing.xl,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Center(child: AppSheetHandle()),
              const SizedBox(height: AppSpacing.lg),
              Text(
                t.t('cases.deadline.editTitle'),
                style: typography.titleMedium.copyWith(color: colors.text),
              ),
              if (widget.hired) ...[
                const SizedBox(height: AppSpacing.xs),
                Text(
                  t.t('cases.deadline.otherSideTold'),
                  style: typography.bodySmall
                      .copyWith(color: colors.textSecondary),
                ),
              ],
              const SizedBox(height: AppSpacing.lg),
              CaseUrgencyPicker(
                value: _value,
                showDateError: _tried,
                onChanged: (v) => setState(() => _value = v),
              ),
              if (_error != null) ...[
                const SizedBox(height: AppSpacing.md),
                Text(
                  _error!,
                  style: typography.bodySmall.copyWith(color: colors.danger),
                ),
              ],
              const SizedBox(height: AppSpacing.xl),
              AppButton(
                label: t.t('cases.deadline.save'),
                isLoading: _busy,
                onPressed: _save,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Owner 2026-10-05: the urgency on a case screen — the level or the date
/// with its kind and how far off, and "Change" for whoever may move it.
class CaseUrgencyRow extends ConsumerWidget {
  const CaseUrgencyRow({
    required this.caseId,
    required this.info,
    required this.canEdit,
    this.hired = false,
    this.onSaved,
    super.key,
  });

  final String caseId;
  final CaseUrgencyInfo info;
  final bool canEdit;
  final bool hired;
  final VoidCallback? onSaved;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final formats = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final typography = Theme.of(context).extension<AppTypographyTokens>()!;
    final light = Theme.of(context).brightness == Brightness.light;
    final tone = CaseUrgencyText.tone(colors, info, light: light);
    final sub = CaseUrgencyText.sub(t, info);
    final label = info.deadline != null
        ? formats.dateLong(info.deadline!)
        : CaseUrgencyText.label(t, formats, info);
    return Semantics(
      label: '${t.t('cases.facts.urgency')}: '
          '${CaseUrgencyText.full(t, formats, info)}',
      child: Padding(
        padding: const EdgeInsets.symmetric(vertical: AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            AppIcon(
              info.deadline != null
                  ? AppIcons.eventOutlined
                  : AppIcons.timerOutlined,
              size: AppSizes.iconSm,
              color: info.isUrgent ? colors.danger : colors.goldDark,
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: ExcludeSemantics(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      t.t('cases.facts.urgency'),
                      style: typography.caption
                          .copyWith(color: colors.textSecondary),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      label,
                      style: typography.body.copyWith(
                        color: info.isSet ? tone : colors.text,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    if (sub != null && sub.isNotEmpty)
                      Text(
                        sub,
                        style: typography.caption
                            .copyWith(color: colors.textSecondary),
                      ),
                  ],
                ),
              ),
            ),
            if (canEdit) ...[
              const SizedBox(width: AppSpacing.sm),
              TextButton(
                onPressed: () async {
                  final ok = await showCaseUrgencySheet(
                    context,
                    caseId: caseId,
                    current: info,
                    hired: hired,
                  );
                  if (!ok || !context.mounted) return;
                  showAppSnackBar(context, t.t('cases.deadline.saved'));
                  onSaved?.call();
                },
                child: Text(
                  t.t('cases.deadline.change'),
                  style: typography.bodySmall.copyWith(
                    color: colors.goldDark,
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
