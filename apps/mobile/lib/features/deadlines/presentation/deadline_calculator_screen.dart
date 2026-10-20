import 'dart:async';
import 'dart:convert';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:lawbid/core/design_system/design_system.dart';
import 'package:lawbid/core/design_system/widgets/pickers/app_pickers.dart';
import 'package:lawbid/core/l10n/api_error_text.dart';
import 'package:lawbid/core/l10n/l10n_formats.dart';
import 'package:lawbid/core/l10n/l10n_providers.dart';
import 'package:lawbid/core/l10n/translator.dart';
import 'package:lawbid/features/cases/presentation/widgets/detail_widgets.dart';
import 'package:lawbid/features/deadlines/application/deadlines_providers.dart';
import 'package:lawbid/features/deadlines/domain/deadline_ics.dart';
import 'package:lawbid/features/deadlines/domain/deadline_models.dart';
import 'package:lawbid/features/onboarding/domain/us_states.dart';
import 'package:lawbid/features/practice/practice_options.dart';
import 'package:lawbid/features/team/application/team_providers.dart';
import 'package:lawbid/features/team/domain/team_models.dart';
import 'package:lawbid/features/verification/presentation/widgets/inline_notice.dart';
import 'package:share_plus/share_plus.dart';

/// Owner 2026-10-20 — «Сроки»: pick a state and a rule, give the date of the
/// event (service, ruling, accident…) and get the last day, moved past
/// weekends and court holidays. The count is made by the server; this
/// screen only asks and explains. Opened from «Мои» or a case (prefilled
/// with the case's state, practice and id).
class DeadlineCalculatorScreen extends ConsumerStatefulWidget {
  const DeadlineCalculatorScreen({
    super.key,
    this.state,
    this.practice,
    this.caseId,
    this.kind,
  });

  final String? state;
  final String? practice;
  final String? caseId;
  final String? kind;

  @override
  ConsumerState<DeadlineCalculatorScreen> createState() =>
      _DeadlineCalculatorScreenState();
}

class _DeadlineCalculatorScreenState
    extends ConsumerState<DeadlineCalculatorScreen> {
  late DeadlineKind _kind = DeadlineKind.parse(widget.kind);
  late String _state = (widget.state ?? '').toUpperCase();
  String? _practice;
  String? _ruleCode;
  late DateTime _date = _today();
  bool _busy = false;

  @override
  void initState() {
    super.initState();
    _practice = widget.practice;
  }

  static DateTime _today() {
    final n = DateTime.now();
    return DateTime(n.year, n.month, n.day);
  }

  Future<void> _pickState() async {
    final t = ref.read(translatorProvider);
    final picked = await showAppBottomSheet<String>(
      context: context,
      isScrollControlled: true,
      builder: (sheet) => SafeArea(
        child: ConstrainedBox(
          constraints: BoxConstraints(
            maxHeight: MediaQuery.sizeOf(sheet).height * 0.7,
          ),
          child: ListView(
            shrinkWrap: true,
            children: [
              const AppSheetHandle(),
              AppListRow(
                label: t.t('deadline.federal'),
                onTap: () => Navigator.of(sheet).pop(''),
              ),
              for (final s in kRegions)
                AppListRow(
                  label: s.name,
                  trailingText: s.code,
                  selected: s.code == _state,
                  onTap: () => Navigator.of(sheet).pop(s.code),
                ),
            ],
          ),
        ),
      ),
    );
    if (picked == null || !mounted) return;
    setState(() {
      _state = picked;
      _ruleCode = null;
    });
  }

  Future<void> _pickDate() async {
    final picked = await showAppDatePicker(
      context: context,
      initialDate: _date,
      firstDate: DateTime(1990),
      lastDate: DateTime(2100, 12, 31),
    );
    if (picked != null && mounted) {
      setState(() => _date = DateTime(picked.year, picked.month, picked.day));
    }
  }

  String _stateName(String code) => kRegions
      .firstWhere((s) => s.code == code, orElse: () => UsState(code, code))
      .name;

  /// The rules shown in the current mode (a statute list narrows to the
  /// case's practice when some rule fits it).
  List<DeadlineRule> _visible(List<DeadlineRule> all) {
    final byKind = [
      for (final r in all)
        if (r.kind == _kind) r,
    ];
    if (_kind == DeadlineKind.statute && _practice != null) {
      final narrowed = [
        for (final r in byKind)
          if (r.practiceCode == _practice) r,
      ];
      if (narrowed.isNotEmpty) return narrowed;
    }
    return byKind;
  }

  String _unit(Translator t, DeadlineRule r) => t.t('deadline.unit.${r.unit}');

  String _basis(Translator t, L10nFormats f, DeadlineResult r) => t.t(
          'deadline.basis.${r.rule.direction == 'before' ? 'before' : 'after'}',
          {
            'amount': f.digits(r.rule.amount),
            'unit': _unit(t, r.rule),
            'kind': t.t('deadline.day.${r.rule.dayType}'),
            'date': f.dateLong(r.eventDate),
          });

  String _title(Translator t, DeadlineResult r, String locale) =>
      t.t('deadline.task.title', {'rule': r.rule.label(locale)});

  String _notes(Translator t, L10nFormats f, DeadlineResult r) => [
        _basis(t, f, r),
        if (r.rule.citation != null) r.rule.citation!,
        t.t('deadline.disclaimer'),
      ].join('\n');

  Future<void> _addToPlanner(DeadlineResult r) async {
    final t = ref.read(translatorProvider);
    final f = ref.read(l10nFormatsProvider);
    setState(() => _busy = true);
    try {
      await ref.read(teamRepositoryProvider).createTask(
            TaskDraft(
              kind: TaskKind.deadline,
              title: _title(t, r, f.locale),
              notes: _notes(t, f, r),
              dueAt:
                  DateTime(r.dueDate.year, r.dueDate.month, r.dueDate.day, 9),
              caseId: widget.caseId,
              remindBeforeMin:
                  r.rule.kind == DeadlineKind.statute ? 10080 : 1440,
            ),
          );
      invalidateAllTasks(ref);
      if (mounted) showAppSnackBar(context, t.t('deadline.added'));
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _export(DeadlineResult r, Rect? origin) async {
    final t = ref.read(translatorProvider);
    final f = ref.read(l10nFormatsProvider);
    final ics = buildDeadlineIcs(
      uid: '${r.rule.code}-${deadlineDateIso(r.eventDate)}@lawbid.dev',
      title: _title(t, r, f.locale),
      date: r.dueDate,
      stamp: DateTime.now(),
      description: _notes(t, f, r),
      alarmDaysBefore: r.rule.kind == DeadlineKind.statute ? 7 : 1,
    );
    try {
      await SharePlus.instance.share(
        ShareParams(
          files: [
            XFile.fromData(
              utf8.encode(ics),
              mimeType: 'text/calendar',
              name: 'deadline.ics',
            ),
          ],
          fileNameOverrides: const ['deadline.ics'],
          sharePositionOrigin: origin,
        ),
      );
    } on Object catch (e) {
      if (mounted) showAppSnackBar(context, errorText(t, e));
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final rules = ref.watch(deadlineRulesProvider(_state));
    final visible =
        rules.value == null ? <DeadlineRule>[] : _visible(rules.value!);
    final chosen = visible.where((r) => r.code == _ruleCode).firstOrNull ??
        (visible.length == 1 ? visible.first : null);
    final query = chosen == null
        ? null
        : DeadlineQuery(chosen.code, deadlineDateIso(_date));

    return Scaffold(
      backgroundColor: colors.bg,
      appBar: AppTopBar(
        title: Text(t.t('deadline.title')),
        leading: AppBackButton(
          semanticLabel: t.t('common.back'),
          onPressed: () => Navigator.of(context).maybePop(),
        ),
      ),
      body: SafeArea(
        top: false,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenSide,
            AppSpacing.sm,
            AppSpacing.screenSide,
            AppSpacing.xxl,
          ),
          children: [
            Row(
              children: [
                Expanded(
                  child: AppChip(
                    label: t.t('deadline.kind.court'),
                    expand: true,
                    fitLabel: true,
                    selected: _kind == DeadlineKind.court,
                    onTap: () => setState(() {
                      _kind = DeadlineKind.court;
                      _ruleCode = null;
                    }),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: AppChip(
                    label: t.t('deadline.kind.statute'),
                    expand: true,
                    fitLabel: true,
                    selected: _kind == DeadlineKind.statute,
                    onTap: () => setState(() {
                      _kind = DeadlineKind.statute;
                      _ruleCode = null;
                    }),
                  ),
                ),
              ],
            ),
            DetailSection(
              title: t.t('deadline.state'),
              child: AppChip(
                key: const ValueKey('deadline-state'),
                label: _state.isEmpty
                    ? t.t('deadline.federal')
                    : _stateName(_state),
                expand: true,
                selected: _state.isNotEmpty,
                trailing: AppIcon(
                  AppIcons.expandMoreRounded,
                  size: 18,
                  color: colors.textSecondary,
                ),
                onTap: _pickState,
              ),
            ),
            if (_kind == DeadlineKind.statute && _practice != null)
              Padding(
                padding: const EdgeInsets.only(top: AppSpacing.sm),
                child: AppChip(
                  key: const ValueKey('deadline-practice'),
                  label: practiceLabel(ref, _practice!),
                  expand: true,
                  selected: true,
                  trailing: AppIcon(
                    AppIcons.closeRounded,
                    size: 18,
                    color: colors.textSecondary,
                  ),
                  onTap: () => setState(() {
                    _practice = null;
                    _ruleCode = null;
                  }),
                ),
              ),
            DetailSection(
              title: t.t('deadline.rule'),
              child: rules.when(
                loading: () => Center(
                  child: CircularProgressIndicator(color: colors.gold),
                ),
                error: (e, _) => AppErrorState(
                  message: errorText(t, e),
                  retryLabel: t.t('error.retry'),
                  onRetry: () => ref.invalidate(deadlineRulesProvider(_state)),
                ),
                data: (_) => visible.isEmpty
                    ? Text(
                        t.t('deadline.noRules'),
                        style: type.bodySmall.copyWith(
                          color: colors.textSecondary,
                        ),
                      )
                    : AppCard(
                        padding: EdgeInsets.zero,
                        child: Column(
                          children: [
                            for (final r in visible)
                              AppListRow(
                                key: ValueKey('deadline-rule-${r.code}'),
                                label: r.label(f.locale),
                                subtitle: r.citation,
                                selected: r.code == chosen?.code,
                                showChevron: false,
                                trailingText: r.jurisdiction == 'US'
                                    ? null
                                    : r.jurisdiction,
                                onTap: () => setState(() => _ruleCode = r.code),
                              ),
                          ],
                        ),
                      ),
              ),
            ),
            DetailSection(
              title: t.t('deadline.date'),
              child: AppListRow(
                key: const ValueKey('deadline-date'),
                icon: AppIcons.eventOutlined,
                label: f.dateLong(_date),
                subtitle: DateFormat.EEEE(f.locale).format(_date),
                onTap: _pickDate,
              ),
            ),
            if (query != null)
              ref.watch(deadlineResultProvider(query)).when(
                    loading: () => Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xl),
                      child: Center(
                        child: CircularProgressIndicator(color: colors.gold),
                      ),
                    ),
                    error: (e, _) => Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.xl),
                      child: AppErrorState(
                        message: errorText(t, e),
                        retryLabel: t.t('error.retry'),
                        onRetry: () =>
                            ref.invalidate(deadlineResultProvider(query)),
                      ),
                    ),
                    data: (r) => _ResultCard(
                      result: r,
                      basis: _basis(t, f, r),
                      busy: _busy,
                      onAdd: () => unawaited(_addToPlanner(r)),
                      onExport: (origin) => unawaited(_export(r, origin)),
                    ),
                  ),
            const SizedBox(height: AppSpacing.lg),
            InlineNotice(
              key: const ValueKey('deadline-disclaimer'),
              tone: NoticeTone.info,
              icon: AppIcons.infoOutlineRounded,
              message: t.t('deadline.disclaimer'),
            ),
          ],
        ),
      ),
    );
  }
}

class _ResultCard extends ConsumerWidget {
  const _ResultCard({
    required this.result,
    required this.basis,
    required this.busy,
    required this.onAdd,
    required this.onExport,
  });

  final DeadlineResult result;
  final String basis;
  final bool busy;
  final VoidCallback onAdd;
  final void Function(Rect? origin) onExport;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final t = ref.watch(translatorProvider);
    final f = ref.watch(l10nFormatsProvider);
    final colors = Theme.of(context).extension<AppColorTokens>()!;
    final type = Theme.of(context).extension<AppTypographyTokens>()!;
    final r = result;
    final note = r.rule.note(f.locale);
    final names = [for (final h in r.holidays) h.name(f.locale)]
        .where((n) => n.isNotEmpty)
        .join(', ');
    return DetailSection(
      title: t.t('deadline.result'),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Semantics(
            container: true,
            label: '${t.t('deadline.due')}: ${f.dateLong(r.dueDate)}',
            child: AppCard(
              key: const ValueKey('deadline-result'),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.t('deadline.due'),
                    style: type.caption.copyWith(color: colors.textSecondary),
                  ),
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    f.dateLong(r.dueDate),
                    style: type.titleLarge.copyWith(color: colors.text),
                  ),
                  Text(
                    DateFormat.EEEE(f.locale).format(r.dueDate),
                    style: type.body.copyWith(color: colors.goldDark),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    basis,
                    style: type.bodySmall.copyWith(color: colors.textSecondary),
                  ),
                  if (r.rule.citation != null)
                    Text(
                      r.rule.citation!,
                      style: type.caption.copyWith(color: colors.textSecondary),
                    ),
                  if (r.rolled) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      t.t('deadline.rolled', {'date': f.dateLong(r.rawDate)}),
                      style: type.bodySmall.copyWith(color: colors.text),
                    ),
                    if (names.isNotEmpty)
                      Text(
                        names,
                        style:
                            type.caption.copyWith(color: colors.textSecondary),
                      ),
                  ],
                  if (note.isNotEmpty) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      note,
                      style:
                          type.bodySmall.copyWith(color: colors.textSecondary),
                    ),
                  ],
                ],
              ),
            ),
          ),
          if (r.warnings.contains('holidays_missing')) ...[
            const SizedBox(height: AppSpacing.sm),
            InlineNotice(
              tone: NoticeTone.warning,
              icon: AppIcons.warningAmberRounded,
              message: t.t('deadline.warn.holidays'),
            ),
          ],
          if (r.warnings.contains('unverified')) ...[
            const SizedBox(height: AppSpacing.sm),
            InlineNotice(
              tone: NoticeTone.warning,
              icon: AppIcons.warningAmberRounded,
              message: t.t(
                r.rule.kind == DeadlineKind.statute
                    ? 'deadline.warn.statute'
                    : 'deadline.warn.court',
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.md),
          AppButton(
            key: const ValueKey('deadline-add'),
            label: t.t('deadline.add'),
            icon: AppIcons.eventAvailableRounded,
            isLoading: busy,
            onPressed: onAdd,
          ),
          const SizedBox(height: AppSpacing.sm),
          Builder(
            builder: (btn) => AppButton(
              key: const ValueKey('deadline-export'),
              label: t.t('deadline.export'),
              icon: AppIcons.iosShareRounded,
              variant: AppButtonVariant.secondary,
              onPressed: () {
                final box = btn.findRenderObject() as RenderBox?;
                onExport(
                  box == null
                      ? null
                      : box.localToGlobal(Offset.zero) & box.size,
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}
